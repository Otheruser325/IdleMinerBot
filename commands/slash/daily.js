const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser, saveUserData } = require('../../dataManager');
const { formatTime } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily rewards.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        let user = getUser(userId);  // Fetch user using the getUser function from the data manager

        if (!user) {
            return message.reply('You need to start the game first by using `/start`.');
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
