import { initializeUser, getUser, withUserLock } from '../../dataManager.js';
import { updateBotStatus } from '../../utils/botStatus.js';
import { EmbedBuilder } from 'discord.js';
import { logError } from '../../utils/errorHandling.js';

export default {
    name: 'start',
    description: 'Start your mining empire.',
    async execute(message) {
        const userId = message.author.id;
        const username = message.author.username;

        return withUserLock(userId, async () => {
            try {
                const user = await getUser(userId);

                if (!user) {
                    await initializeUser(userId, username);

                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('Welcome to Idle Miner!')
                        .setDescription(`Welcome to the mining world, <@${userId}>! Please use \`im!help\` to get you ready and started!`)
                        .addFields(
                            { name: 'Getting Started', value: '1. **__Intro__**: Start by using the \`im!shaft\` command on your channel. You\'ll need to use \`im!shaft buy\` to purchase your first shaft.\n\n2. **__Operating the Mine__**: After purchasing, operate it using \`im!work shaft 1\`. Use the \`im!work elevator\` and \`im!work warehouse\` to manage minerals.\n\n3. **__Upgrading & Managing__**: Upgrade your shafts using \`im!shaft upgrade\`. Hire managers using \`im!manager\` after upgrading to Level 5.\n\n4. **__Managing Mines__**: Use \`im!mine\` to operate new mines or check your status with \`im!mine overview\`.' }
                        )
                        .setFooter({ text: 'Happy mining!' });

                    try {
                        await message.author.send({ embeds: [embed] });
                        await message.channel.send(`You have now officially signed up to the mining world, <@${userId}>! Check your DMs for more instructions.`);
                    } catch (error) {
                        if (error.code === 50007) {
                            await message.reply(`I couldn't send the DM to you <@${userId}>, as your DMs are closed.`);
                        } else {
                            logError('start:sendDm', error, { userId, tag: message?.author?.tag });
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
                    logError('start:execute', error, { userId });
                    await message.reply('There was an error executing this command!');
                }
            }
        });
    }
};
