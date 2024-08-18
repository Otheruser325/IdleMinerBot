const { MessageEmbed } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const { getUser, users, saveUserData, getGuild, getUserInGuild } = require('../../dataManager');

const wealthDescriptions = [
    { minCoins: 1_000_000_000_000_000, description: 'Quadrillionaire!' },
    { minCoins: 10_000_000_000_000, description: 'Multitrillionaire!' },
    { minCoins: 1_000_000_000_000, description: 'Trillionaire!' },
    { minCoins: 10_000_000_000, description: 'Multibillionaire!' },
    { minCoins: 1_000_000_000, description: 'Billionaire!' },
    { minCoins: 10_000_000, description: 'Multimillionaire!' },
    { minCoins: 1_000_000, description: 'Millionaire!' },
    { minCoins: 100000, description: 'Rich!' },
    { minCoins: 10000, description: 'Wealthy!' },
    { minCoins: 1000, description: 'Well-off!' },
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
            let userId = message.author.id; // Default to the message author's ID
            let targetUsername = message.author.username; // Default to the message author's username

            // Check if command is used in a guild
            const guild = message.guild;
            const isGuildContext = guild ? true : false;

            if (args.length > 0) {
                const userMention = args[0];

                if (userMention.startsWith('<@') && userMention.endsWith('>')) {
                    // Extract user ID from mention
                    userId = userMention.replace(/[<@!>]/g, '');
                } else if (/^\d+$/.test(userMention)) {
                    // Use directly if it's a valid user ID
                    userId = userMention;
                } else {
                    // Check if it's a username
                    const username = userMention.toLowerCase();

                    if (isGuildContext) {
                        // Fetch user from guild context
                        const member = guild.members.cache.find(m => m.user.username.toLowerCase() === username);
                        if (member) {
                            userId = member.id;
                        } else {
                            return message.reply(`No user found with the username "${userMention}" in this guild.`);
                        }
                    } else {
                        // Fetch user from global data if not in a guild
                        const userObj = Object.values(users).find(u => u.username.toLowerCase() === username);
                        if (userObj) {
                            userId = Object.keys(users).find(key => users[key] === userObj);
                        } else {
                            return message.reply(`No user found with the username "${userMention}".`);
                        }
                    }
                }

                targetUsername = isGuildContext
                    ? message.guild.members.cache.get(userId)?.user.username || userMention
                    : users[userId]?.username || userMention;
            }

            // Fetch user data based on the context
            const user = isGuildContext ? getUserInGuild(guild.id, userId) : getUser(userId);

            if (!user) {
                return message.reply(`${targetUsername} needs to start the game first by using \`v life\`.`);
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

            // Fetch user avatar based on guild context
            const userAvatar = isGuildContext
                ? guild.members.cache.get(userId)?.user.displayAvatarURL() || message.author.displayAvatarURL()
                : message.client.users.cache.get(userId)?.displayAvatarURL() || message.author.displayAvatarURL();

            const embed = new MessageEmbed()
                .setColor('#0099ff')
                .setTitle(`${targetUsername}'s V-Coins Balance`)
                .setDescription(`${targetUsername} has ${numberFormat(balance)} V-Coins.\n\n${description}`)
                .addField('Bank Balance', `${numberFormat(bankBalance)} V-Coins`, true)
                .setTimestamp()
                .setThumbnail(userAvatar);

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in balance command:', error);
            message.reply('There was an error executing the balance command.');
        }
    }
};
