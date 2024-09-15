const { getUser, updateUser } = require('../../dataManager');
const shopData = require('../../data/shopData.json').items;
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

    if (user.superCash < item.SuperCashCost) {
      return message.reply('You do not have enough SuperCash to purchase this item.');
    }

    // Determine the category based on `InstantCashTime` property
    const category = item.InstantCashTime > 0 ? 'instants' : 'boosters';

    // Initialize user's inventory if it doesn't exist
    const updatedInventory = user.inventory || {};

    // Check if the category exists in the inventory, if not, initialize it
    if (!updatedInventory[category]) {
      updatedInventory[category] = [];
    }

    // Add the purchased item to the appropriate category in the inventory
    updatedInventory[category].push({
      itemId: item.id,
      itemName: item.ItemName, // Ensure this is present in the item data
      activeTime: item.ActiveTimeSeconds,
      incomeFactor: item.CompleteIncomeIncreaseFactor
    });

    // Deduct Super Cash and update the user's inventory
    try {
      await updateUser(userId, {
        superCash: user.superCash - item.SuperCashCost,
        inventory: updatedInventory
      });
      return message.reply(`You have successfully purchased ${item.ItemName} for ${numberFormat(item.SuperCashCost)} Super Cash!`);
    } catch (error) {
      if (error.code === 10008) {
        return message.channel.send('An error occurred, please try again.');
      }
      throw error;
    }
  }
};