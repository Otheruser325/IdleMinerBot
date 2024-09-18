const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { deployCommands } = require('./deploy-commands');
const { users, saveUserData, getUser, getAllUsers, updateUser, initializeUser, initializeGuild, saveGuildData, getGuild, updateGuild, getUsersInGuild, addUserToGuild } = require('./dataManager');
const { updateBotStatus } = require('./utils/botStatus');
const numberFormat = require('./utils/numberFormat');
const mineRegions = require('./config/mineRegions.json').regions;
const continentData = require('./config/continentData.json').continents;
const admin = require('firebase-admin');
const EventEmitter = require('events').EventEmitter;
EventEmitter.defaultMaxListeners = 20;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://idleminerapi-default-rtdb.firebaseio.com/'
    });
}

const db = admin.database();

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
	
	// Check barrier unlock time
    cron.schedule('* * * * * *', async () => {
        await handleBarrierUnlockTime(); // Run every second
    });
	
	// Schedule boost timer updates every second
    cron.schedule('* * * * * *', async () => {
        await handleBoostTimers(); // Run every second
    });
	
	// Set up an interval to call handleManagerWork for all users every 5 seconds
    setInterval(async () => {
        try {
            const allUsers = await getAllUsers(); // Retrieve all users
            
            // Loop through all users and process their cash production
            for (const userId in allUsers) {
                const user = allUsers[userId];
                await handleManagerWork(user, userId);
            }
        } catch (error) {
            console.error('Error handling manager work for users:', error);
        }
    }, 5000); // Interval set to 5000 milliseconds (5 seconds)
}

// Function to start manager work
async function handleManagerWork(user, userId) {
    // Check if user data is valid
    if (!user) {
        console.error('User data is undefined or invalid.');
        return;
    }

    // Ensure user properties are defined
    user.mines = user.mines || [];
    user.cash = user.cash || 0;
    user.idleCash = user.idleCash || 0;
    user.lastIdle = user.lastIdle || Date.now();
    user.currentMine = user.currentMine || (user.mines.length > 0 ? user.mines[0].MineName : null);

    const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);

    if (!currentMine) {
        console.error(`Current mine data for user ${userId} not found.`);
        return;
    }

    // Ensure managers are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };
	
	// Ensure workstations are properly initialized
    currentMine.mineshafts = currentMine.mineshafts || [];
	currentMine.elevator = currentMine.elevator || [];
	currentMine.warehouse = currentMine.warehouse || [];

    // Function to handle cash production
    async function produceCash(isIdle = false) {
        try {
            const productionRate = currentMine.Factor || 1;
            const shaftsCount = currentMine.mineshafts.length;

            let totalGainPerSecond = 0;
            currentMine.mineshafts.forEach(shaft => {
                if (shaft.gainPerSecondPerWorker && shaft.numberOfWorkers) {
                    totalGainPerSecond += (shaft.gainPerSecondPerWorker * shaft.numberOfWorkers);
                }
            });

            // Ensure all required managers are assigned before producing cash
            const shaftManagerAssigned = currentMine.managers.shaft.some(m => m.Assigned);
            const elevatorManagerAssigned = currentMine.managers.elevator.some(m => m.Assigned);
            const warehouseManagerAssigned = currentMine.managers.warehouse.some(m => m.Assigned);

            if (shaftManagerAssigned && elevatorManagerAssigned && warehouseManagerAssigned) {
                // Calculate cash based on efficiency (10% when idle)
                const efficiency = isIdle ? 0.1 : 1.0;
                const cashProduced = totalGainPerSecond * productionRate * efficiency;
				const multiplier = 5;
				const adjustedCashProduced = cashProduced * multiplier;

                // Add to either active cash or idle cash
                if (isIdle) {
                    user.idleCash += adjustedCashProduced;
                } else {
                    user.cash += adjustedCashProduced;
                }
            }
        } catch (error) {
            console.error('Error producing cash:', error);
        }
    }

    // Determine if the user is idle
    const currentTime = Date.now();
    const lastActivityTime = user.lastIdle;

    // Check if the user is idle (inactive for over 10 minutes)
    const isIdle = currentTime - lastActivityTime > 10 * 60 * 1000;

    // Produce cash
    await produceCash(isIdle);

    // Adjusting cooldown and balancing factor
    const cooldownDelay = 5000; // 5 seconds delay

    // Save user data with adjusted balance
    try {
        await updateUser(userId, {
            cash: user.cash,
            idleCash: user.idleCash,
            lastIdle: user.lastIdle,
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

            user.username = user.username || 'Unknown',
            user.userId = user.userId || userId,
			user.continents = user.continents || [continentData[0]];
            user.mines = user.mines || [];
            user.cash = user.cash || 0;
			user.iceCash = user.iceCash || 0;
			user.fireCash = user.fireCash || 0;
            user.idleCash = user.idleCash || 0;
			user.idleIceCash = user.idleIceCash || 0;
			user.idleFireCash = user.idleFireCash || 0;
			user.superCash = user.superCash || 0;
			user.streak = user.streak || 0,
            user.lastDaily = user.lastDaily || Date.now();
			user.lastIdle = user.lastIdle || Date.now();
			user.currentContinent = user.currentContinent || 'Start Continent';
            user.currentMine = user.currentMine || (user.mines.length > 0 ? user.mines[0].MineName : null);

            for (const mine of user.mines) {
                mine.PrestigeCount = mine.PrestigeCount || 0;
                mine.MineNumber = mine.MineNumber || 1;
                mine.Factor = mine.Factor || 1;
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
                    if (barrier.unlockTime && Date.now() >= barrier.unlockTime) {
                        barrier.unlocked = true;
                        barrier.unlockTime = null;
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
			if (!user.activeBoosts) {
		        user.activeBoosts = [];
			}
			
            // Filter out expired boosters
            user.activeBoosts = user.activeBoosts.filter(boost => boost.endTime > Date.now());

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
            const isIdle = currentTime - user.lastIdle > 10 * 60 * 1000;

            if (isIdle) {
                const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
                if (!currentMine) {
                    return message.reply('Current mine data not found.');
                }

                await handleManagerWork(user, userId);
				await message.reply(`You have collected ${numberFormat(user.idleCash)} cash from your idle workers.`);
                user.cash += user.idleCash;
                user.idleCash = 0;
                user.lastIdle = currentTime;

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