const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser } = require('../../dataManager');
const { formatTime, calculateDailyReward } = require('../../utils/dailyManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily rewards.'),
    async execute(interaction) {
        const userId = interaction.user.id;
        let user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const currentTime = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (currentTime - (user.last_daily || 0) < cooldown) {
            const remainingTime = formatTime((user.last_daily || 0) + cooldown - currentTime);
            return interaction.reply(`You can claim your daily again in ${remainingTime}.`);
        }

        const cash = calculateDailyReward(user);
        await updateUser(userId, {
            last_daily: currentTime,
            streak: (user.streak || 0) + 1,
            super_cash: (user.super_cash || 0) + cash
        });

        const response = `You claimed ${numberFormat(cash)} Super Cash! Current streak: ${(user.streak || 0) + 1}.`;
        await interaction.reply(response);
    }
};
