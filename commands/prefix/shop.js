import { getUser } from '../../dataManager.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import shopDataJson from '../../config/shopData.json' with { type: 'json' };
import numberFormat from '../../utils/numberFormat.js';
import { isShopUnlocked } from '../../utils/progression.js';
import { logError, safeUpdateInteraction } from '../../utils/errorHandling.js';
import { isPremiumPassItem } from '../../utils/premiumPayments.js';

const shopData = shopDataJson.items;

export default {
  name: 'shop',
  description: 'Browse and purchase special deals and boosters.',
  async execute(message) {
    const userId = message.author.id;
    const user = await getUser(userId);

    if (!user) {
      return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
    }

    if (!isShopUnlocked(user)) {
      return message.reply('Shop unlocks after you buy Shaft Tier 3 on Coal Mine for the first time.');
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
        const isPremiumItem = isPremiumPassItem(item);
        const priceLine = isPremiumItem
          ? `Price: ${item.PriceDisplay || 'Paid Offer'}`
          : `Cost: ${numberFormat(item.SuperCashCost)} Super Cash`;
        const detailLines = [priceLine];
        const hasInstantCash = (item.InstantCashTime || 0) > 0;
        const hasIncomeBoost = (item.CompleteIncomeIncreaseFactor || 0) > 0;

        if (!isPremiumItem) {
          if (hasInstantCash) {
            detailLines.push(`Instant Cash: ${formatTime(item.InstantCashTime)}`);
            detailLines.push('Type: Instant payout item');
          } else {
            if (hasIncomeBoost) {
              detailLines.push(`Income Boost: ${item.CompleteIncomeIncreaseFactor}x`);
            }
            detailLines.push(`Active Time: ${formatTime(item.ActiveTimeSeconds)}`);
          }
        } else {
          detailLines.push('Purchase Type: Secure external checkout');
          detailLines.push('Rewards: Premium pass, 1,000 Super Cash, Long x2 Boost, x10 Boost');
        }

        embed.addFields({
          name: `${item.ItemName} (ID: ${item.id})`,
          value: detailLines.join('\n'),
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
          await safeUpdateInteraction(interaction, {
            embeds: [generateEmbed(page)],
            components: [buttons(page, userId)]
          }, 'shop:collector:update', { userId: interaction?.user?.id, customId: interaction?.customId });
        } catch (error) {
          logError('shop:collector:update', error, { userId: interaction?.user?.id, customId: interaction?.customId });
        }
      });
    } catch (error) {
      logError('shop:execute', error, { userId: message?.author?.id });
    }
  }
};
