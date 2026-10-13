/**
 * Shared upgrade planner for shafts, elevators and warehouses.
 *
 * The previous per-command loops re-scanned the whole data array with
 * `Array.find` once per purchased level (O(levels x records)) and coupled the
 * buy amount to a hardcoded list. The planner indexes the records once, walks
 * the cost curve a single time, and resolves the requested amount through
 * `resolvePurchaseCount`.
 */

import { resolvePurchaseCount } from './purchaseAmount.js';
import { moneyLt, toMoney } from './economyConstants.js';

export function planUpgrade({
    records,
    currentLevel,
    maxLevel,
    availableCash,
    purchaseAmount,
    scaleCost,
    superCashPerBigUpdate = 0,
    keyOf = record => record.Level
}) {
    const byLevel = new Map((Array.isArray(records) ? records : []).map(record => [keyOf(record), record]));
    const maxSteps = Math.max(0, Math.floor(Number(maxLevel) - Number(currentLevel)));

    let level = Number(currentLevel);
    let cash = toMoney(availableCash);
    let affordableCount = 0;
    for (let step = 0; step < maxSteps; step += 1) {
        const next = byLevel.get(level + 1);
        if (!next) break;
        const cost = toMoney(scaleCost(next));
        if (moneyLt(cash, cost)) break;
        cash -= cost;
        level += 1;
        affordableCount += 1;
    }

    const requestedCount = resolvePurchaseCount(purchaseAmount, affordableCount, { maxCount: affordableCount });
    const isExplicit = !purchaseAmount.isMax && !purchaseAmount.isPercent;
    const exceededRequest = isExplicit && requestedCount < purchaseAmount.amount;

    const appliedLevels = [];
    let applyLevel = Number(currentLevel);
    let applyCash = toMoney(availableCash);
    let totalCost = 0;
    let superCashEarned = 0;
    for (let index = 0; index < requestedCount; index += 1) {
        const next = byLevel.get(applyLevel + 1);
        if (!next) break;
        const cost = toMoney(scaleCost(next));
        if (moneyLt(applyCash, cost)) break;
        applyCash -= cost;
        totalCost += cost;
        applyLevel += 1;
        if (next.BigUpdate === 1) superCashEarned += superCashPerBigUpdate;
        appliedLevels.push(next);
    }

    return {
        byLevel,
        affordableCount,
        appliedCount: appliedLevels.length,
        exceededRequest,
        finalLevel: applyLevel,
        totalCost,
        superCashEarned,
        remainingCash: applyCash,
        appliedLevels
    };
}

export default { planUpgrade };
