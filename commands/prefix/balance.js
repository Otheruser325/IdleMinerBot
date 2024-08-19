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

            // Determine if the command is executed in a guild context
            const isGuildContext = Boolean(guild);

            // Parse arguments for target user if provided
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

            // Fetch user data from the guild
            const user = isGuildContext ? await getUserInGuild(guild.id, userId) : await getUser(userId);

            // Check if user exists
            if (!user) {
                // Try to add the user to the guild if they exist in the users collection but not in the guild
                const globalUser = await getUser(userId);
                if (globalUser) {
                    await addUserToGuild(guild.id, userId);
                } else {
                    return message.reply(`${targetUsername} needs to start the game first by using \`im!start\`.`);
                }
            }

            // Fetch updated user data after adding to the guild
            const updatedUser = await getUserInGuild(guild.id, userId);

            // Extract and format user's balance data
            const cash = updatedUser.cash || 0;
            const iceCash = updatedUser.iceCash || 0;
            const fireCash = updatedUser.fireCash || 0;
            const superCash = updatedUser.superCash || 0;

            // Determine user's wealth status
            let description = 'Average';
            for (const wealth of wealthDescriptions) {
                if (superCash >= wealth.minCash) {
                    description = wealth.description;
                    break;
                }
            }

            // Fetch user's avatar
            const userAvatar = isGuildContext
                ? guild.members.cache.get(userId)?.user.displayAvatarURL() || message.author.displayAvatarURL()
                : message.client.users.cache.get(userId)?.displayAvatarURL() || message.author.displayAvatarURL();

            // Build and send the balance embed message
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
