const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { getUser } = require('../../dataManager');
const numberFormat = require('../../utils/numberFormat');

const wealthDescriptions = [
    { minCash: 100000000000000000, description: 'Quadrillionaire!' },
    { minCash: 1000000000000000, description: 'Multitrillionaire!' },
    { minCash: 100000000000000, description: 'Trillionaire!' },
    { minCash: 1000000000000, description: 'Multibillionaire!' },
    { minCash: 100000000000, description: 'Billionaire!' },
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
        // Get the user ID (either the one mentioned or the one issuing the command)
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;

        // Fetch the user's data from the database
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply(`${targetUser.username} needs to start the game first by using \`/start\`.`);
        }

        // Extract and format the user's balance data
        const cash = user.cash || 0;
        const iceCash = user.iceCash || 0;
        const fireCash = user.fireCash || 0;
        const superCash = user.superCash || 0;

        // Determine the user's wealth status
        let description = 'Average';
        for (const wealth of wealthDescriptions) {
            if (superCash >= wealth.minCash) {
                description = wealth.description;
                break;
            }
        }

        // Fetch the user's avatar
        const userAvatar = targetUser.displayAvatarURL();

        // Build and send the balance embed message
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
