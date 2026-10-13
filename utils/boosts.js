/**
 * Player booster engine.
 *
 * Boosters are stored on the user document as `active_boosts` and applied here.
 * Historically the inventory stored several incompatible shapes
 * (`income_factor`, `CompleteIncomeIncreaseFactor`, `instant_cash`), and nothing
 * ever read `active_boosts`, so purchased boosters had no gameplay effect.
 * Everything now flows through `normalizeBooster` + `summarizeBoosts`.
 */

import { MAX_BOOSTER_FACTOR } from './economyConstants.js';

const DURATION_FIELDS = ['active_time', 'activeTime', 'ActiveTimeSeconds', 'duration'];
const FACTOR_FIELDS = ['income_factor', 'incomeFactor', 'CompleteIncomeIncreaseFactor', 'IncomeFactor'];
const INSTANT_FIELDS = ['instant_cash', 'instantCash', 'InstantCashTime'];

function pickFirst(source, fields) {
    for (const field of fields) {
        if (source?.[field] !== undefined && source?.[field] !== null) {
            return source[field];
        }
    }
    return undefined;
}

/**
 * Coerce any stored booster/inventory item into the single canonical shape.
 * Returns null when the item is unusable so callers can skip it.
 */
export function normalizeBooster(source) {
    if (!source || typeof source !== 'object') return null;

    const activeTimeSeconds = Math.floor(Number(pickFirst(source, DURATION_FIELDS)));
    const rawFactor = Number(pickFirst(source, FACTOR_FIELDS));
    const rawInstant = Number(pickFirst(source, INSTANT_FIELDS));

    const incomeFactor = Number.isFinite(rawFactor) && rawFactor > 1
        ? Math.min(rawFactor, MAX_BOOSTER_FACTOR)
        : 1;
    const instantCashSeconds = Number.isFinite(rawInstant) && rawInstant > 0
        ? Math.floor(rawInstant)
        : 0;

    const isDurationBooster = Number.isFinite(activeTimeSeconds) && activeTimeSeconds > 0;
    const isInstantItem = instantCashSeconds > 0;
    if (!isDurationBooster && !isInstantItem) return null;

    return {
        itemId: Number(source.item_id ?? source.itemId ?? source.id ?? 0) || 0,
        itemName: String(source.item_name ?? source.itemName ?? 'Booster'),
        incomeFactor,
        activeTimeSeconds: isDurationBooster ? activeTimeSeconds : 0,
        instantCashSeconds,
        isInstantItem
    };
}

export function isActiveBoost(boost, now = Date.now()) {
    const endTime = Number(boost?.end_time);
    return Number.isFinite(endTime) && endTime > now;
}

export function filterActiveBoosts(boosts, now = Date.now()) {
    return (Array.isArray(boosts) ? boosts : []).filter(boost => isActiveBoost(boost, now));
}

/**
 * Fold all active duration boosters into one multiplier. Boosts of the same
 * income factor do not stack (matching the historical `use` behaviour); the
 * strongest active factor wins.
 */
export function getActiveBoostMultiplier(user, now = Date.now()) {
    const boosts = filterActiveBoosts(user?.active_boosts, now);
    return boosts.reduce((multiplier, boost) => {
        const factor = Number(boost?.income_factor ?? boost?.incomeFactor ?? 1);
        return Number.isFinite(factor) && factor > 1 ? Math.max(multiplier, factor) : multiplier;
    }, 1);
}

/**
 * Sum of every active instant-cash reward, expressed as seconds of the user's
 * current production. Callers convert this to currency with their own
 * production-per-second figure.
 */
export function getActiveInstantCashSeconds(user, now = Date.now()) {
    return filterActiveBoosts(user?.active_boosts, now).reduce((total, boost) => {
        const seconds = Number(boost?.instant_cash ?? boost?.instantCash ?? 0);
        return Number.isFinite(seconds) && seconds > 0 ? total + Math.floor(seconds) : total;
    }, 0);
}

export default {
    normalizeBooster,
    isActiveBoost,
    filterActiveBoosts,
    getActiveBoostMultiplier,
    getActiveInstantCashSeconds
};
