'use strict';

function getActor(context) {
    return context?.user || context?.author || null;
}

function getClient(context) {
    return context?.client || context?.guild?.client || context?.channel?.client || null;
}

function isInteraction(context) {
    return Boolean(context && (
        typeof context.isChatInputCommand === 'function'
        || typeof context.isCommand === 'function'
        || context.commandName
    ));
}

async function defer(context, options = {}) {
    if (!isInteraction(context) || context.replied || context.deferred) return;
    if (typeof context.deferReply === 'function') await context.deferReply(options);
}

function normalizePayload(context, payload) {
    if (!isInteraction(context) || typeof payload !== 'string') return payload;
    return { content: payload, ephemeral: true };
}

async function reply(context, payload) {
    const normalized = normalizePayload(context, payload);
    if (isInteraction(context)) {
        if (context.deferred && !context.replied && typeof context.editReply === 'function') {
            return context.editReply(normalized);
        }
        if (context.replied && typeof context.followUp === 'function') {
            return context.followUp(normalized);
        }
        if (typeof context.reply === 'function') return context.reply(normalized);
    }
    if (typeof context?.reply === 'function') return context.reply(payload);
    throw new TypeError('Command context cannot reply.');
}

function replyError(context, content) {
    return reply(context, content);
}

export default {
    getActor,
    getClient,
    isInteraction,
    defer,
    reply,
    replyError,
    normalizePayload
};
