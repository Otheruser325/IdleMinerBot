import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import { calculateDailyReward, formatTime } from '../../utils/dailyManager.js';
import numberFormat from '../../utils/numberFormat.js';
import { getAccountAgeMs, isDailyUnlocked } from '../../utils/progression.js';

export default {
    name: 'daily',
    description: 'Claim your daily Super Cash.',
    async execute(message) {  
        const userId = message.author.id;  
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            const signupCooldown = 24 * 60 * 60 * 1000;
            if (!isDailyUnlocked(user) && getAccountAgeMs(user) < signupCooldown) {
                const remainingTime = formatTime(signupCooldown - getAccountAgeMs(user));
                return message.reply(`Daily is still locked for new signups. Unlock it early by buying Shaft Tier 2 on Coal Mine, or wait ${remainingTime}.`);
            }

            const currentTime = Date.now();
            const cooldown = 24 * 60 * 60 * 1000; 

            if (currentTime - (user.last_daily || 0) < cooldown) {
                const remainingTime = formatTime((user.last_daily || 0) + cooldown - currentTime);
                return message.reply(`You can claim your daily again in ${remainingTime}.`);
            }

            const cash = calculateDailyReward(user);
            await updateUser(userId, {
                last_daily: currentTime,
                streak: (user.streak || 0) + 1,
                super_cash: (user.super_cash || 0) + cash
            });

            const response = `You claimed ${numberFormat(cash)} Super Cash! Current streak: ${(user.streak || 0) + 1}.`;
            return message.reply(response);
        });
    }
};
