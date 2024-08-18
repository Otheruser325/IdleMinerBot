const { initializeUser, saveUserData, getUser, getAllUsers } = require('../dataManager');
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    const userCount = getAllUsers().length;
    await client.user.setActivity(`${userCount} users enjoying their virtual life!`, { type: ActivityType.Playing });
}

module.exports = {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(interaction) {
        const userId = interaction.user.id;
        const username = interaction.user.username;

        if (!getUser(userId)) {
            // Initialize the user in the database
            initializeUser(userId, username);
            await saveUserData();

            try {
                await interaction.user.send('Welcome to your virtual life! Use "/map" to see your current location.');
            } catch (error) {
                console.error(`Could not send DM to ${interaction.user.tag}.\n`, error);
            }

            await interaction.reply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
            
            // Update bot status
            await updateBotStatus(interaction.client);
        } else {
            await interaction.reply('You are already in the game!');
        }
    }
};
