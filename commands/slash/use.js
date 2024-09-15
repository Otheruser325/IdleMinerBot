const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUser, updateUser } = require('../../dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use a booster from your inventory.')
        .addIntegerOption(option =>
            option.setName('itemid')
                .setDescription('The ID of the booster to use.')
                .setRequired(true)),
    async execute(interaction) {
        const userId = interaction.user.id;
        const itemId = interaction.options.getInteger('itemid');
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        // Find the booster in the inventory
        const booster = user.inventory.boosters.find(b => b.itemId === itemId);

        if (!booster) {
            return interaction.reply('You do not have that booster in your inventory.');
        }

        if (booster.stock <= 0) {
            return interaction.reply('You do not have enough stock of that booster.');
        }

        // Decrease stock
        booster.stock -= 1;

        // Determine the category based on `InstantCashTime` property
        const isInstant = booster.activeTime === 0;

        // Update activeBoosts
        const activeBoost = {
            itemId: booster.itemId,
            itemName: booster.itemName,
            activeTime: booster.activeTime,
            incomeFactor: booster.incomeFactor,
            endTime: Date.now() + (booster.activeTime * 1000)
        };

        // Add or update the booster in activeBoosts
        const existingBoostIndex = user.activeBoosts.findIndex(b => b.incomeFactor === activeBoost.incomeFactor);

        if (existingBoostIndex > -1) {
            const existingBoost = user.activeBoosts[existingBoostIndex];
            if (existingBoost.endTime < activeBoost.endTime) {
                existingBoost.endTime = activeBoost.endTime;
            }
        } else {
            user.activeBoosts.push(activeBoost);
        }

        // Update the user data
        try {
            await updateUser(userId, user);
            return interaction.reply(`You have successfully used the ${booster.itemName}!`);
        } catch (error) {
            console.error('Error updating user data:', error);
            return interaction.reply('An error occurred while using the booster.');
        }
    }
};