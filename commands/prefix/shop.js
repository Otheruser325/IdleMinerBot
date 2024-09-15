const { getUser } = require('../../dataManager');
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
    const itemsPerPage = 4; // Increased items per page to 4
    const maxPage = Math.ceil(shopData.length / itemsPerPage) - 1;

    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
      } else {
        return `${seconds} second${seconds > 1 ? 's' : ''}`;
      }
    };

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
          name: `${item.ItemName} (ID: ${item.id})`,
          value: `Cost: ${numberFormat(item.SuperCashCost)} SuperCash\nIncome Boost: ${item.CompleteIncomeIncreaseFactor}x\nActive Time: ${formatTime(item.ActiveTimeSeconds)}`,
        });
      });

      return embed;
    };

    const buttons = (page, userId) => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`shop_prev_${userId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId(`shop_next_${userId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPage)
        );
    };

    try {
      const embedMessage = await message.channel.send({
        embeds: [generateEmbed(page)],
        components: [buttons(page, userId)]
      });

      const filter = i => i.user.id === message.author.id;
      const collector = embedMessage.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async interaction => {
        if (interaction.customId === `shop_prev_${userId}` && page > 0) {
          page--;
        } else if (interaction.customId === `shop_next_${userId}` && page < maxPage) {
          page++;
        }

        try {
          await interaction.update({
            embeds: [generateEmbed(page)],
            components: [buttons(page, userId)]
          });
        } catch (error) {
          if (error.code === 10008) {
            return;
          } else {
            console.error(`Unexpected error: ${error.message}`);
          }
        }
      });
    } catch (error) {
      if (error.code === 10008) {
        return;
      } else {
        console.error(`Error in shop command: ${error.message}`);
      }
    }
  }
};