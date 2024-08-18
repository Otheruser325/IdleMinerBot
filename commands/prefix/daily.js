const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'daily',
    description: 'Claim your daily V-Coins.',
    async execute(interaction) {
        const userId = interaction.user.id;
        const user = getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/life`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24-hour cooldown in milliseconds

        if (currentTime - user.lastDaily < cooldown) {
            const remainingTime = formatTime(user.lastDaily + cooldown - currentTime);
            return interaction.reply(`You can claim your daily again in ${remainingTime}.`);
        }

        // Calculate the daily reward
        const coins = calculateDailyReward(user);
        updateUser(userId, {
            lastDaily: currentTime,
            streak: user.streak + 1,
            vCoins: user.vCoins + coins
        });

        const response = `You claimed ${numberFormat(coins)} V-Coins! Current streak: ${user.streak + 1}.`;
        await interaction.reply(response);
    }
};
