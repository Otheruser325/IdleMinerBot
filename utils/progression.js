function getCoalMine(user) {
    return (user?.mines || []).find(mine => mine.mine_number === 1 || mine.mine_name === 'Coal Mine') || null;
}

function hasCoalShaftTier(user, requiredTier) {
    const coalMine = getCoalMine(user);
    if (!coalMine) {
        return false;
    }

    return (coalMine.mineshafts || []).some(shaft => shaft.tier >= requiredTier);
}

export function isDailyUnlocked(user) {
    return hasCoalShaftTier(user, 2);
}

export function isShopUnlocked(user) {
    return hasCoalShaftTier(user, 3);
}

export function isMonthlyUnlocked(user) {
    return hasCoalShaftTier(user, 5);
}

export function getAccountAgeMs(user) {
    if (!user?.created_at) {
        return Number.MAX_SAFE_INTEGER;
    }

    const createdAtMs = new Date(user.created_at).getTime();
    if (Number.isNaN(createdAtMs)) {
        return Number.MAX_SAFE_INTEGER;
    }

    return Date.now() - createdAtMs;
}

export function getBoosterRewardFlags(user) {
    const inventory = user.inventory || {};
    inventory.flags = inventory.flags || {};
    return inventory.flags;
}

export default {
    isDailyUnlocked,
    isMonthlyUnlocked,
    isShopUnlocked,
    getAccountAgeMs,
    getBoosterRewardFlags
};
