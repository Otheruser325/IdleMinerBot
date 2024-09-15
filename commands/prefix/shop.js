const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const shopData = require('../../config/shopData.json').items;
const numberFormat = require('../../utils/numberFormat');

module.exports = {
  name: 'shop',
  description: 'Browse and purchase special deals and boosters.',
  async execute(message) {
    const userId = message.author.id;
    const user = await getUser(userId);

    if (!user) {
      return message.reply('You need to start the game first by using `im!start`.');
    }

    let page = 0;
    const itemsPerPage = 2; // Set how many items to show per page
    const maxPage = Math.ceil(shopData.length / itemsPerPage) - 1;

    const generateEmbed = (page) => {
      const start = page * itemsPerPage;
      const end = start + itemsPerPage;
      const shopItems = shopData.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle('Shop - Special Deals & Boosters')
        .setColor('#0099ff')
        .setDescription('Here are the items available for purchase. Use the buttons below to navigate.');

      shopItems.forEach(item => {
        embed.addFields({
          name: `Item ID: ${item.id}`,
          value: `Cost: ${numberFormat(item.SuperCashCost)} SuperCash\nIncome Boost: ${item.CompleteIncomeIncreaseFactor}x\nActive Time: ${item.ActiveTimeSeconds / 3600} hours`,
        });
      });

      return embed;
    };

    const buttons = (page) => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPage)
        );
    };

    const embedMessage = await message.channel.send({
      embeds: [generateEmbed(page)],
      components: [buttons(page)]
    });

    const filter = i => i.user.id === message.author.id;
    const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'prev' && page > 0) {
        page--;
      } else if (interaction.customId === 'next' && page < maxPage) {
        page++;
      }

      await interaction.update({
        embeds: [generateEmbed(page)],
        components: [buttons(page)]
      });
    });
  }
};