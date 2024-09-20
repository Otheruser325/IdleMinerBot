const { initializeUser, getUser } = require('../../dataManager');
const { updateBotStatus } = require('../../utils/botStatus');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(message) {
        const userId = message.author.id;
        const username = message.author.username;

        try {
            const user = await getUser(userId);

            if (!user) {
                await initializeUser(userId, username);

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('Welcome to Idle Miner!')
                    .setDescription('Welcome to Idle Miner! Use `im!help` to get started.')
                    .addFields(
                        { name: 'Getting Started', value: '1. **__Intro__**: Start by using the `**im!shaft**` command on your channel. In order to operate your mine (which currently everyone will have the **Coal Mine** upon signing up), you\'ll need to use the `**im!shaft buy**` command. You\'ll need to input a number of the shaft to purchase, which in this case `**im!shaft buy 1**`, as everyone, including you, will have **10** starting cash to purchase **Shaft 1** at the commencement of your mining journey.\n\n2. **__Operating the Mine__**: After purchasing **Shaft 1**, you\'ll need to operate it now. Start by using `**im!work shaft 1**` to operate your 1st shaft. The mineworkers will take time to mine some minerals for you and then deposit them. Then you\'ll realise the **Elevator** and **Warehouse** becomes operational, so use `**im!work elevator**` before using **im!work warehouse**` to extract the minerals from each mineshaft using the elevator and then **im!work warehouse**` to send in the stockworkers to import the extracted minerals inside the elevator\'s deposit tank. You\'ll make solid cash upon operating these workstations.\n\n3. **__Upgrading & Managing__**: After figuring the operation tasks, you can then start upgrading your workstations, particularly shafts. In order to upgrade your shafts, you\'ll use `**im!shaft upgrade**`. In this case, `**im!shaft upgrade 1**` for upgrading the existing shaft you own. You can also upgrade your **Elevator** and **Warehouse** using `**im!elevator upgrade**` and `**im!warehouse upgrade**` respectively (if you can afford it). After getting your 1st shaft to **Level 5**, you can hire **Managers** using the `**im!manager**` command (i.e. `**im!manager hire shaft**`) to automate your workflow possible. To assign a manager, use `**im!manager assign workstation managerId_or_Name**` (workstation means either **Shaft**, **Elevator** or **Warehouse** while managerId_or_Name means using a manager\'s ID or name, i.e. **1** or **Benjamin Booth**.\n\n4. **__Managing Mines__**: Use the `**im!mine**` command to operate new mines or view your current mine\'s status using `**im!mine overview**`. The most notable progress is unlocking that **Gold Mine** from the get-go, which costs **76.8ab** to unlock. To unlock a new mine, you need to use `**im!mine buy mineName**` (mineName for example will be the "**Gold Mine**") to purchase it. Unlocking new mines isn\'t possible until you\'ve made enough **Cash** in your current mines you have.' }
                    )
                    .setFooter({ text: 'Happy mining!' });

                try {
                    await message.author.send({ embeds: [embed] });
                    await message.channel.send(`You have now officially signed up to the mining world, <@${userId}>! Check your DMs for more instructions.`);
                } catch (error) {
                    if (error.code === 50007) {
                        await message.reply(`I couldn't send the DM to you <@${userId}>, as your DMs are closed.`);
                    } else {
                        console.error(`Could not send DM to ${message.author.tag}.\n`, error);
                    }
                }

                await updateBotStatus(message.client);
            } else {
                await message.reply('You are already in the game!');
            }
        } catch (error) {
            if (error.code === 160002) {
                await message.reply('Your channel must have the `Read Message History` permission before using this command.');
            } else {
                console.error('Error executing the start command:', error);
                await message.reply('There was an error executing this command!');
            }
        }
    }
};