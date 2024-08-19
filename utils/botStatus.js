const { getAllUsers } = require('../dataManager');
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    try {
        const userCount = (await getAllUsers()).length;
        await client.user.setActivity(`${userCount} users are mining!`, { type: ActivityType.Playing });
    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

module.exports = {
    updateBotStatus
};
