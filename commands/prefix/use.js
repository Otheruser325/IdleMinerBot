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
        const booster = user.inventory.boosters.find(b => b.item_id === itemId);

        if (!booster) {
            return message.reply('You do not have that booster in your inventory.');
        }

        if (booster.stock <= 0) {
            return message.reply('You do not have enough stock of that booster.');
        }

        // Decrease stock
        booster.stock -= 1;

        // Determine the category based on `InstantCashTime` property
        const isInstant = booster.active_time === 0;

        // Update active_boosts
        const activeBoost = {
            item_id: booster.item_id,
            item_name: booster.item_name,
            active_time: booster.active_time,
            income_factor: booster.income_factor,
            end_time: Date.now() + (booster.active_time * 1000)
        };
		
		// Initialize active boosts if they don't exist
		if (!user.active_boosts) {
		    user.active_boosts = [];
		}

        // Add or update the booster in active_boosts
        const existingBoostIndex = user.active_boosts.findIndex(b => b.income_factor === activeBoost.income_factor);

        if (existingBoostIndex > -1) {
            const existingBoost = user.active_boosts[existingBoostIndex];
            if (existingBoost.end_time < activeBoost.end_time) {
                existingBoost.end_time = activeBoost.end_time;
            }
        } else {
            user.active_boosts.push(activeBoost);
        }

        // Update the user data
        try {
            await updateUser(userId, user);
            return message.reply(`You have successfully used the ${booster.item_name}!`);
        } catch (error) {
			console.error('Error using boosts:', error);
            return message.reply('An error occurred while using the booster.');
        }
    }
};