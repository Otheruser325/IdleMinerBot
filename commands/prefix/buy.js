const { getUser, updateUser } = require('../../dataManager');
const shopData = require('../../config/shopData.json').items;
const numberFormat = require('../../utils/numberFormat');

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