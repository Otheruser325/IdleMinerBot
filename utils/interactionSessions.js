'use strict';

import dataManager from '../dataManager.js';
import { getInteractionContext, logError } from './errorHandling.js';

const {
    createInteractionSession,
    closeInteractionSession,
    getAllInteractionSessions,
    removeInteractionSession
} = dataManager;

let persistenceDisabledUntil = 0;
let persistenceWarningLogged = false;
let sessionSequence = 0;
const activeCollectorMessages = new Map();
const activeCollectorMessageOwners = new Map();
const activeCollectorOwners = new Map();
const reservedComponentOwners = new Map();
const activeComponentActions = new Set();

function persistenceUnavailable(error) {
    return ["PGRST204", "PGRST205", "42P01", 404, "404", 408, 429, "429"].includes(error?.code)
        || /interaction_sessions|relation .* does not exist|schema cache|timed out|timeout|network|fetch failed|connection reset/i.test(String(error?.message || ""));
}

function markPersistenceUnavailable(error) {
    if (!persistenceUnavailable(error)) return;
    // Avoid hammering a slow or unavailable database from the cron loop. The
    // next cleanup attempt is deferred while Discord commands continue to work.
    persistenceDisabledUntil = Date.now() + 5 * 60_000;
    if (!persistenceWarningLogged) {
        persistenceWarningLogged = true;
        const message = String(error?.message || '').toLowerCase();
        const reason = /timed out|timeout|network|fetch failed|connection reset/.test(message)
            ? 'Supabase is slow or temporarily unavailable.'
            : 'The interaction_sessions table is missing or not in the schema cache.';
        console.warn(`[interaction-sessions] ${reason} Cleanup is paused temporarily.`);
    }
}

function messageIdentity(message) {
    const messageId = message?.id;
    const channelId = message?.channelId || message?.channel?.id;
    if (!messageId || !channelId) return null;
    return {
        messageId: String(messageId),
        channelId: String(channelId),
        guildId: message.guildId || message.guild?.id || null
    };
}

function sessionIdFor(message, kind = "components") {
    const identity = messageIdentity(message);
    if (!identity) return null;
    return `component:${kind}:${identity.channelId}:${identity.messageId}:${Date.now()}:${++sessionSequence}`;
}

function messageKey(session) {
    return session?.channelId && session?.messageId
        ? `${session.channelId}:${session.messageId}`
        : null;
}

export { persistenceUnavailable };

export async function trackComponentMessage(message, {
    kind = "components",
    ownerId = null,
    expiresAt = Date.now() + 60_000,
    sessionId = sessionIdFor(message, kind)
} = {}) {
    const identity = messageIdentity(message);
    if (!identity || !sessionId || Date.now() < persistenceDisabledUntil) return null;

    try {
        await createInteractionSession(sessionId, {
            ...identity,
            ownerId: ownerId || null,
            kind,
            expiresAt: Number(expiresAt) || Date.now(),
            status: "active",
            createdAt: Date.now()
        });
        return sessionId;
    } catch (error) {
        markPersistenceUnavailable(error);
        if (Date.now() >= persistenceDisabledUntil) {
            logError("interaction-sessions.track", error, { sessionId, kind, ...identity });
        }
        return null;
    }
}

export async function closeComponentMessage(sessionId, reason = "collector-ended") {
    if (!sessionId) return false;
    try {
        await closeInteractionSession(sessionId, reason);
        return true;
    } catch (error) {
        markPersistenceUnavailable(error);
        if (Date.now() >= persistenceDisabledUntil) {
            logError("interaction-sessions.close", error, { sessionId, reason });
        }
        return false;
    }
}

export async function acknowledgeComponent(interaction, scope = "component") {
    if (!interaction) return false;
    if (interaction.replied || interaction.deferred) return true;

    // Buttons and select menus acknowledge with deferUpdate; modal submits do
    // not expose deferUpdate and need a normal deferred reply instead.
    const acknowledge = typeof interaction.deferUpdate === "function"
        ? () => interaction.deferUpdate()
        : typeof interaction.deferReply === "function"
            ? () => interaction.deferReply({ ephemeral: true })
            : null;
    if (!acknowledge) return true;

    try {
        await acknowledge();
        return true;
    } catch (error) {
        if (![10062, 40060, "10062", "40060"].includes(error?.code)) {
            logError(`interaction-sessions.${scope}.acknowledge`, error, getInteractionContext(interaction));
        }
        return false;
    }
}

export async function updateComponent(interaction, payload) {
    if (!interaction) return false;
    try {
        if (interaction.deferred || interaction.replied) {
            if (typeof interaction.editReply === 'function') return await interaction.editReply(payload);
            if (typeof interaction.followUp === 'function') return await interaction.followUp(payload);
            return false;
        }
        if (typeof interaction.update === 'function') return await interaction.update(payload);
        if (typeof interaction.reply === 'function') return await interaction.reply(payload);
        return false;
    } catch (error) {
        if (typeof interaction.message?.edit === "function") return interaction.message.edit(payload);
        throw error;
    }
}

export function replyComponent(interaction, payload) {
    if (!interaction) return Promise.resolve(false);
    if (interaction.replied || interaction.deferred) {
        const followUpPayload = typeof payload === "string"
            ? { content: payload, ephemeral: true }
            : { ...payload, ephemeral: payload?.ephemeral ?? true };
        if (typeof interaction.followUp === "function") return interaction.followUp(followUpPayload);
        if (typeof interaction.editReply === "function") return interaction.editReply(payload);
        return Promise.resolve(false);
    }
    return interaction.reply(payload);
}

export function hasActiveComponentCollector(messageId) {
    return Boolean(messageId && activeCollectorMessages.has(String(messageId)));
}

export function getComponentCollectorOwner(messageId) {
    const owners = activeCollectorMessageOwners.get(String(messageId || ""));
    return owners?.values().next().value || null;
}

export function claimComponentAction(interaction) {
    const messageId = interaction?.message?.id || interaction?.messageId || interaction?.id;
    const userId = interaction?.user?.id || interaction?.userId || "unknown";
    const key = `${messageId}:${userId}`;
    if (activeComponentActions.has(key)) return null;
    activeComponentActions.add(key);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        activeComponentActions.delete(key);
    };
}

export function hasActiveComponentSession(ownerId, kinds = null) {
    const ownerKey = String(ownerId || "");
    if (!ownerKey) return false;
    const sessions = activeCollectorOwners.get(ownerKey);
    const reservations = reservedComponentOwners.get(ownerKey);
    if (!sessions?.size && !reservations?.size) return false;
    if (!kinds) return true;

    const allowedKinds = new Set(Array.isArray(kinds) ? kinds : [kinds]);
    return [...(sessions || new Map()), ...(reservations || new Map())]
        .some(([kind, count]) => count > 0 && allowedKinds.has(kind));
}

export function reserveActiveComponentSession(ownerId, kind = "components") {
    const ownerKey = String(ownerId || "");
    const collectorKind = String(kind || "components");
    if (!ownerKey) return () => undefined;

    const reservations = reservedComponentOwners.get(ownerKey) || new Map();
    reservations.set(collectorKind, (reservations.get(collectorKind) || 0) + 1);
    reservedComponentOwners.set(ownerKey, reservations);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        const current = reservedComponentOwners.get(ownerKey);
        if (!current) return;
        const remaining = (current.get(collectorKind) || 1) - 1;
        if (remaining > 0) current.set(collectorKind, remaining);
        else current.delete(collectorKind);
        if (!current.size) reservedComponentOwners.delete(ownerKey);
    };
}

export function trackComponentCollector(message, collector, options = {}) {
    const sessionId = options.sessionId || sessionIdFor(message, options.kind || "components");
    if (!collector || !sessionId) return collector;

    const messageId = message?.id ? String(message.id) : null;
    if (messageId) activeCollectorMessages.set(messageId, (activeCollectorMessages.get(messageId) || 0) + 1);

    const ownerKey = options.ownerId ? String(options.ownerId) : null;
    const collectorKind = String(options.kind || "components");
    if (ownerKey) {
        const ownerSessions = activeCollectorOwners.get(ownerKey) || new Map();
        ownerSessions.set(collectorKind, (ownerSessions.get(collectorKind) || 0) + 1);
        activeCollectorOwners.set(ownerKey, ownerSessions);

        const messageOwners = activeCollectorMessageOwners.get(messageId) || new Set();
        messageOwners.add(ownerKey);
        activeCollectorMessageOwners.set(messageId, messageOwners);
    }

    const ttlMs = Math.max(1, Number(options.ttlMs) || 60_000);
    const idleMs = Math.max(1, Number(options.idleMs) || ttlMs);
    const registration = trackComponentMessage(message, {
        ...options,
        expiresAt: options.expiresAt || Date.now() + ttlMs,
        sessionId
    });
    const successfulReasons = new Set([
        "accepted", "selected", "confirmed", "declined", "cancelled", "finished", "win", "defeated", "forfeit",
        ...(Array.isArray(options.successfulReasons) ? options.successfulReasons : [])
    ]);
    const disableOnEnd = options.disableOnEnd !== false;
    let finalized = false;
    let expiryTimer;

    const disableMessage = () => {
        if (!message?.edit || (messageId && (activeCollectorMessages.get(messageId) || 0) > 1)) return;
        void message.edit({ components: [] }).catch(error => {
            if (![10008, "10008", "ChannelNotCached"].includes(error?.code)) {
                logError("interaction-sessions.disable-on-end", error, { sessionId, messageId });
            }
        });
    };

    const finalize = (reason, forced = false) => {
        if (finalized) return;
        finalized = true;
        if (expiryTimer) clearTimeout(expiryTimer);

        const hasOtherCollector = messageId && (activeCollectorMessages.get(messageId) || 1) > 1;
        if (messageId) {
            const remaining = (activeCollectorMessages.get(messageId) || 1) - 1;
            if (remaining > 0) activeCollectorMessages.set(messageId, remaining);
            else activeCollectorMessages.delete(messageId);
        }
        if (ownerKey) {
            const ownerSessions = activeCollectorOwners.get(ownerKey);
            if (ownerSessions) {
                const remaining = (ownerSessions.get(collectorKind) || 1) - 1;
                if (remaining > 0) ownerSessions.set(collectorKind, remaining);
                else ownerSessions.delete(collectorKind);
                if (!ownerSessions.size) activeCollectorOwners.delete(ownerKey);
            }

            if (messageId) {
                const messageOwners = activeCollectorMessageOwners.get(messageId);
                messageOwners?.delete(ownerKey);
                if (!messageOwners?.size) activeCollectorMessageOwners.delete(messageId);
            }
        }

        void registration
            .catch(() => undefined)
            .then(() => closeComponentMessage(sessionId, reason || "collector-ended"));
        if (!hasOtherCollector && (reason === "time" || forced || (disableOnEnd && !successfulReasons.has(reason)))) {
            disableMessage();
        }
    };

    const scheduleExpiry = () => {
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => {
            if (finalized) return;
            try {
                collector.stop?.("time");
            } catch (error) {
                logError("interaction-sessions.collector-expiry", error, { sessionId, messageId });
            }
            finalize("time", true);
        }, idleMs + 250);
        expiryTimer.unref?.();
    };

    collector.once("end", (_collected, reason) => finalize(reason));
    if (idleMs < ttlMs) collector.on("collect", scheduleExpiry);
    scheduleExpiry();

    return collector;
}

async function fetchMessage(client, session) {
    if (!client || !session?.channelId || !session?.messageId) return { message: null, transient: true };
    try {
        const channel = await client.channels.fetch(session.channelId);
        if (!channel?.messages?.fetch) return { message: null, transient: true };
        return { message: await channel.messages.fetch(session.messageId), transient: false };
    } catch (error) {
        const missing = [10003, 10008, "10003", "10008"].includes(error?.code);
        if (!missing) logError("interaction-sessions.fetch-message", error, { sessionId: session.id });
        return { message: null, transient: !missing };
    }
}

export async function cleanupComponentMessages(client, { closeAll = false, now = Date.now() } = {}) {
    if (Date.now() < persistenceDisabledUntil) return { closed: 0, removed: 0 };

    let sessions;
    try {
        sessions = await getAllInteractionSessions();
    } catch (error) {
        markPersistenceUnavailable(error);
        if (Date.now() >= persistenceDisabledUntil) logError("interaction-sessions.list", error);
        return { closed: 0, removed: 0 };
    }

    const entries = Object.entries(sessions || {}).map(([id, stored]) => [id, { ...(stored || {}), id }]);
    const activeMessageKeys = new Set(entries
        .filter(([, session]) => session.status === "active" && Number.isFinite(Number(session.expiresAt)) && Number(session.expiresAt) > now)
        .map(([, session]) => messageKey(session))
        .filter(Boolean));

    let closed = 0;
    let removed = 0;
    for (const [sessionId, session] of entries) {
        const expiresAt = Number(session.expiresAt);
        const expired = !Number.isFinite(expiresAt) || expiresAt <= now;
        const stale = closeAll || session.status !== "active" || expired;
        if (!stale || (!closeAll && activeMessageKeys.has(messageKey(session)))) continue;
        if (activeCollectorMessages.has(String(session.messageId || ''))) continue;

        const fetched = await fetchMessage(client, session);
        if (fetched.transient) continue;
        if (fetched.message) {
            if (typeof fetched.message.edit !== 'function') continue;
            try {
                await fetched.message.edit({ components: [] });
            } catch (error) {
                if (![10008, '10008'].includes(error?.code)) {
                    logError('interaction-sessions.disable-message', error, { sessionId });
                    continue;
                }
            }
        }

        try {
            await removeInteractionSession(sessionId);
            removed += 1;
            closed += 1;
        } catch (error) {
            logError("interaction-sessions.remove", error, { sessionId });
        }
    }

    return { closed, removed };
}

export default {
    trackComponentMessage,
    trackComponentCollector,
    hasActiveComponentCollector,
    getComponentCollectorOwner,
    hasActiveComponentSession,
    reserveActiveComponentSession,
    closeComponentMessage,
    acknowledgeComponent,
    claimComponentAction,
    updateComponent,
    replyComponent,
    cleanupComponentMessages
};
