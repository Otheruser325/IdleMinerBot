import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import numberFormat from '../../utils/numberFormat.js';

export default {
    name: 'use',
    description: 'Use a booster from your inventory.',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);
            const itemId = parseInt(args[0], 10);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            user.inventory = user.inventory || {};
            user.inventory.boosters = user.inventory.boosters || [];

            const booster = user.inventory.boosters.find(b => b.item_id === itemId);

            if (!booster) {
                return message.reply('You do not have that booster in your inventory. Use `im!shop` to purchase boosters.');
            }

            if (booster.stock <= 0) {
                return message.reply('You do not have enough stock of that booster.');
            }

            booster.stock -= 1;

            const activeBoost = {
                item_id: booster.item_id,
                item_name: booster.item_name,
                active_time: booster.active_time,
                income_factor: booster.income_factor,
                end_time: Date.now() + (booster.active_time * 1000)
            };
		
		    if (!user.active_boosts) {
		        user.active_boosts = [];
		    }

            const existingBoostIndex = user.active_boosts.findIndex(b => b.income_factor === activeBoost.income_factor);

            if (existingBoostIndex > -1) {
                const existingBoost = user.active_boosts[existingBoostIndex];
                if (existingBoost.end_time < activeBoost.end_time) {
                    existingBoost.end_time = activeBoost.end_time;
                }
            } else {
                user.active_boosts.push(activeBoost);
            }

            try {
                await updateUser(userId, user);
                return message.reply(`You have successfully used the ${booster.item_name}!`);
            } catch (error) {
			    console.error('Error using boosts:', error);
                return message.reply('An error occurred while using the booster.');
            }
        });
    }
};
