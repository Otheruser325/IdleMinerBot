const { initializeUser, saveUserData, getUser, getAllUsers } = require('../dataManager');

async function updateBotStatus(client) {
    const userCount = getAllUsers().length;
    await client.user.setActivity(`${userCount} users enjoying their virtual life!`, { type: 'PLAYING' });
}

module.exports = {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(message) {
        const userId = message.author.id;
        const username = message.author.username; // Fetch the username from the message author

        if (!getUser(userId)) {
            initializeUser(userId, username); // Pass both userId and username to initializeUser
            await saveUserData();

            try {
                await message.author.send('Welcome to your virtual life! Use "v map" to see your current location.');
            } catch (error) {
                console.error(`Could not send DM to ${message.author.tag}.\n`, error);
            }

            await message.reply(`You have now officially signed up to the mining world, ${userId}! Check your DM for more instructions.`);
            
            // Update bot status
            await updateBotStatus(message.client);
        } else {
            await message.reply('You are already in the game!');
        }
    }
};
