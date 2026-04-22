import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import shopDataJson from '../../config/shopData.json' with { type: 'json' };
import numberFormat from '../../utils/numberFormat.js';
import { isShopUnlocked } from '../../utils/progression.js';
import { logError } from '../../utils/errorHandling.js';
import {
  createPremiumCheckoutSession,
  getPremiumPassDisplayPrice,
  isPremiumPassItem,
  isPremiumPaymentsConfigured
} from '../../utils/premiumPayments.js';

const shopData = shopDataJson.items;

function normalizeShopLookupValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findShopItem(itemInput) {
  const numericId = parseInt(itemInput, 10);
  if (!Number.isNaN(numericId)) {
    return shopData.find(item => item.id === numericId) || null;
  }

  const normalizedInput = normalizeShopLookupValue(itemInput);
  return shopData.find(item => normalizeShopLookupValue(item.ItemName) === normalizedInput) || null;
}

export default {
  name: 'buy',
  description: 'Buy an item from the shop.',
  async execute(message, args) {
    const userId = message.author.id;
    return withUserLock(userId, async () => {
      const user = await getUser(userId);
      const itemInput = args.join(' ');

      if (!user) {
        return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
      }

      if (!isShopUnlocked(user)) {
        return message.reply('Shop purchases unlock after you buy Shaft Tier 3 on Coal Mine for the first time.');
      }

      if (!itemInput) {
        return message.reply('Please provide a valid shop item ID or name.');
      }

      const item = findShopItem(itemInput);

      if (!item) {
        return message.reply('That item does not exist in the shop.');
      }

	  // Handle Premium Pass Purchase
      if (isPremiumPassItem(item)) {
	    if (user.has_premium) {
          return message.reply('You`ve already purchased the premium pass.');
        }

        if (!isPremiumPaymentsConfigured()) {
          return message.reply('Premium Pass payments are not configured yet. Set up Stripe first, then try again.');
        }

        try {
          const checkoutResult = await createPremiumCheckoutSession(message.author);
          if (!checkoutResult.ok || !checkoutResult.session?.url) {
            return message.reply('Premium Pass checkout is currently unavailable. Please try again later.');
          }

          await message.author.send(
            `Purchase your Premium Pass securely here:\n${checkoutResult.session.url}\n\nPrice: ${item.PriceDisplay || getPremiumPassDisplayPrice()}`
          );
          return message.reply('I sent you a secure Premium Pass checkout link in your DMs.');
        } catch (error) {
          if (error?.code === 50007 || error?.code === '50007') {
            return message.reply('I could not DM your Premium Pass checkout link because your DMs are closed. Please open your DMs and try again.');
          }

          logError('buy:premiumCheckout', error, { userId, itemInput, itemId: item.id });
          return message.reply('I could not create your Premium Pass checkout right now. Please try again later.');
        }
      }

      if (user.super_cash < item.SuperCashCost) {
        return message.reply('You do not have enough Super Cash to purchase this item.');
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
        logError('buy:execute', error, { userId, itemInput, itemId: item.id });
        return message.reply('An error occurred while processing your purchase.');
      }
    });
  }
};
