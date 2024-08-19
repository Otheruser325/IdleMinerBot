const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const { getUser, getUserInGuild } = require('../../dataManager');

const wealthDescriptions = [
    { minCoins: 1_000_000_000_000_000, description: 'Quadrillionaire!' },
    { minCoins: 10_000_000_000_000, description: 'Multitrillionaire!' },
    { minCoins: 1_000_000_000_000, description: 'Trillionaire!' },
    { minCoins: 10_000_000_000, description: 'Multibillionaire!' },
    { minCoins: 1_000_000_000, description: 'Billionaire!' },
    { minCoins: 10_000_000, description: 'Multimillionaire!' },
    { minCoins: 1_000_000, description: 'Millionaire!' },
    { minCoins: 100_000, description: 'Rich!' },
    { minCoins: 10_000, description: 'Wealthy!' },
    { minCoins: 1_000, description: 'Well-off!' },
    { minCoins: 100, description: 'Comfortable!' },
    { minCoins: 10, description: 'Stable!' },
    { minCoins: 0, description: 'Average' }
];

module.exports = {
    name: 'balance',
    description: 'Check your V-Coins balance.',
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

            const user = isGuildContext ? await getUserInGuild(guild.id, userId) : await getUser(userId);

            if (!user) {
                console.log(`User data not found for userId: ${userId} in guild: ${guild.id}`); // Debugging statement
                return message.reply(`${targetUsername} needs to start the game first by using \`v start\`.`);
            }

            const balance = user.vCoins || 0;
            const bankBalance = user.bankBalance || 0;

            let description = 'Average';

            for (const wealth of wealthDescriptions) {
                if (balance >= wealth.minCoins) {
                    description = wealth.description;
                    break;
                }
            }

            const userAvatar = isGuildContext
                ? guild.members.cache.get(userId)?.user.displayAvatarURL() || message.author.displayAvatarURL()
                : message.client.users.cache.get(userId)?.displayAvatarURL() || message.author.displayAvatarURL();

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${targetUsername}'s V-Coins Balance`)
                .setDescription(`${targetUsername} has ${numberFormat(balance)} V-Coins.\n\n${description}`)
                .addFields({ name: 'Bank Balance', value: `${numberFormat(bankBalance)} V-Coins`, inline: true })
                .setTimestamp()
                .setThumbnail(userAvatar);

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in balance command:', error);
            message.reply('There was an error executing the balance command.');
        }
    }
};
