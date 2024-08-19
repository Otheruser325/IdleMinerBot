const { SlashCommandBuilder } = require('@discordjs/builders');
const { initializeUser, saveUserData, getUser, getAllUsers } = require('../../dataManager');

async function updateBotStatus(client) {
    const users = await getAllUsers(); // Make sure to await the result
    const userCount = users.length;
    await client.user.setActivity(`${userCount} users are mining!`, { type: 'PLAYING' });
}

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
            // Initialize user asynchronously
            await initializeUser(userId, username);

            try {
                await interaction.user.send('Welcome to Idle Miner! Use "im!help" to get started.');
            } catch (error) {
                console.error(`Could not send DM to ${interaction.user.tag}.\n`, error);
            }

            await interaction.editReply(`You have now officially signed up to the mining world, ${username}! Check your DM for more instructions.`);
            
            // Update bot status
            await updateBotStatus(interaction.client);
        } else {
            await interaction.editReply('You are already in the game!');
        }
    }
};