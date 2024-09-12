const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'daily',
    description: 'Claim your daily Super Cash.',
    async execute(message) {  
        const userId = message.author.id;  
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; 

        if (currentTime - (user.lastDaily || 0) < cooldown) {
            const remainingTime = formatTime((user.lastDaily || 0) + cooldown - currentTime);
            return message.reply(`You can claim your daily again in ${remainingTime}.`);
        }

        const cash = calculateDailyReward(user);
        await updateUser(userId, {
            lastDaily: currentTime,
            streak: (user.streak || 0) + 1,
            superCash: (user.superCash || 0) + cash
        });

        const response = `You claimed ${numberFormat(cash)} Super Cash! Current streak: ${(user.streak || 0) + 1}.`;
        await message.reply(response);
    }
};
