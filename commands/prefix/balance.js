const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const { getUser, getUserInGuild } = require('../../dataManager');

const wealthDescriptions = [
    { minCash: 1_000_000_000_000_000_000, description: 'Quadrillionaire!' },
    { minCash: 10_000_000_000_000_000, description: 'Multitrillionaire!' },
    { minCash: 1_000_000_000_000_000, description: 'Trillionaire!' },
    { minCash: 10_000_000_000_000, description: 'Multibillionaire!' },
    { minCash: 1_000_000_000_000, description: 'Billionaire!' },
    { minCash: 10_000_000_000, description: 'Multimillionaire!' },
    { minCash: 1_000_000_000, description: 'Millionaire!' },
    { minCash: 100_000_000, description: 'Rich!' },
    { minCash: 10_000_000, description: 'Wealthy!' },
    { minCash: 1_000_000, description: 'Well-off!' },
    { minCash: 100_000, description: 'Comfortable!' },
    { minCash: 10_000, description: 'Stable!' },
    { minCash: 0, description: 'Average' }
];

module.exports = {
    name: 'balance',
    description: 'Check your balance and cash types.',
    aliases: ['bank', 'bal'],
    usage: '(optional) <user>',
    exampleUsage: 'v balance @username or v balance 1234567890',
    async execute(message, args) {
        try {
            let userId = message.author.id; 
            let targetUsername = message.author.username; 

            const guild = message.guild;
            const isGuildContext = Boolean(guild);

            if (args.length > 0) {
                const userMention = args[0];

                if (userMention.startsWith('<@') && userMention.endsWith('>')) {
                    userId = userMention.replace(/[<@!>]/g, '');
                } else if (/^\d+$/.test(userMention)) {
                    userId = userMention;
                } else {
                    const username = userMention.toLowerCase();

                    if (isGuildContext) {
                        const member = guild.members.cache.find(m => m.user.username.toLowerCase() === username);
                        if (member) {
                            userId = member.id;
                        } else {
                            return message.reply(`No user found with the username "${userMention}" in this guild.`);
                        }
                    } else {
                        return message.reply(`No user found with the username "${userMention}".`);
                    }
                }

                targetUsername = isGuildContext
                    ? guild.members.cache.get(userId)?.user.username || userMention
                    : userMention;
            }

            // Fetch user data from Firestore
            const user = isGuildContext ? await getUserInGuild(guild.id, userId) : await getUser(userId);

            if (!user) {
                return message.reply(`${targetUsername} needs to start the game first by using \`im!start\`.`);
            }

            const cash = user.cash || 0;
            const iceCash = user.iceCash || 0;
            const fireCash = user.fireCash || 0;
            const superCash = user.superCash || 0;

            let description = 'Average';

            for (const wealth of wealthDescriptions) {
                if (superCash >= wealth.minCash) {
                    description = wealth.description;
                    break;
                }
            }

            const userAvatar = isGuildContext
                ? guild.members.cache.get(userId)?.user.displayAvatarURL() || message.author.displayAvatarURL()
                : message.client.users.cache.get(userId)?.displayAvatarURL() || message.author.displayAvatarURL();

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${targetUsername}'s Balance`)
                .addFields(
                    { name: 'Cash', value: `${numberFormat(cash)} Cash`, inline: true },
                    { name: 'Ice Cash', value: `${numberFormat(iceCash)} Ice Cash`, inline: true },
                    { name: 'Fire Cash', value: `${numberFormat(fireCash)} Fire Cash`, inline: true },
                    { name: 'Super Cash', value: `${numberFormat(superCash)} Super Cash`, inline: true },
                    { name: 'Wealth Status', value: description, inline: false }
                )
                .setTimestamp()
                .setThumbnail(userAvatar);

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in balance command:', error);
            message.reply('There was an error executing the balance command.');
        }
    }
};
