const supabase = require('./supabaseClient');
const { ActivityType } = require('discord.js');

async function updateBotStatus(client) {
    try {
        // Fetch all users from Supabase
        const { data: users, error } = await supabase
            .from('users')
            .select('*');

        if (error) {
            throw new Error(`Error fetching users: ${error.message}`);
        }

        // Get the count of users
        const userCount = users.length;

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