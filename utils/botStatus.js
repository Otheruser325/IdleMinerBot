const { getAllUsers } = require('../dataManager');
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    try {
        // Fetch all users
        const users = await getAllUsers();
        // Get the user count
        const userCount = users.length;
        // Update the bot's status
        await client.user.setActivity(`${userCount} users are mining!`, { type: ActivityType.Playing });
        console.log(`Bot status updated: ${userCount} users are mining!`);
    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

module.exports = {
    updateBotStatus
};
