'use strict';

import numberFormat from '../../utils/numberFormat.js';
import { calculateDailyReward, formatTime } from '../../utils/dailyManager.js';
import { getAccountAgeMs, isDailyUnlocked } from '../../utils/progression.js';
import commandContext from './context.js';
import { commitUserTransaction, getCommandUser } from './transactions.js';

const DAY = 24 * 60 * 60 * 1000;

async function handleDailyCommand(context) {
    await commandContext.defer(context);
    const actor = commandContext.getActor(context);
    if (!actor?.id) return commandContext.replyError(context, 'Unable to identify the player.');

    const user = await getCommandUser(context);
    if (!user) {
        return commandContext.reply(context, `You need to start the game first by using \`${commandContext.commandReference(context, 'start')}\`.`);
    }

    if (!isDailyUnlocked(user) && getAccountAgeMs(user) < DAY) {
        const remainingTime = formatTime(DAY - getAccountAgeMs(user));
        return commandContext.reply(context, `Daily is still locked for new signups. Unlock it early by buying Shaft Tier 2 on Coal Mine, or wait ${remainingTime}.`);
    }

    const now = Date.now();
    const result = await commitUserTransaction(context, current => {
        if (!current) return undefined;
        const lastDaily = Number(current.last_daily || 0);
        if (now - lastDaily < DAY) return undefined;

        const reward = calculateDailyReward(current);
        current.last_daily = now;
        current.streak = (current.streak || 0) + 1;
        current.super_cash = (current.super_cash || 0) + reward;
        return current;
    });

    if (!result.committed) {
        const current = await getCommandUser(context);
        const remaining = (Number(current?.last_daily || 0) + DAY) - now;
        if (current && remaining > 0) {
            return commandContext.reply(context, `You can claim your daily again in ${formatTime(remaining)}.`);
        }
        return commandContext.replyError(context, 'Your daily reward could not be saved. Please try again.');
    }

    return commandContext.reply(context, `You claimed ${numberFormat(result.user.super_cash - (user.super_cash || 0))} Super Cash! Current streak: ${result.user.streak}.`);
}

export default { handleDailyCommand };
