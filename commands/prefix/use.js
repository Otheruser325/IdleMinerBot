const { getUser, updateUser } = require('../../dataManager');
const numberFormat = require('../../utils/numberFormat');

module.exports = {
    name: 'use',
    description: 'Use a booster from your inventory.',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);
        const itemId = parseInt(args[0]);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        // Find the booster in the inventory
        const booster = user.inventory.boosters.find(b => b.itemId === itemId);

        if (!booster) {
            return message.reply('You do not have that booster in your inventory.');
        }

        if (booster.stock <= 0) {
            return message.reply('You do not have enough stock of that booster.');
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
            return message.reply(`You have successfully used the ${booster.itemName}!`);
        } catch (error) {
            return message.reply('An error occurred while using the booster.');
        }
    }
};