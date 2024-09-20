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
                    .setDescription('Welcome to Idle Miner! Use `/help` to get started.')
                    .addFields(
                        { name: 'Getting Started', value: '1. **__Intro__**: Start by using the `**/shaft**` command on your channel. In order to operate your mine (which currently everyone will have the **Coal Mine** upon signing up), you\'ll need to use the `**/shaft buy**` command. You\'ll need to input a number of the shaft to purchase, which in this case `**/shaft buy 1**`, as everyone, including you, will have **10** starting cash to purchase **Shaft 1** at the commencement of your mining journey.\n\n2. **__Operating the Mine__**: After purchasing **Shaft 1**, you\'ll need to operate it now. Start by using `**/work shaft 1**` to operate your 1st shaft. The mineworkers will take time to mine some minerals for you and then deposit them. Then you\'ll realise the **Elevator** and **Warehouse** becomes operational, so use `**/work elevator**` before using **/work warehouse**` to extract the minerals from each mineshaft using the elevator and then **/work warehouse**` to send in the stockworkers to import the extracted minerals inside the elevator\'s deposit tank. You\'ll make solid cash upon operating these workstations.\n\n3. **__Upgrading & Managing__**: After figuring the operation tasks, you can then start upgrading your workstations, particularly shafts. In order to upgrade your shafts, you\'ll use `**/shaft upgrade**`. In this case, `**/shaft upgrade 1**` for upgrading the existing shaft you own. You can also upgrade your **Elevator** and **Warehouse** using `**/elevator upgrade**` and `**/warehouse upgrade**` respectively (if you can afford it). After getting your 1st shaft to **Level 5**, you can hire **Managers** using the `**/manager**` command (i.e. `**/manager hire shaft**`) to automate your workflow possible. To assign a manager, use `**/manager assign workstation managerId_or_Name**` (workstation means either **Shaft**, **Elevator** or **Warehouse** while managerId_or_Name means using a manager\'s ID or name, i.e. **1** or **Benjamin Booth**.\n\n4. **__Managing Mines__**: Use the `**/mine**` command to operate new mines or view your current mine\'s status using `**/mine overview**`. The most notable progress is unlocking that **Gold Mine** from the get-go, which costs **76.8ab** to unlock. To unlock a new mine, you need to use `**/mine buy mineName**` (mineName for example will be the "**Gold Mine**") to purchase it. Unlocking new mines isn\'t possible until you\'ve made enough **Cash** in your current mines you have.' }
                    )
                    .setFooter({ text: 'Happy mining!' });

                try {
                    await interaction.user.send({ embeds: [embed] });
                    await interaction.channel.send(`You have now officially signed up to the mining world, <@${userId}>! Check your DMs for more instructions.`);
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