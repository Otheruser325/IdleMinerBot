const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const { getAllUsers } = require('../../dataManager');

module.exports = {
    name: 'leaderboard',
    description: 'Displays the top 15 users in the guild by cash.',
    aliases: ['lb'],
    async execute(message) {
        try {
            const guildId = message.guild.id;
            const guildMembers = message.guild.members.cache;
            const allUsers = await getAllUsers(); // Fetch all users

            if (!allUsers || Object.keys(allUsers).length === 0) {
                return message.reply('No users found.');
            }

            const minCashThreshold = 1000; // Minimum cash for cash, iceCash, and fireCash
            const getTopUsers = (cashType) => {
                return Object.values(allUsers)
                    .filter(user => 
                        guildMembers.has(user.userId) && // Check if the user exists in the guild
                        (
                            cashType === 'superCash' || // No restriction for superCash
                            (user[cashType] && user[cashType] >= minCashThreshold) // Apply minimum cash for other types
                        )
                    )
                    .sort((a, b) => (b[cashType] || 0) - (a[cashType] || 0))
                    .slice(0, 15); // Top 15 users
            };

            const displayLeaderboard = async (cashType, interaction) => {
                const topUsers = getTopUsers(cashType);
                const cashTypeLabel = cashType.charAt(0).toUpperCase() + cashType.slice(1);

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`${cashTypeLabel} Leaderboard - Top 15`)
                    .setDescription(
                        topUsers.length
                            ? topUsers.map((user, index) => `${index + 1}. ${guildMembers.get(user.userId)?.user.username || 'Unknown'} - ${numberFormat(user[cashType])} ${cashTypeLabel}`).join('\n')
                            : 'No users found'
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('cash').setLabel('Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('iceCash').setLabel('Ice Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('fireCash').setLabel('Fire Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('superCash').setLabel('Super Cash').setStyle(ButtonStyle.Primary)
                    );

                if (interaction) {
                    await interaction.update({ embeds: [embed], components: [row] });
                } else {
                    return message.reply({ embeds: [embed], components: [row] });
                }
            };

            const msg = await displayLeaderboard('cash');

            const filter = (interaction) => ['cash', 'iceCash', 'fireCash', 'superCash'].includes(interaction.customId) && interaction.user.id === message.author.id;

            const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async (interaction) => {
                if (interaction.customId === 'cash') await displayLeaderboard('cash', interaction);
                if (interaction.customId === 'iceCash') await displayLeaderboard('iceCash', interaction);
                if (interaction.customId === 'fireCash') await displayLeaderboard('fireCash', interaction);
                if (interaction.customId === 'superCash') await displayLeaderboard('superCash', interaction);
            });

            collector.on('end', async () => {
                try {
                    await msg.edit({ components: [] });
                } catch (error) {
                    if (error.code === 10008) {
                        return message.reply('The leaderboard embed was deleted and unable to be fetched, please try again later.');
                    }
                }
            });
        } catch (error) {
            console.error('Error in leaderboard command:', error);
            return message.reply('There was an error executing the leaderboard command.');
        }
    }
};