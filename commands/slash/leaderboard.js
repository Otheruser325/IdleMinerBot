const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const { getAllUsers } = require('../../dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top 15 users in the guild by cash.'),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply('You must be in an active guild to view leaderboards.');
        }

        try {
            const guildMembers = await interaction.guild.members.fetch(); // Fetch all guild members
            const allUsers = await getAllUsers(); // Fetch all users from the database

            if (!allUsers || Object.keys(allUsers).length === 0) {
                return interaction.reply('No users found.');
            }

            const minCashThreshold = 1000; // Minimum cash for cash, iceCash, and fireCash

            // Mapping for proper cash type labels
            const cashTypeLabels = {
                cash: 'Cash',
                ice_cash: 'Ice Cash',
                fire_cash: 'Fire Cash',
                super_cash: 'Super Cash'
            };

            // Function to get the top 15 users for a specific cash type
            const getTopUsers = (cashType) => {
                return Object.values(allUsers)
                    .filter(user =>
                        guildMembers.has(user.userId) && // Check if the user exists in the guild
                        (
                            (cashType === 'super_cash' && user[cashType] > 0) || // Filter out users with zero superCash
                            (user[cashType] && user[cashType] >= minCashThreshold) // Apply minimum cash for other types
                        )
                    )
                    .sort((a, b) => (b[cashType] || 0) - (a[cashType] || 0))
                    .slice(0, 15); // Return top 15 users
            };

            // Function to create the embed and buttons
            const createLeaderboardEmbed = (cashType) => {
                const topUsers = getTopUsers(cashType);
                const cashTypeLabel = cashTypeLabels[cashType]; // Use mapped label for display

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
                        new ButtonBuilder().setCustomId('ice_cash').setLabel('Ice Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('fire_cash').setLabel('Fire Cash').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('super_cash').setLabel('Super Cash').setStyle(ButtonStyle.Primary)
                    );

                return { embeds: [embed], components: [row] };
            };

            // Send the initial reply with the leaderboard
            await interaction.reply(createLeaderboardEmbed('cash'));

            // Interaction filter for button clicks
            const filter = (i) => ['cash', 'ice_cash', 'fire_cash', 'super_cash'].includes(i.customId) && i.user.id === interaction.user.id;

            // Create a message component collector for the buttons
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            // Handle button interactions
            collector.on('collect', async (i) => {
                if (i.customId === 'cash') await i.update(createLeaderboardEmbed('cash'));
                if (i.customId === 'ice_cash') await i.update(createLeaderboardEmbed('ice_cash'));
                if (i.customId === 'fire_cash') await i.update(createLeaderboardEmbed('fire_cash'));
                if (i.customId === 'super_cash') await i.update(createLeaderboardEmbed('super_cash'));
            });

            // Clean up after collector ends
            collector.on('end', async () => {
                try {
                    // Disable buttons after the collector ends
                    await interaction.editReply({ components: [] });
                } catch (error) {
                    if (error.code === 10008) {
                        return interaction.followUp('The leaderboard embed was deleted and unable to be fetched, please try again later.');
                    }
                }
            });

        } catch (error) {
            console.error('Error in leaderboard command:', error);
            return interaction.reply('There was an error executing the leaderboard command.');
        }
    }
};