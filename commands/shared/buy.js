import { getUser, updateUserTransaction, withUserLock } from '../../dataManager.js';
import commandContext from './context.js';
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
  const normalizedNumericInput = String(itemInput || '').trim();
  const numericId = /^\d+$/.test(normalizedNumericInput)
    ? Number.parseInt(normalizedNumericInput, 10)
    : Number.NaN;
  if (Number.isSafeInteger(numericId)) {
    return shopData.find(item => item.id === numericId) || null;
  }

  const normalizedInput = normalizeShopLookupValue(itemInput);
  return shopData.find(item => normalizeShopLookupValue(item.ItemName) === normalizedInput) || null;
}

export default {
  name: 'buy',
  description: 'Buy an item from the shop.',
  async execute(message, args = []) {
    const userId = commandContext.getActor(message)?.id;
    if (!userId) return commandContext.replyError(message, 'Unable to identify the player.');
    return withUserLock(userId, async () => {
      const user = await getUser(userId);
      const itemInput = args.join(' ');

      if (!user) {
        return commandContext.reply(message, `You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);
      }

      if (!isShopUnlocked(user)) {
        return commandContext.reply(message, 'Shop purchases unlock after you buy Shaft Tier 3 on Coal Mine for the first time.');
      }

      if (!itemInput) {
        return commandContext.reply(message, 'Please provide a valid shop item ID or name.');
      }

      const item = findShopItem(itemInput);

      if (!item) {
        return commandContext.reply(message, 'That item does not exist in the shop.');
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
          const checkoutResult = await createPremiumCheckoutSession(commandContext.getActor(message));
          if (!checkoutResult.ok || !checkoutResult.session?.url) {
            return message.reply('Premium Pass checkout is currently unavailable. Please try again later.');
          }

          await commandContext.getActor(message).send(
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

      try {
        const result = await updateUserTransaction(userId, current => {
          if (!current || (current.super_cash || 0) < item.SuperCashCost) return undefined;
          const inventory = structuredClone(current.inventory || {});
          const category = item.Category || (item.InstantCashTime > 0 ? 'instants' : 'boosters');
          inventory[category] = Array.isArray(inventory[category]) ? inventory[category] : [];
          const existingItem = inventory[category].find(entry => entry.item_id === item.id);
          if (existingItem) {
            existingItem.stock = (existingItem.stock || 0) + 1;
          } else {
            inventory[category].push({
              item_id: item.id,
              item_name: item.ItemName,
              active_time: item.ActiveTimeSeconds,
              income_factor: item.CompleteIncomeIncreaseFactor,
              instant_cash: item.InstantCashTime > 0 ? item.InstantCashTime : null,
              stock: 1
            });
          }
          return {
            ...current,
            super_cash: (current.super_cash || 0) - item.SuperCashCost,
            inventory
          };
        });
        if (!result.committed) {
          return message.reply('Your balance changed before the purchase was saved. Please try again.');
        }
        return message.reply(`You have successfully purchased ${item.ItemName} for ${numberFormat(item.SuperCashCost)} Super Cash!`);
      } catch (error) {
        logError('buy:execute', error, { userId, itemInput, itemId: item.id });
        return message.reply('An error occurred while processing your purchase.');
      }
    });
  }
};
