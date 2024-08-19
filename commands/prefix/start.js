const { initializeUser, getUser } = require('../../dataManager');
const { updateBotStatus } = require('../../utils/botStatus');
const { ActivityType } = require('discord.js');

module.exports = {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(message) {  
        const userId = message.author.id;
        const username = message.author.username;

        const user = await getUser(userId);  

        if (!user) {
            await initializeUser(userId, username);

            try {
                await message.author.send('Welcome to Idle Miner! Use "im!help" to get started.');
            } catch (error) {
                console.error(`Could not send DM to ${message.author.tag}.\n`, error);
            }

            await message.reply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
            
            await updateBotStatus(message.client); // Update bot status after user initialization
        } else {
            await message.reply('You are already in the game!');
        }
    }
};
