const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.database();
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    try {
        // Fetch all users
        const usersSnapshot = await db.ref('users').once('value');
        const users = usersSnapshot.val() || {};

        // Get the count of users
        const userCount = Object.keys(users).length;
        
        // Determine the correct term for user(s)
        const userTerm = userCount === 1 ? 'user' : 'users';

        // Update the bot's status
        await client.user.setActivity(`${userCount} ${userTerm} are mining!`, { type: ActivityType.Playing });
        console.log(`Bot status updated: ${userCount} ${userTerm} are mining!`);
    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

module.exports = {
    updateBotStatus
};
