const { getUser, updateUser } = require('../dataManager');
const { MessageEmbed } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../utils/dailyManager');
const numberFormat = require('../utils/numberFormat');

module.exports = {
    name: 'daily',
    description: 'Claim your daily V-Coins.',
    async execute(message) {
        const userId = message.author.id;
        const user = getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `v life`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours cooldown in milliseconds

        if (currentTime - user.lastDaily < cooldown) {
            const remainingTime = formatTime(user.lastDaily + cooldown - currentTime);
            return message.reply(`You can claim your daily again in ${remainingTime}.`);
        }

        // Calculate daily reward
        const coins = calculateDailyReward(user);
        updateUser(userId, {
            lastDaily: currentTime,
            streak: user.streak + 1,
            vCoins: user.vCoins + coins
        });

        const response = `You claimed ${numberFormat(coins)} V-Coins! Current streak: ${user.streak + 1}.`;
        return message.reply(response);
    }
};
