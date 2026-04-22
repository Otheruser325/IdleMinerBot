import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import { getUser } from '../../dataManager.js';
import { logError } from '../../utils/errorHandling.js';

const wealthDescriptions = [
    { minCash: 1e33, description: 'Decillionaire!' },
	{ minCash: 1e30, description: 'Nonillionaire!' },
    { minCash: 1e27, description: 'Octillionaire!' },
	{ minCash: 1e24, description: 'Septillionaire!' },
    { minCash: 1e21, description: 'Sextillionaire!' },
    { minCash: 1000000000000000000000, description: 'Quintillionaire!' },
    { minCash: 1000000000000000000, description: 'Quadrillionaire!' },
    { minCash: 10000000000000000, description: 'Multitrillionaire!' },
    { minCash: 1000000000000000, description: 'Trillionaire!' },
    { minCash: 10000000000000, description: 'Multibillionaire!' },
    { minCash: 1000000000000, description: 'Billionaire!' },
    { minCash: 10000000000, description: 'Multimillionaire!' },
    { minCash: 1000000000, description: 'Millionaire!' },
    { minCash: 100000000, description: 'Rich!' },
    { minCash: 10000000, description: 'Wealthy!' },
    { minCash: 1000000, description: 'Well-off!' },
    { minCash: 100000, description: 'Comfortable!' },
    { minCash: 10000, description: 'Stable!' },
    { minCash: 0, description: 'Average' }
];

export default {
    name: 'balance',
    description: 'Check your balance and cash types.',
    aliases: ['bank', 'bal'],
    usage: '(optional) <user>',
    exampleUsage: 'v balance @username or v balance 1234567890',
    async execute(message, args) {
        try {
            let userId = message.author.id;
            let targetUsername = message.author.username;

            // Check if a user mention or ID is provided
            if (args.length > 0) {
                const userMention = args[0];

                // Check if argument is a mention or ID
                if (userMention.startsWith('<@') && userMention.endsWith('>')) {
                    userId = userMention.replace(/[<@!>]/g, '');
                } else if (/^\d+$/.test(userMention)) {
                    userId = userMention;
                } else {
                    const username = userMention.toLowerCase();
                    const member = message.guild ? message.guild.members.cache.find(m => m.user.username.toLowerCase() === username) : null;
                    if (member) {
                        userId = member.id;
                    } else {
                        return message.reply(`No user found with the username "${userMention}" in this guild.`);
                    }
                }

                // Check if target is a bot
                const targetMember = message.guild?.members.cache.get(userId);
                if (targetMember?.user.bot) {
                    return message.reply('This is not a real user.');
                }

                targetUsername = message.guild
                    ? message.guild.members.cache.get(userId)?.user.username || userMention
                    : userMention;
            }

            // Fetch user data directly using userId
            const user = await getUser(userId);

            // Check if the user exists
            if (!user) {
                return message.reply(`${targetUsername} needs to start the game first by using \`im!start\` (or \`/start\` if using slash).`);
            }

            // Extract and format user's balance data
            const cash = user.cash || 0;
            const iceCash = user.ice_cash || 0;
            const fireCash = user.fire_cash || 0;
            const dawnCash = user.dawn_cash || 0;
            const superCash = user.super_cash || 0;

            // Determine user's wealth status
            let description = 'Average';
            for (const wealth of wealthDescriptions) {
                if (superCash >= wealth.minCash) {
                    description = wealth.description;
                    break;
                }
            }

            // Fetch user's avatar
            const userAvatar = message.guild
                ? message.guild.members.cache.get(userId)?.user.displayAvatarURL() || message.author.displayAvatarURL()
                : message.client.users.cache.get(userId)?.displayAvatarURL() || message.author.displayAvatarURL();

            // Build and send the balance embed message
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${targetUsername}'s Balance`)
                .addFields(
                    { name: 'Cash', value: `${numberFormat(cash)} Cash`, inline: true },
                    { name: 'Ice Cash', value: `${numberFormat(iceCash)} Ice Cash`, inline: true },
                    { name: 'Fire Cash', value: `${numberFormat(fireCash)} Fire Cash`, inline: true },
                    { name: 'Dawn Cash', value: `${numberFormat(dawnCash)} Dawn Cash`, inline: true },
                    { name: 'Super Cash', value: `${numberFormat(superCash)} Super Cash`, inline: true },
                    { name: 'Wealth Status', value: description, inline: false }
                )
                .setTimestamp()
                .setThumbnail(userAvatar);

            return message.reply({ embeds: [embed] });
        } catch (error) {
            logError('balance:execute', error, { userId: message?.author?.id, target: args?.[0] });
            message.reply('There was an error executing the balance command.');
        }
    }
};
