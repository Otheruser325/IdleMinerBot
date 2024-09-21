const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../dataManager');
const numberFormat = require('../../utils/numberFormat');

const wealthDescriptions = [
    { minCash: 1e33, description: 'Decillionaire!' },
	{ minCash: 1e30, description: 'Nonillionaire!' },
    { minCash: 1e27, description: 'Octillionaire!' },
	{ minCash: 1e24, description: 'Septillionaire!' },
    { minCash: 1e21, description: 'Sextillionaire!' },
    { minCash: 1000000000000000000000, description: 'Quintillionaire!' },
    { minCash: 1000000000000000000, description: 'Quadrillionaire!' },
    { minCash: 10000000000000000, description: 'Multitrillionaire!' },
    { minCash: 1000000000000000, description: 'Trillionaire!' },
    { minCash: 10000000000000, description: 'Multibillionaire!' },
    { minCash: 1000000000000, description: 'Billionaire!' },
    { minCash: 10000000000, description: 'Multimillionaire!' },
    { minCash: 1000000000, description: 'Millionaire!' },
    { minCash: 100000000, description: 'Rich!' },
    { minCash: 10000000, description: 'Wealthy!' },
    { minCash: 1000000, description: 'Well-off!' },
    { minCash: 100000, description: 'Comfortable!' },
    { minCash: 10000, description: 'Stable!' },
    { minCash: 0, description: 'Average' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance and cash types.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose balance you want to check.')
                .setRequired(false)),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        const user = await getUser(userId);

        if (!user) {
            return interaction.reply(`${targetUser.username} needs to start the game first by using \`/start\`.`);
        }

        const cash = user.cash || 0;
        const iceCash = user.ice_cash || 0;
        const fireCash = user.fire_cash || 0;
        const superCash = user.super_cash || 0;

        let description = 'Average';
        for (const wealth of wealthDescriptions) {
            if (superCash >= wealth.minCash) {
                description = wealth.description;
                break;
            }
        }

        const userAvatar = targetUser.displayAvatarURL();

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}'s Balance`)
            .addFields(
                { name: 'Cash', value: `${numberFormat(cash)} Cash`, inline: true },
                { name: 'Ice Cash', value: `${numberFormat(iceCash)} Ice Cash`, inline: true },
                { name: 'Fire Cash', value: `${numberFormat(fireCash)} Fire Cash`, inline: true },
                { name: 'Super Cash', value: `${numberFormat(superCash)} Super Cash`, inline: true },
                { name: 'Wealth Status', value: description, inline: false }
            )
            .setTimestamp()
            .setThumbnail(userAvatar);

        await interaction.reply({ embeds: [embed] });
    }
};
