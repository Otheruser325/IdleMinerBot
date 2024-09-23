const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'monthly',
    description: 'Claim your monthly Super Cash (premium users only).',
    async execute(message) {  
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        if (!user.has_premium) {
            return message.reply('This is a premium feature. You need a premium pass to access it.');
        }

        const currentTime = Date.now();
        const cooldown = 30 * 24 * 60 * 60 * 1000; // 30 days

        if (currentTime - (user.last_monthly || 0) < cooldown) {
            const remainingTime = formatTime((user.last_monthly || 0) + cooldown - currentTime);
            return message.reply(`You can claim your monthly bonus again in ${remainingTime}.`);
        }

        const cash = 3000; // Premium monthly reward
        await updateUser(userId, {
            last_monthly: currentTime,
            super_cash: (user.super_cash || 0) + cash
        });

        const response = `You claimed ${numberFormat(cash)} Super Cash as your premium monthly bonus!`;
        await message.reply(response);
    }
};