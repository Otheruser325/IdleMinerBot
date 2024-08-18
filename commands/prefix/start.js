const { initializeUser, saveUserData, getUser, getAllUsers } = require('../../dataManager');
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    const userCount = (await getAllUsers()).length;  // Ensure this is awaited as it interacts with the database
    await client.user.setActivity(`${userCount} users are mining!`, { type: ActivityType.Playing });
}

module.exports = {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(message) {  // Changed from interaction to message for prefix commands
        const userId = message.author.id;
        const username = message.author.username;

        const user = await getUser(userId);  // Await the result of getUser to ensure proper user retrieval

        if (!user) {
            // Initialize the user in the database
            await initializeUser(userId, username);
            await saveUserData();  // If saveUserData is needed after initialization

            try {
                await message.author.send('Welcome to Idle Miner! Use "im!help" to get started.');
            } catch (error) {
                console.error(`Could not send DM to ${message.author.tag}.\n`, error);
            }

            await message.reply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
            
            // Update bot status
            await updateBotStatus(message.client);
        } else {
            await message.reply('You are already in the game!');
        }
    }
};
