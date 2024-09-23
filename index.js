const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { deployCommands } = require('./deploy-commands');
const { users, saveUserData, getUser, getAllUsers, updateUser, initializeUser, initializeGuild, saveGuildData, getGuild, updateGuild, getUsersInGuild, addUserToGuild } = require('./dataManager');
const { updateBotStatus } = require('./utils/botStatus');
const numberFormat = require('./utils/numberFormat');
const guildDM = require('./utils/guildDM');
const mineRegions = require('./config/mineRegions.json').regions;
const continentData = require('./config/continentData.json').continents;
const supabase = require('./utils/supabaseClient');
const EventEmitter = require('events').EventEmitter;
EventEmitter.defaultMaxListeners = 20;

// Load environment variables from .env file
dotenv.config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: for guild-specific commands
const prefixes = ['im!', 'IM!', 'Im!'];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageTyping // Ensure this intent is included if you use message typing events
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.interactions = new Collection();

// Load prefix commands
const prefixCommandFiles = fs.readdirSync(path.join(__dirname, 'commands/prefix')).filter(file => file.endsWith('.js'));
for (const file of prefixCommandFiles) {
    const command = require(path.join(__dirname, 'commands/prefix', file));
    client.commands.set(command.name, command);
    if (command.aliases) {
        command.aliases.forEach(alias => client.commands.set(alias, command));
    }
}

// Load slash commands
const slashCommandFiles = fs.readdirSync(path.join(__dirname, 'commands/slash')).filter(file => file.endsWith('.js'));
for (const file of slashCommandFiles) {
    const command = require(path.join(__dirname, 'commands/slash', file));
    client.slashCommands.set(command.data.name, command);
}

// Schedule updates regularly
async function scheduleNextUpdate(client) {
    cron.schedule('*/10 * * * * *', async () => {
        await handleMissingData(); // Run every 10 seconds
    });
	
	// Check barrier unlock time every 10 seconds
    cron.schedule('*/10 * * * * *', async () => {
        await handleBarrierUnlockTime(); // Run every 10 seconds
    });
	
	// Schedule boost timer updates every minute
    cron.schedule('*/60 * * * * *', async () => {
        await handleBoostTimers(); // Run every minute
    });
	
	// Schedule manager work for all users every 10 seconds
    cron.schedule('*/15 * * * * *', async () => {
        try {
            const allUsers = await getAllUsers(); // Retrieve all users
            for (const userId in allUsers) {
                try {
                    const user = allUsers[userId];
                    await handleManagerWork(user, userId);
                } catch (userError) {
                    console.warn(`Manager work for user ${userId} failed.`, userError);
                    continue; // Continue to the next user even if one fails
                }
            }
        } catch (error) {
            console.error('Error fetching or handling users:', error);
        }
    });
}

// Function to start manager work
async function handleManagerWork(user, userId) {
    if (!user) {
        console.error('User data is undefined or invalid.');
        return;
    }

    // Initialize user properties if not present
    user.mines = user.mines || [];
    user.cash = user.cash || 0;
    user.idle_cash = user.idle_cash || 0;
    user.last_idle = user.last_idle || Date.now();
    user.current_mine = user.current_mine || (user.mines.length > 0 ? user.mines[0].mine_name : null);

    const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
    if (!currentMine) {
        console.error(`Current mine data for user ${userId} not found.`);
        return;
    }

    currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };
    currentMine.mineshafts = currentMine.mineshafts || [];
    currentMine.elevator = currentMine.elevator || [];
    currentMine.warehouse = currentMine.warehouse || [];

    if (currentMine.mineshafts.length === 0) {
        return; // No workers in the mineshafts
    }

    // Handle cash production
    async function produceCash(isIdle = false) {
        try {
            const productionRate = currentMine.factor || 1;
            const shaftsCount = currentMine.mineshafts.length;
            let totalGainPerSecond = 0;

            currentMine.mineshafts.forEach(shaft => {
                if (shaft.gain_per_second_per_worker && shaft.number_of_workers) {
                    totalGainPerSecond += (shaft.gain_per_second_per_worker * shaft.number_of_workers);
                }
            });

            // Ensure all managers are assigned before producing cash
            const shaftManagerAssigned = currentMine.managers?.shaft?.some(m => m.assigned);
            const elevatorManagerAssigned = currentMine.managers?.elevator?.some(m => m.assigned);
            const warehouseManagerAssigned = currentMine.managers?.warehouse?.some(m => m.assigned);

            if (shaftManagerAssigned && elevatorManagerAssigned && warehouseManagerAssigned) {
                const efficiency = isIdle ? 0.1 : 1.0;
                const cashProduced = totalGainPerSecond * productionRate * efficiency;

                // Apply boost factors
                const totalIncomeFactor = (user.active_boosts && user.active_boosts.length > 0)
                    ? user.active_boosts.reduce((total, boost) => total + boost.income_factor, 1)
                    : 1;
					
				// Apply premium boost if the user is premium
                const premiumBoost = user.has_premium ? 2 : 1;

                const multiplier = 15;
                const adjustedCashProduced = cashProduced * totalIncomeFactor * premiumBoost * multiplier;

                // Add to either active cash or idle cash
                if (isIdle) {
                    user.idle_cash += adjustedCashProduced;
                } else {
                    user.cash += adjustedCashProduced;
                }
            }
        } catch (error) {
            console.error('Error producing cash:', error);
        }
    }

    const currentTime = Date.now();
    const lastActivityTime = user.last_idle;
    const isIdle = currentTime - lastActivityTime > 10 * 60 * 1000; // Idle if inactive for over 10 minutes

    await produceCash(isIdle);

    try {
        await updateUser(userId, {
            cash: user.cash,
            idle_cash: user.idle_cash,
            last_idle: user.last_idle,
            mines: user.mines
        });
    } catch (error) {
        console.error('Error updating user data:', error);
    }
}

// Function to handle missing data for all users
async function handleMissingData() {
    try {
        const allUsers = await getAllUsers();
        for (const userId in allUsers) {
            const user = allUsers[userId];

            user.username = user.username || 'Unknown';
            user.user_id = user.user_id || userId;
            user.continents = user.continents || [continentData[0]];
            user.mines = user.mines || [];
            user.cash = user.cash || 0;
            user.ice_cash = user.ice_cash || 0;
            user.fire_cash = user.fire_cash || 0;
            user.idle_cash = user.idle_cash || 0;
            user.idle_ice_cash = user.idle_ice_cash || 0;
            user.idle_fire_cash = user.idle_fire_cash || 0;
            user.super_cash = user.super_cash || 0;
            user.streak = user.streak || 0;
            user.last_daily = user.last_daily || Date.now();
            user.last_idle = user.last_idle || Date.now();
			user.has_premium = user.has_premium || false,
            user.current_continent = user.current_continent || 'Start Continent';
            user.current_mine = user.current_mine || (user.mines.length > 0 ? user.mines[0].mine_name : null);

            for (const mine of user.mines) {
                mine.prestige_count = mine.prestige_count || 0;
                mine.mine_number = mine.mine_number || 1;
                mine.factor = mine.factor || 1;
                mine.mineshafts = mine.mineshafts || [];
                mine.elevator = mine.elevator || [];
                mine.warehouse = mine.warehouse || [];
                mine.managers = mine.managers || { shaft: [], elevator: [], warehouse: [] };

                // Handle missing barriers
                if (!mine.barriers || mine.barriers.length < mineRegions.length) {
                    mine.barriers = mine.barriers || [];

                    // Ensure all barriers are initialized or restored
                    mineRegions.forEach((region, index) => {
                        if (!mine.barriers[index]) {
                            mine.barriers[index] = {
                                ...region,
                                unlocked: index === 0  // First barrier unlocked by default
                            };
                        }
                    });
                }
            }

            await updateUser(userId, user);
        }
    } catch (error) {
        console.error('Error handling missing data for users:', error);
    }
}

// Function to handle barrier unlock time
async function handleBarrierUnlockTime() {
    try {
        const allUsers = await getAllUsers();

        for (const userId in allUsers) {
            const user = allUsers[userId];

            user.mines.forEach(mine => {
                // Initialize or restore missing barriers
                if (!mine.barriers || mine.barriers.length < mineRegions.length) {
                    mine.barriers = mine.barriers || [];
                    
                    // Restore missing barriers
                    mineRegions.forEach((region, index) => {
                        if (!mine.barriers[index]) {
                            mine.barriers[index] = {
                                ...region,
                                unlocked: index === 0  // First barrier unlocked by default
                            };
                        }
                    });
                }

                // Handle unlock times for each barrier
                mine.barriers.forEach(barrier => {
                    if (barrier.unlock_time && Date.now() >= barrier.unlock_time) {
                        barrier.unlocked = true;
                        barrier.unlock_time = null;
                    }
                });
            });

            await updateUser(userId, user);
        }
    } catch (error) {
        console.error('Error handling barrier unlock time:', error);
    }
}

// Function to handle boost timers
async function handleBoostTimers() {
    try {
        const allUsers = await getAllUsers();

        for (const userId in allUsers) {
            const user = allUsers[userId];
            
            // Initialize active boosts if they don't exist
            if (!user.active_boosts) {
                user.active_boosts = [];
            }
            
            // Filter out expired boosters
            user.active_boosts = user.active_boosts.filter(boost => boost.end_time > Date.now());

            // Update the user data
            await updateUser(userId, user);
        }
    } catch (error) {
        console.error('Error handling boost timers:', error);
    }
}

// Function to check if the bot is online based on the readyAt property
async function isBotOnline(client) {
    if (client.readyAt) {
        return true; // Bot is online if readyAt is set
    } else {
        console.warn('Bot is not ready or offline.');
        return false;
    }
}

// Retry mechanism for status check
async function retryOnlineCheck(client, retries = 5) {
    let isOnline = await isBotOnline(client);
    while (!isOnline && retries > 0) {
        console.warn(`Retrying online check... (${retries} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        isOnline = await isBotOnline(client);
        retries--;
    }
    return isOnline;
}

// Main function to initialize bot tasks when online
async function initializeBotTasks(client) {
    const isOnline = await retryOnlineCheck(client);
    if (isOnline) {
        console.log('Bot is confirmed to be online. Proceeding with updates.');
		
		// Updates the bot status
        await updateBotStatus(client);

        // Deploy slash commands on bot startup
        await deployCommands(clientId, token, client.slashCommands);

        // Load and initialize guild data
        await scheduleNextUpdate(client);
    } else {
        console.error('Failed to confirm bot online status after multiple retries. Skipping updates.');
    }
}

client.once('ready', async () => {
    console.log('Bot is online!');
    console.log(`Logged in as ${client.user.tag}`);

    // Check if the bot is online and proceed with task initialization
    await initializeBotTasks(client);
});

client.on('guildCreate', async (guild) => {
    // Get the user who added the bot to the guild
    const owner = await guild.fetchOwner();

    try {
        // Send a DM to the owner
        await guildDM(owner.user, `Thank you for adding me to ${guild.name}! I'm here to help you manage your mining experience for your entire guild. Use im!help to see what I can do!`);
    } catch (error) {
        console.error(`Could not send DM to ${owner.user.tag}:`, error);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Determine if message starts with a valid prefix or mentions the bot
    let prefix = prefixes.find(p => message.content.startsWith(p));
    const botMention = `<@${client.user.id}>`;
    if (!prefix && !message.content.includes(botMention)) return;

    // Handle idle cash collection if the user mentions the bot
    if (message.content.includes(botMention)) {
        const userId = message.author.id;
        const user = await getUser(userId);
        if (user) {
            const currentTime = Date.now();
            const isIdle = currentTime - user.last_idle > 10 * 60 * 1000;

            if (isIdle) {
                const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
                if (!currentMine) {
                    return message.reply('Current mine data not found.');
                }

                await handleManagerWork(user, userId);
				await message.reply(`You have collected ${numberFormat(user.idle_cash)} cash from your idle workers.`);
                user.cash += user.idle_cash;
                user.idle_cash = 0;
                user.last_idle = currentTime;

                await updateUser(userId, user);
            } else {
                await message.reply('You are not idle long enough to collect idle cash or do not have the appropriate managers assigned.');
            }
        } else {
            await message.reply('User data not found.');
        }
    }

    // Handle commands
    if (prefix) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error('Error executing command:', error);
            await message.reply('There was an error trying to execute that command!');
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Error executing interaction command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
    } 
	
	// Handle Select Menus
    else if (interaction.isStringSelectMenu()) {
        handleSelectMenuInteraction(interaction);

    // Handle Buttons
    } else if (interaction.isButton()) {
        handleButtonInteraction(interaction);
		
    } else {
        console.error('Received an unhandled interaction type.');
    }
});

// Centralized Error Handler
function handleInteractionError(interaction, errorMessage) {
    if (!interaction.replied) {
        interaction.reply({ content: errorMessage, ephemeral: true });
    } else {
        interaction.followUp({ content: errorMessage, ephemeral: true });
    }
}

// Handle Select Menu Interaction
async function handleSelectMenuInteraction(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const user = await getUser(userId);

    try {
        // Add your select menu handling logic here
    } catch (error) {
        handleInteractionError(interaction, 'There was an error trying to process the selection menu!');
        console.error('Error executing select menu interaction:', error);
    }
}

// Handle Button Interaction
async function handleButtonInteraction(interaction) {
    const customId = interaction.customId;
	const userId = interaction.user.id;
    const user = await getUser(userId);

    try {
        // Add your button handling logic here
    } catch (error) {
        handleInteractionError(interaction, 'There was an error trying to process that button!');
        console.error('Error executing button interaction:', error);
    }
}

client.login(token);