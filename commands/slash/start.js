const { SlashCommandBuilder } = require('@discordjs/builders');
const { initializeUser, getUser } = require('../../dataManager');
const { updateBotStatus } = require('../../utils/botStatus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your mining empire.'),
    async execute(interaction) {
        await interaction.deferReply(); // Acknowledge the interaction

        const userId = interaction.user.id;
        const username = interaction.user.username; // Fetch the username from the interaction user

        // Fetch the user data asynchronously
        const user = await getUser(userId);  

        if (!user) {
            await initializeUser(userId, username);

            try {
                await interaction.author.send('Welcome to Idle Miner! Use "im!help" to get started.');
            } catch (error) {
                console.error(`Could not send DM to ${message.author.tag}.\n`, error);
            }

            await interaction.editReply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
            
            await updateBotStatus(interaction.client); // Update bot status after user initialization
        } else {
            await interaction.reply('You are already in the game!');
        }
    }
};
