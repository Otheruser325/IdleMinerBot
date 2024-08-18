const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'daily',
    description: 'Claim your daily rewards.',
    async execute(message) {  // Changed from interaction to message for prefix commands
        const userId = message.author.id;  // Correctly referencing message author
        const user = await getUser(userId);  // Await the result of getUser

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24-hour cooldown in milliseconds

        if (currentTime - user.lastDaily < cooldown) {
            const remainingTime = formatTime(user.lastDaily + cooldown - currentTime);
            return message.reply(`You can claim your daily again in ${remainingTime}.`);
        }

        // Calculate the daily reward
        const coins = calculateDailyReward(user);
        await updateUser(userId, {
            lastDaily: currentTime,
            streak: user.streak + 1,
            vCoins: user.vCoins + coins
        });

        const response = `You claimed ${numberFormat(coins)} V-Coins! Current streak: ${user.streak + 1}.`;
        await message.reply(response);
    }
};
