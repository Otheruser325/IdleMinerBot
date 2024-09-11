const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { deployCommands } = require('./deploy-commands');
const { users, saveUserData, getUser, getAllUsers, updateUser, initializeUser, initializeGuild, saveGuildData, getGuild, updateGuild, getUsersInGuild, addUserToGuild } = require('./dataManager');
const { updateBotStatus } = require('./utils/botStatus');
const mineRegions = require('./config/mineRegions.json');
const admin = require('firebase-admin');
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

// Load interaction handlers
const interactionFiles = fs.readdirSync(path.join(__dirname, 'commands/interactions')).filter(file => file.endsWith('.js'));
for (const file of interactionFiles) {
    const interaction = require(`./commands/interactions/${file}`);
    client.interactions.set(interaction.customId, interaction);
}

// Categorize guilds based on member count
async function loadAssignedGuilds(client) {
    try {
        const guildsCache = client.guilds.cache;
        const categorizedGuilds = {
            tiny: [],
            small: [],
            medium: [],
            large: [],
            huge: []
        };

        // Categorize guilds based on their member count
        for (const [guildId, guild] of guildsCache) {
            const memberCount = guild.memberCount;
            if (memberCount <= 50) categorizedGuilds.tiny.push(guild);
            else if (memberCount <= 250) categorizedGuilds.small.push(guild);
            else if (memberCount <= 1000) categorizedGuilds.medium.push(guild);
            else if (memberCount <= 5000) categorizedGuilds.large.push(guild);
            else categorizedGuilds.huge.push(guild);
        }

        // Trigger updates for each category at their respective intervals
        scheduleGuildUpdates(client, categorizedGuilds);
    } catch (error) {
        console.error('Failed to load and update guilds:', error);
    }
}

// Function to schedule guild updates for different size categories
function scheduleGuildUpdates(client, categorizedGuilds) {
    // Schedule updates for tiny guilds every 10 seconds
    setTimeout(async function updateTinyGuilds() {
        await processGuildBatch(client, categorizedGuilds.tiny, 500); // Tiny guilds with 500ms delay between each
        setTimeout(updateTinyGuilds, 10000); // Repeat every 10 seconds
    }, 10000);

    // Schedule updates for small guilds every 15 seconds
    setTimeout(async function updateSmallGuilds() {
        await processGuildBatch(client, categorizedGuilds.small, 1000); // Small guilds with 1000ms delay
        setTimeout(updateSmallGuilds, 15000); // Repeat every 15 seconds
    }, 15000);

    // Schedule updates for medium guilds every 30 seconds
    setTimeout(async function updateMediumGuilds() {
        await processGuildBatch(client, categorizedGuilds.medium, 3000); // Medium guilds with 3000ms delay
        setTimeout(updateMediumGuilds, 30000); // Repeat every 30 seconds
    }, 30000);

    // Schedule updates for large guilds every 60 seconds
    setTimeout(async function updateLargeGuilds() {
        await processGuildBatch(client, categorizedGuilds.large, 5000); // Large guilds with 5000ms delay
        setTimeout(updateLargeGuilds, 60000); // Repeat every 60 seconds
    }, 60000);

    // Schedule updates for huge guilds every 120 seconds
    setTimeout(async function updateHugeGuilds() {
        await processGuildBatch(client, categorizedGuilds.huge, 10000); // Huge guilds with 10000ms delay
        setTimeout(updateHugeGuilds, 120000); // Repeat every 120 seconds
    }, 120000);
}

// Batch process guilds with retries and delays
async function processGuildBatch(client, guilds, delay) {
    for (const guild of guilds) {
        await retryFetchGuildData(client, guild.id, 3, delay); // Retry up to 3 times
        await new Promise(resolve => setTimeout(resolve, delay)); // Apply delay between each guild
    }
}

// Retry fetching guild data with exponential backoff
const retryFetchGuildData = async (client, guildId, retries, delay) => {
    try {
        await updateGuildData(client, guildId);
    } catch (error) {
        if (error.code === 'GuildMembersTimeout' || retries > 0) {
            const jitter = Math.floor(Math.random() * 500);
            console.warn(`GuildMembersTimeout for ${guildId}. Retrying... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay + jitter)); // Add jitter for randomness
            return retryFetchGuildData(client, guildId, retries - 1, delay * 2); // Exponential backoff
        } else {
            console.error(`Failed to update guild ${guildId} after max retries.`);
        }
    }
};

// Update guild data from Discord API
const updateGuildData = async (client, guildId) => {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.error(`Guild with ID ${guildId} not found.`);
            return;
        }

        let members = [];
        let nextBatch = await guild.members.fetch({ limit: 100 });
        members.push(...nextBatch.values());

        // Fetch members in batches to avoid timeouts
        while (nextBatch.size === 100) {
            const lastMemberId = [...nextBatch.values()][nextBatch.size - 1].id;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay between batches
            nextBatch = await guild.members.fetch({ limit: 100, after: lastMemberId });
            members.push(...nextBatch.values());
        }

        let existingGuild = (await db.ref(`guilds/${guildId}`).once('value')).val() || {
            id: guildId,
            name: guild.name,
            memberCount: guild.memberCount,
            members: [],
            users: {}
        };

        existingGuild.memberCount = guild.memberCount;
        existingGuild.members = [];
        existingGuild.users = {};

        const allUserData = (await db.ref(`users`).once('value')).val() || {};

        for (const member of members) {
            const user = member.user;
            const userId = user.id;

            if (user.bot) continue; // Skip bot users

            if (allUserData[userId]) {
                existingGuild.users[userId] = allUserData[userId];
                if (!existingGuild.members.some(m => m.id === userId)) {
                    existingGuild.members.push({ id: userId, username: user.username });
                }
            }
        }

        await db.ref(`guilds/${guildId}`).set(existingGuild); // Update the guild in the database
    } catch (error) {
        throw error; // Throw error for retry logic
    }
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
	
	// Set up an interval to call handleManagerWork for all users every second
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
    }, 1000); // Interval set to 1000 milliseconds (1 second)
	
	// Schedule dynamic updates for all guilds based on size category
	await loadAssignedGuilds(client);
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
    user.lastDaily = user.lastDaily || Date.now();
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

    // Function to handle cash production
    function produceCash(isIdle = false) {
        const productionRate = currentMine.Factor || 1; // Base production rate based on mine factor
        const shaftsCount = currentMine.mineshafts.length; // Number of mineshafts

        let totalGainPerSecond = 0;
        currentMine.mineshafts.forEach(shaft => {
            totalGainPerSecond += shaft.gainPerSecondPerWorker * shaft.numberOfWorkers;
        });

        // Ensure managers are properly defined
        currentMine.managers.shaft = currentMine.managers.shaft || [];
        currentMine.managers.elevator = currentMine.managers.elevator || [];
        currentMine.managers.warehouse = currentMine.managers.warehouse || [];

        // Check if all managers are assigned
        const shaftManagerAssigned = currentMine.managers.shaft.some(m => m.assigned);
        const elevatorManagerAssigned = currentMine.managers.elevator.some(m => m.assigned);
        const warehouseManagerAssigned = currentMine.managers.warehouse.some(m => m.assigned);

        // Ensure all required managers are assigned before producing cash
        if (shaftManagerAssigned && elevatorManagerAssigned && warehouseManagerAssigned) {
            // Calculate cash based on efficiency (10% when idle)
            const efficiency = isIdle ? 0.1 : 1.0;
            const cashProduced = totalGainPerSecond * productionRate * efficiency;

            // Add to either active cash or idle cash
            if (isIdle) {
                user.idleCash += cashProduced;
            } else {
                user.cash += cashProduced;
            }
        }
    }

    // Determine if the user is idle
    const currentTime = Date.now();
    const lastActivityTime = user.lastDaily;

    // Check if the user is idle (inactive for over 10 minutes)
    const isIdle = currentTime - lastActivityTime > 10 * 60 * 1000;

    // Produce cash
    produceCash(isIdle);

    // Save user data
    try {
        await updateUser(userId, {
            cash: user.cash,
            idleCash: user.idleCash,
            lastDaily: user.lastDaily,
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
            user.currentMine = user.currentMine || (user.mines.length > 0 ? user.mines[0].MineName : null);

            for (const mineIndex of user.mines) {
				const mine = user.mines[mineIndex];
				
                mine.PrestigeCount = mine.PrestigeCount || 0;
                mine.MineNumber = mine.MineNumber || 1;
                mine.Factor = mine.Factor || 1;
                mine.mineshafts = mine.mineshafts || [];
                mine.elevator = mine.elevator || [];
                mine.warehouse = mine.warehouse || [];
                mine.managers = mine.managers || { shaft: [], elevator: [], warehouse: [] };

                // Initialize barriers if not present
                if (!mine.barriers) {
                    mine.barriers = mineRegions.map((region, index) => ({
                        ...region,
                        unlocked: index === 0
                    }));
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
            const isIdle = currentTime - user.lastDaily > 10 * 60 * 1000;

            if (isIdle) {
                const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
                if (!currentMine) {
                    return message.reply('Current mine data not found.');
                }

                await handleManagerWork(user, userId);
                user.cash += user.idleCash;
                user.idleCash = 0;
                user.lastDaily = currentTime;

                await updateUser(userId, user);
                await message.reply(`You have collected ${user.cash} cash from your idle workers.`);
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
    } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
        const interactionHandler = client.interactions.get(interaction.customId);
        if (!interactionHandler) {
            console.error(`No interaction handler matching ${interaction.customId} was found.`);
            return;
        }

        try {
            await interactionHandler.execute(interaction);
        } catch (error) {
            console.error('Error executing interaction:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'There was an error executing this interaction!', ephemeral: true });
            } else {
                await interaction.followUp({ content: 'There was an error executing this interaction!', ephemeral: true });
            }
        }
    } else {
        console.error('Received an unhandled interaction type.');
    }
});

client.login(token);