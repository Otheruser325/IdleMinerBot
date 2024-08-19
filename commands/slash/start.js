const { SlashCommandBuilder } = require('@discordjs/builders');
const { initializeUser, getUser } = require('../../dataManager');
const { updateBotStatus } = require('../../utils/botStatus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your mining empire.'),
    async execute(interaction) {
        // Acknowledge the interaction
        await interaction.deferReply(); 

        const userId = interaction.user.id;
        const username = interaction.user.username;

        try {
            // Fetch the user data asynchronously
            const user = await getUser(userId);  

            if (!user) {
                await initializeUser(userId, username);

                try {
                    await interaction.user.send('Welcome to Idle Miner! Use "im!help" to get started.');
                } catch (error) {
                    console.error(`Could not send DM to ${interaction.user.tag}.\n`, error);
                }

                await interaction.editReply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
                
                await updateBotStatus(interaction.client); // Update bot status after user initialization
            } else {
                await interaction.editReply('You are already in the game!');
            }
        } catch (error) {
            console.error('Error executing slash command:', error);
            await interaction.editReply('There was an error executing this command!');
        }
    }
};
