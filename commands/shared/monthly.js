'use strict';

import numberFormat from '../../utils/numberFormat.js';
import { formatTime } from '../../utils/dailyManager.js';
import { isMonthlyUnlocked } from '../../utils/progression.js';
import commandContext from './context.js';
import { commitUserTransaction, getCommandUser } from './transactions.js';

const MONTH = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_REWARD = 3000;

async function handleMonthlyCommand(context) {
    await commandContext.defer(context);
    const user = await getCommandUser(context);
    if (!user) {
        return commandContext.reply(context, `You need to start the game first by using \`${commandContext.commandReference(context, 'start')}\`.`);
    }
    if (!user.has_premium) return commandContext.reply(context, 'This is a premium feature. You need a premium pass to access it.');
    if (!isMonthlyUnlocked(user)) return commandContext.reply(context, 'Monthly is locked until you unlock Shaft Tier 5 on Coal Mine for the first time.');

    const now = Date.now();
    const result = await commitUserTransaction(context, current => {
        if (!current || !current.has_premium || !isMonthlyUnlocked(current)) return undefined;
        if (now - Number(current.last_monthly || 0) < MONTH) return undefined;
        current.last_monthly = now;
        current.super_cash = (current.super_cash || 0) + MONTHLY_REWARD;
        return current;
    });

    if (!result.committed) {
        const current = await getCommandUser(context);
        const remaining = Number(current?.last_monthly || 0) + MONTH - now;
        if (current && remaining > 0) return commandContext.reply(context, `You can claim your monthly bonus again in ${formatTime(remaining)}.`);
        return commandContext.replyError(context, 'Your monthly bonus could not be saved. Please try again.');
    }

    return commandContext.reply(context, `You claimed ${numberFormat(MONTHLY_REWARD)} Super Cash as your premium monthly bonus!`);
}

export default { handleMonthlyCommand };
