/**
 * Central economy constants and precision helpers.
 *
 * Currency is stored as IEEE-754 doubles, so integer precision is lost beyond
 * 2^53 and large late-game balances are stored as powers of ten. Every money
 * comparison therefore needs a relative tolerance instead of exact equality,
 * and every arithmetic result is clamped so Infinity/NaN can never reach the
 * database document.
 */

export const MONEY_EPSILON = 1e-9;
export const MAX_SAFE_MONEY = 1e300;
export const MAX_BOOSTER_FACTOR = 1e6;

export function toMoney(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(Math.max(numeric, 0), MAX_SAFE_MONEY);
}

export function moneyAdd(left, right) {
    return toMoney(toMoney(left) + toMoney(right));
}

export function moneySub(left, right) {
    return toMoney(toMoney(left) - toMoney(right));
}

function relativeTolerance(left, right) {
    return MONEY_EPSILON * Math.max(1, Math.abs(toMoney(left)), Math.abs(toMoney(right)));
}

export function moneyEquals(left, right) {
    return Math.abs(toMoney(left) - toMoney(right)) <= relativeTolerance(left, right);
}

export function moneyGte(left, right) {
    return moneyEquals(left, right) || toMoney(left) > toMoney(right);
}

export function moneyLt(left, right) {
    return !moneyGte(left, right);
}

/**
 * Strict affordability check for spending.
 *
 * Unlike `moneyGte`, this deliberately does NOT treat values inside the relative
 * epsilon as equal. `moneyLt`/`moneyGte` are correct for display and de-duplication,
 * where a difference of one part in 1e9 is noise -- but they must never gate a
 * debit. At late-game scale (1e170) the tolerant window spans ~1e161, so a wallet
 * that is genuinely short of a cost would be accepted, and the subsequent
 * subtraction would drive the balance negative (making every later purchase free).
 */
export function moneyCovers(available, cost) {
    return toMoney(available) >= toMoney(cost);
}

export default {
    MONEY_EPSILON,
    MAX_SAFE_MONEY,
    MAX_BOOSTER_FACTOR,
    toMoney,
    moneyAdd,
    moneySub,
    moneyEquals,
    moneyGte,
    moneyLt,
    moneyCovers
};
