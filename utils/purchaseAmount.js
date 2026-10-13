/**
 * Upgrade amount parsing.
 *
 * Historically callers only accepted a hardcoded set ([1, 10, 50]) which made
 * "buy some levels" awkward and coupled the command layer to fixed amounts.
 * Amounts are now relative: an explicit level count, a percentage of what the
 * player can currently afford, or MAX. That keeps the purchase stable as the
 * cost curve grows.
 */

const MAX_ABSOLUTE_COUNT = 100000;

function parsePositiveInt(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function parsePurchaseAmount(token, options = {}) {
    const { defaultAmount = 1, allowMax = true, allowPercent = true } = options;

    if (token === undefined || token === null || String(token).trim() === '') {
        const amount = parsePositiveInt(defaultAmount) || 1;
        return { ok: true, isMax: false, isPercent: false, percent: 0, amount, label: `x${amount}` };
    }

    const normalized = String(token).trim().toUpperCase();

    if (allowMax && (normalized === 'MAX' || normalized === '-1')) {
        return { ok: true, isMax: true, isPercent: false, percent: 100, amount: null, label: 'MAX' };
    }

    const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)%$/);
    if (allowPercent && percentMatch) {
        const percent = Number(percentMatch[1]);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
            return { ok: false, message: 'Please provide a percentage between 1% and 100%.' };
        }
        return { ok: true, isMax: false, isPercent: true, percent, amount: null, label: `${percent}%` };
    }

    const absoluteMatch = normalized.match(/^(?:X)?(\d+)$/);
    if (absoluteMatch) {
        const amount = parseInt(absoluteMatch[1], 10);
        if (amount < 1 || amount > MAX_ABSOLUTE_COUNT) {
            return {
                ok: false,
                message: `Please provide a level count between 1 and ${MAX_ABSOLUTE_COUNT}, a percentage such as 25%, or MAX.`
            };
        }
        return { ok: true, isMax: false, isPercent: false, percent: 0, amount, label: `x${amount}` };
    }

    return {
        ok: false,
        message: 'Please provide a level count (for example 5), a percentage such as 25%, or MAX.'
    };
}

/**
 * Turn a parsed amount into the number of levels to actually buy, given how
 * many the player can afford and how many are still available.
 */
export function resolvePurchaseCount(purchaseAmount, affordableCount, options = {}) {
    if (!purchaseAmount || purchaseAmount.ok === false) return 0;

    const { maxCount = Infinity } = options;
    const affordable = Math.max(0, Math.floor(Number(affordableCount) || 0));
    const ceiling = Math.min(affordable, Math.max(0, Number(maxCount) || 0));

    if (purchaseAmount.isMax) return ceiling;
    if (purchaseAmount.isPercent) {
        const desired = Math.ceil(affordable * (purchaseAmount.percent / 100));
        return Math.min(Math.max(desired, 1), ceiling);
    }

    return Math.min(parsePositiveInt(purchaseAmount.amount) || 0, ceiling);
}

export default { parsePurchaseAmount, resolvePurchaseCount };
