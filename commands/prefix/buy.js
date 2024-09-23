const { getUser, updateUser } = require('../../dataManager');
const shopData = require('../../config/shopData.json').items;
const numberFormat = require('../../utils/numberFormat');
const sendPremiumDM = require('../../utils/sendPremiumDM');

module.exports = {
  name: 'buy',
  description: 'Buy an item from the shop.',
  async execute(message, args) {
    const userId = message.author.id;
    const user = await getUser(userId);
    const itemId = parseInt(args[0]);

    if (!user) {
      return message.reply('You need to start the game first by using `im!start`.');
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
      // Update user with premium benefits
      const updatedUser = {
        super_cash: user.super_cash - item.SuperCashCost,
        has_premium: true,
        super_cash: user.super_cash + 1000,
        inventory: user.inventory || {}
      };
	  
	  if (user.has_premium) return message.reply('You`ve already purchased the premium pass.');

      // Add 12-hour x2 and 1-hour x10 boosts to the user's inventory
      if (!updatedUser.inventory.boosters) updatedUser.inventory.boosters = [];
      updatedUser.inventory.boosters.push(
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

      await updateUser(userId, updatedUser);

      // Send DM to user
      await sendPremiumDM(message.author);

      return message.reply('Congratulations! You have purchased the Premium Pass and received your rewards!');
    }

    // Initialize user's inventory if it doesn't exist
    const updatedInventory = user.inventory || {};

    // Determine the category based on `InstantCashTime` property
    const category = item.Category || (item.InstantCashTime > 0 ? 'instants' : 'boosters');

    // Initialize the category in the inventory if it doesn't exist
    if (!updatedInventory[category]) {
      updatedInventory[category] = [];
    }

    // Check if the item already exists in the inventory
    const existingItem = updatedInventory[category].find(i => i.item_id === item.id);

    if (existingItem) {
      // If the item exists, just increment the stock
      existingItem.stock = (existingItem.stock || 0) + 1;
    } else {
      // Add the new item to the inventory with stock
      updatedInventory[category].push({
        item_id: item.id,
        item_name: item.ItemName,
        active_time: item.ActiveTimeSeconds,
        income_factor: item.CompleteIncomeIncreaseFactor,
        instant_cash: item.InstantCashTime > 0 ? item.InstantCashTime : null,
        stock: 1
      });
    }

    // Deduct Super Cash and update the user's inventory
    try {
      await updateUser(userId, {
        super_cash: user.super_cash - item.SuperCashCost,
        inventory: updatedInventory
      });
      return message.reply(`You have successfully purchased ${item.ItemName} for ${numberFormat(item.SuperCashCost)} Super Cash!`);
    } catch (error) {
      console.error(`Error updating user: ${error.message}`);
      return message.reply('An error occurred while processing your purchase.');
    }
  }
};