import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import shopDataJson from '../../config/shopData.json' with { type: 'json' };
import numberFormat from '../../utils/numberFormat.js';
import sendPremiumDM from '../../utils/sendPremiumDM.js';
import { isShopUnlocked } from '../../utils/progression.js';

const shopData = shopDataJson.items;

export default {
  name: 'buy',
  description: 'Buy an item from the shop.',
  async execute(message, args) {
    const userId = message.author.id;
    return withUserLock(userId, async () => {
      const user = await getUser(userId);
      const itemId = parseInt(args[0], 10);

      if (!user) {
        return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
      }

      if (!isShopUnlocked(user)) {
        return message.reply('Shop purchases unlock after you buy Shaft Tier 3 on Coal Mine for the first time.');
      }

      const item = shopData.find(i => i.id === itemId);

      if (!item) {
        return message.reply('That item does not exist in the shop.');
      }

      if (user.super_cash < item.SuperCashCost) {
        return message.reply('You do not have enough Super Cash to purchase this item.');
      }
	
	  // Handle Premium Pass Purchase
      if (item.ItemName === 'Premium Pass') {
	    if (user.has_premium) {
          return message.reply('You`ve already purchased the premium pass.');
        }

        const updatedInventory = structuredClone(user.inventory || {});

        if (!updatedInventory.boosters) {
          updatedInventory.boosters = [];
        }

        updatedInventory.boosters.push(
          {
            item_id: 2,
            item_name: 'Long x2 Boost',
            active_time: 43200,
            income_factor: 2,
            stock: 1
          },
          {
            item_id: 3,
            item_name: 'x10 Boost',
            active_time: 3600,
            income_factor: 10,
            stock: 1
          }
        );

        await updateUser(userId, {
          super_cash: (user.super_cash || 0) - item.SuperCashCost + 1000,
          has_premium: true,
          inventory: updatedInventory
        });

        await sendPremiumDM(message.author);
        return message.reply('Congratulations! You have purchased the Premium Pass and received your rewards!');
      }

      const updatedInventory = structuredClone(user.inventory || {});

      // Determine the category based on `InstantCashTime` property
      const category = item.Category || (item.InstantCashTime > 0 ? 'instants' : 'boosters');

      // Initialize the category in the inventory if it doesn't exist
      if (!updatedInventory[category]) {
        updatedInventory[category] = [];
      }

      // Check if the item already exists in the inventory
      const existingItem = updatedInventory[category].find(i => i.item_id === item.id);

      if (existingItem) {
        existingItem.stock = (existingItem.stock || 0) + 1;
      } else {
        updatedInventory[category].push({
          item_id: item.id,
          item_name: item.ItemName,
          active_time: item.ActiveTimeSeconds,
          income_factor: item.CompleteIncomeIncreaseFactor,
          instant_cash: item.InstantCashTime > 0 ? item.InstantCashTime : null,
          stock: 1
        });
      }

      try {
        await updateUser(userId, {
          super_cash: (user.super_cash || 0) - item.SuperCashCost,
          inventory: updatedInventory
        });
        return message.reply(`You have successfully purchased ${item.ItemName} for ${numberFormat(item.SuperCashCost)} Super Cash!`);
      } catch (error) {
        console.error(`Error updating user: ${error.message}`);
        return message.reply('An error occurred while processing your purchase.');
      }
    });
  }
};
