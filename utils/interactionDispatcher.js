'use strict';

function findHandler(registry, customId) {
    const exact = registry.get(customId);
    if (exact) return exact;

    for (const [pattern, entry] of registry) {
        if (!(pattern instanceof RegExp)) continue;
        pattern.lastIndex = 0;
        if (pattern.test(customId)) return entry;
    }
    return null;
}

export function registerInteraction(registry, handler) {
    if (!registry || typeof registry.set !== 'function') return false;
    if (!handler?.customId || typeof handler.execute !== 'function') return false;
    registry.set(handler.customId, handler);
    return true;
}

export function getStandaloneHandler(registry, customId) {
    const handler = findHandler(registry, customId);
    return handler && !handler.collectorOwned ? handler : null;
}

export default { registerInteraction, getStandaloneHandler };
