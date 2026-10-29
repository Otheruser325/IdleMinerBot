'use strict';

/**
 * Per-user command cooldowns.
 *
 * Commands with no gameplay state of their own (notably `hello` and `info`) are
 * cheap to invoke but still cost a gateway event, a reply, and — for `info` — a
 * component collector. A spammer can therefore use them to keep the process busy
 * without any in-game cost. A short per-user cooldown removes that free path.
 */

// Only commands listed here are throttled; everything else keeps its own pacing
// (work cycles, purchase confirmation, etc.).
export const DEFAULT_COMMAND_COOLDOWNS_MS = Object.freeze({
    hello: 5_000,
    info: 5_000
});

const MAX_COOLDOWN_ENTRIES = 50_000;
const cooldowns = new Map();

function cooldownKey(userId, commandName) {
    return `${userId}-${commandName}`;
}

function pruneExpired(now) {
    for (const [key, expiration] of cooldowns) {
        if (expiration <= now) cooldowns.delete(key);
    }
}

export function getCommandCooldownMs(commandName, overrides = DEFAULT_COMMAND_COOLDOWNS_MS) {
    const configured = Number(overrides?.[String(commandName || '').toLowerCase()]);
    return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

export function setCooldown(userId, commandName, duration) {
    const key = cooldownKey(userId, commandName);
    const now = Date.now();
    if (cooldowns.size >= MAX_COOLDOWN_ENTRIES) pruneExpired(now);
    cooldowns.set(key, now + duration);
}

export function isCooldownActive(userId, commandName) {
    const key = cooldownKey(userId, commandName);
    const expirationTime = cooldowns.get(key);
    if (expirationTime === undefined) return 0;
    const remaining = expirationTime - Date.now();
    if (remaining <= 0) {
        cooldowns.delete(key);
        return 0;
    }
    return remaining / 1000;
}

/**
 * Enforce a command's cooldown. Returns `{ limited: false }` and arms the timer
 * on the first call, or `{ limited: true, remainingSeconds }` while it is hot.
 * A zero/absent cooldown is always allowed and never recorded.
 */
export function checkCommandCooldown(userId, commandName, overrides = DEFAULT_COMMAND_COOLDOWNS_MS) {
    if (!userId || !commandName) return { limited: false, remainingSeconds: 0 };
    const cooldownMs = getCommandCooldownMs(commandName, overrides);
    if (cooldownMs <= 0) return { limited: false, remainingSeconds: 0 };

    const remainingSeconds = isCooldownActive(userId, commandName);
    if (remainingSeconds > 0) {
        return { limited: true, remainingSeconds: Math.ceil(remainingSeconds) };
    }

    setCooldown(userId, commandName, cooldownMs);
    return { limited: false, remainingSeconds: 0 };
}

export function resetCooldownsForTests() {
    cooldowns.clear();
}

export default {
    DEFAULT_COMMAND_COOLDOWNS_MS,
    getCommandCooldownMs,
    setCooldown,
    isCooldownActive,
    checkCommandCooldown,
    resetCooldownsForTests
};
