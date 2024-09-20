const { SlashCommandBuilder } = require('@discordjs/builders');
const { initializeUser, getUser } = require('../../dataManager');
const { updateBotStatus } = require('../../utils/botStatus');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your mining empire.'),
    async execute(interaction) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const username = interaction.user.username;

        try {
            const user = await getUser(userId);

            if (!user) {
                await initializeUser(userId, username);

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('Welcome to Idle Miner!')
                    .setDescription(`Welcome to the mining world, <@${userId}>! Please use \`/help\` to get you ready and started!`)
                    .addFields(
                        { name: 'Getting Started', value: '1. **__Intro__**: Start by using the \`/shaft\` command. Use \`/shaft buy\` to purchase your first shaft.\n\n2. **__Operating the Mine__**: Operate using \`/work shaft 1\`, then use \`/work elevator\` and \`/work warehouse\`.\n\n3. **__Upgrading & Managing__**: Upgrade shafts with \`/shaft upgrade\`. Hire managers with \`/manager\` after reaching Level 5.\n\n4. **__Managing Mines__**: Use \`/mine\` to manage mines or check status with \`/mine overview\`.' }
                    )
                    .setFooter({ text: 'Happy mining!' });

                try {
                    await interaction.user.send({ embeds: [embed] });
                    await interaction.editReply(`You have now officially signed up to the mining world, <@${userId}>! Check your DMs for more instructions.`);
                } catch (error) {
                    if (error.code === 50007) {
                        await interaction.editReply(`I couldn't send the DM to you <@${userId}>, as your DMs are closed.`);
                    } else {
                        console.error(`Could not send DM to ${interaction.user.tag}.\n`, error);
                    }
                }

                await updateBotStatus(interaction.client);
            } else {
                await interaction.editReply('You are already in the game!');
            }
        } catch (error) {
            if (error.code === 160002) {
                await interaction.editReply('Your channel must have the `Read Message History` permission before using this command.');
            } else {
                console.error('Error executing the start command:', error);
                await interaction.editReply('There was an error executing this command!');
            }
        }
    }
};