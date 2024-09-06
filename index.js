const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
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
    const interaction = require(path.join(__dirname, 'commands/interactions', file));
    client.interactions.set(interaction.customId, interaction);
}

// Function to load and update guild data
async function loadAssignedGuilds(client) {
    try {
        const guildsCache = client.guilds.cache;

        // Array to hold the promises for each guild processing
        const guildPromises = [];

        for (const [guildId, guild] of guildsCache) {
            guildPromises.push((async () => {
                try {
                    // Fetch or initialize the guild's data
                    let guildData = (await db.ref(`guilds/${guildId}`).once('value')).val();
                    if (!guildData) {
                        guildData = {
                            id: guildId,
                            name: guild.name,
                            memberCount: guild.memberCount,
                            members: [], // Initialize empty members array
                            users: {} // Start with an empty users object
                        };
                        await db.ref(`guilds/${guildId}`).set(guildData);
                    } else {
                        guildData.memberCount = guild.memberCount;
                    }

                    // Use updateGuildData() to update members and users
                    await updateGuildData(client, guildId);
                } catch (error) {
                    console.error(`Failed to process guild ${guildId}:`, error);
                }
            })());
        }

        // Execute all guild processing promises
        await Promise.all(guildPromises);

    } catch (error) {
        console.error('Failed to load and update guilds:', error);
    }
}

// Load guild data and initialize users
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

        while (nextBatch.size === 100) {
            const lastMemberId = [...nextBatch.values()][nextBatch.size - 1].id;
            nextBatch = await guild.members.fetch({ limit: 100, after: lastMemberId });
            members.push(...nextBatch.values());
        }

        let existingGuild = (await db.ref(`guilds/${guildId}`).once('value')).val();
        if (!existingGuild) {
            existingGuild = {
                id: guildId,
                name: guild.name,
                memberCount: guild.memberCount,
                members: [],
                users: {}
            };
        } else {
            existingGuild.memberCount = guild.memberCount;
        }

        // Fetch user data from users.json
        const allUserData = (await db.ref(`users`).once('value')).val() || {};

        existingGuild.members = [];
        existingGuild.users = {};

        for (const member of members) {
            const user = member.user;
            const userId = user.id;

            // Skip bot users
            if (user.bot) continue;

            // Ensure user data exists in users.json
            if (allUserData[userId]) {
                // Add user if it doesn't exist in the users object
                existingGuild.users[userId] = existingGuild.users[userId] || allUserData[userId];

                // Only push new members if they don't already exist
                if (!existingGuild.members.some(m => m.id === userId)) {
                    existingGuild.members.push({ id: userId, username: user.username });
                }
            }
        }

        // Update the guild data in the database
        await db.ref(`guilds/${guildId}`).set(existingGuild);
    } catch (error) {
        console.error(`Error updating guild data for ${guildId}:`, error);
    }
};

function scheduleNextUpdate(client) {
    setInterval(() => {
        loadAssignedGuilds(client);
    }, 10000);
	
	// Check barrier unlock time
    setInterval(async () => {
        await handleBarrierUnlockTime();
    }, 1000);

    setInterval(async () => {
        await handleMissingData();
    }, 10000);
	
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

            user.mines = user.mines || [];
            user.cash = user.cash || 0;
            user.idleCash = user.idleCash || 0;
            user.lastDaily = user.lastDaily || Date.now();
            user.currentMine = user.currentMine || (user.mines.length > 0 ? user.mines[0].MineName : null);

            for (const mine of user.mines) {
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

// In the bot's ready event
client.once('ready', async () => {
    console.log('Bot is online!');
    console.log(`Logged in as ${client.user.tag}`);

    await updateBotStatus(client); // Update bot status with the user count

    // Deploy slash commands
    await deployCommands(clientId, token, client.slashCommands);

    // Load and initialize guild data
    scheduleNextUpdate(client);
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