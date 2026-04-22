import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import { getAllUsers } from '../../dataManager.js';
import { logError, safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';

export default {
    name: 'leaderboard',
    description: 'Displays the top 15 users in the guild by cash.',
    aliases: ['lb'],
    async execute(message) {
        try {
            if (!message.guild) {
                return message.reply('Leaderboards are only available in servers.');
            }
            
            // Fetch all members, this ensures we have the latest member data
            const guildMembers = await message.guild.members.fetch();
            const allUsers = await getAllUsers(); // Fetch all users from the database

            if (!allUsers || Object.keys(allUsers).length === 0) {
                return message.reply('No users found.');
            }

            const minCashThreshold = 1000; // Minimum cash for cash, iceCash, and fireCash

            // Mapping for proper cash type labels
            const cashTypeLabels = {
                cash: 'Cash',
                ice_cash: 'Ice Cash',
                fire_cash: 'Fire Cash',
                dawn_cash: 'Dawn Cash',
                super_cash: 'Super Cash'
            };

            // Function to get the top 15 users for a specific cash type
            const getTopUsers = (cashType) => {
                return Object.values(allUsers)
                    .filter(user => 
                        guildMembers.has(user.user_id) && // Check if the user exists in the guild
                        (
                            (cashType === 'super_cash' && user[cashType] > 0) || // Filter out users with zero superCash
                            (user[cashType] && user[cashType] >= minCashThreshold) // Apply minimum cash for other types
                        )
                    )
                    .sort((a, b) => (b[cashType] || 0) - (a[cashType] || 0))
                    .slice(0, 15); // Return top 15 users
            };

            // Function to display the leaderboard
            const displayLeaderboard = async (cashType, interaction) => {
                const topUsers = getTopUsers(cashType);
                const cashTypeLabel = cashTypeLabels[cashType]; // Use mapped label for display

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`${cashTypeLabel} Leaderboard - Top 15`)
                    .setDescription(
                        topUsers.length
                            ? topUsers.map((user, index) => `${index + 1}. ${guildMembers.get(user.user_id)?.user.username || 'Unknown'} - ${numberFormat(user[cashType])} ${cashTypeLabel}`).join('\n')
                            : 'No users found'
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('cash').setLabel('Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('ice_cash').setLabel('Ice Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('fire_cash').setLabel('Fire Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('dawn_cash').setLabel('Dawn Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('super_cash').setLabel('Super Cash').setStyle(ButtonStyle.Primary)
                    );

                if (interaction) {
                    await safeUpdateInteraction(
                        interaction,
                        { embeds: [embed], components: [row] },
                        'leaderboard:update',
                        { userId: interaction?.user?.id, cashType }
                    );
                } else {
                    return message.reply({ embeds: [embed], components: [row] });
                }
            };

            const msg = await displayLeaderboard('cash');

            // Interaction filter for button clicks
            const filter = (interaction) => ['cash', 'ice_cash', 'fire_cash', 'dawn_cash', 'super_cash'].includes(interaction.customId) && interaction.user.id === message.author.id;

            // Create a message component collector for the buttons
            const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

            // Handle button interactions
            collector.on('collect', async (interaction) => {
                try {
                    if (interaction.customId === 'cash') await displayLeaderboard('cash', interaction);
                    if (interaction.customId === 'ice_cash') await displayLeaderboard('ice_cash', interaction);
                    if (interaction.customId === 'fire_cash') await displayLeaderboard('fire_cash', interaction);
                    if (interaction.customId === 'dawn_cash') await displayLeaderboard('dawn_cash', interaction);
                    if (interaction.customId === 'super_cash') await displayLeaderboard('super_cash', interaction);
                } catch (error) {
                    logError('leaderboard:collector', error, { userId: interaction?.user?.id, customId: interaction?.customId });
                }
            });

            // Clean up after collector ends
            collector.on('end', async () => {
                await safeEditMessage(msg, { components: [] }, 'leaderboard:collector:end', { messageId: msg?.id });
            });
        } catch (error) {
            logError('leaderboard:execute', error, { userId: message?.author?.id, guildId: message?.guild?.id });
            return message.reply('There was an error executing the leaderboard command.');
        }
    }
};
