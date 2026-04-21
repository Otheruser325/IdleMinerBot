import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { formatTime } from '../../utils/dailyManager.js';
import numberFormat from '../../utils/numberFormat.js';
import { isMonthlyUnlocked } from '../../utils/progression.js';

export default {
    name: 'monthly',
    description: 'Claim your monthly Super Cash (premium users only).',
    async execute(message) {  
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            if (!user.has_premium) {
                return message.reply('This is a premium feature. You need a premium pass to access it.');
            }

            if (!isMonthlyUnlocked(user)) {
                return message.reply('Monthly is locked until you unlock Shaft Tier 5 on Coal Mine for the first time.');
            }

            const currentTime = Date.now();
            const cooldown = 30 * 24 * 60 * 60 * 1000;

            if (currentTime - (user.last_monthly || 0) < cooldown) {
                const remainingTime = formatTime((user.last_monthly || 0) + cooldown - currentTime);
                return message.reply(`You can claim your monthly bonus again in ${remainingTime}.`);
            }

            const cash = 3000;
            await updateUser(userId, {
                last_monthly: currentTime,
                super_cash: (user.super_cash || 0) + cash
            });

            const response = `You claimed ${numberFormat(cash)} Super Cash as your premium monthly bonus!`;
            return message.reply(response);
        });
    }
};
