const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const { calculateDailyReward, formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'daily',
    description: 'Claim your daily V-Coins.',
    async execute(message) {  
        const userId = message.author.id;  
        const user = await getUser(userId);  

        if (!user) {
            return message.reply('You need to start the game first by using `v start`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; 

        if (currentTime - user.lastDaily < cooldown) {
            const remainingTime = formatTime(user.lastDaily + cooldown - currentTime);
            return message.reply(`You can claim your daily again in ${remainingTime}.`);
        }

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