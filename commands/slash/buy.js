const { getUser, updateUser } = require('../../dataManager');
const shopData = require('../../config/shopData.json').items;
const numberFormat = require('../../utils/numberFormat');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop.')
    .addIntegerOption(option => 
      option.setName('item_id')
        .setDescription('ID of the item to buy')
        .setRequired(true)),
  
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = await getUser(userId);
    const itemId = interaction.options.getInteger('item_id');

    if (!user) {
      return interaction.reply('You need to start the game first by using `/start`.');
    }

    const item = shopData.find(i => i.id === itemId);

    if (!item) {
      return interaction.reply('That item does not exist in the shop.');
    }

    if (user.superCash < item.SuperCashCost) {
      return interaction.reply('You do not have enough SuperCash to purchase this item.');
    }

    const category = item.InstantCashTime > 0 ? 'instants' : 'boosters';
    const updatedInventory = user.inventory || {};

    if (!updatedInventory[category]) {
      updatedInventory[category] = [];
    }

    updatedInventory[category].push({
      itemId: item.id,
      itemName: item.ItemName,
      activeTime: item.ActiveTimeSeconds,
      incomeFactor: item.CompleteIncomeIncreaseFactor
    });

    try {
      await updateUser(userId, {
        superCash: user.superCash - item.SuperCashCost,
        inventory: updatedInventory
      });
      return interaction.reply(`You have successfully purchased ${item.ItemName} for ${numberFormat(item.SuperCashCost)} Super Cash!`);
    } catch (error) {
      return interaction.reply('An error occurred while processing your purchase.');
    }
  }
};