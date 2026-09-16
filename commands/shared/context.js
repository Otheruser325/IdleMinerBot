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

function getCommandPrefix(context) {
    if (isInteraction(context)) return '/';
    const prefix = context?.commandPrefix || 'im!';
    return /^<@!?\d+>$/.test(prefix) ? `${prefix} ` : prefix;
}

function commandReference(context, commandName, args = '') {
    const suffix = Array.isArray(args) ? args.filter(Boolean).join(' ') : String(args || '').trim();
    const prefix = getCommandPrefix(context);
    const command = `${prefix}${commandName}`;
    return suffix ? `${command} ${suffix}` : command;
}

function prefixReference(context, commandName, args = '') {
    const prefix = isInteraction(context) ? 'im!' : getCommandPrefix(context);
    const suffix = Array.isArray(args) ? args.filter(Boolean).join(' ') : String(args || '').trim();
    const command = `${prefix}${commandName}`;
    return suffix ? `${command} ${suffix}` : command;
}

function slashReference(commandName, args = '') {
    const suffix = Array.isArray(args) ? args.filter(Boolean).join(' ') : String(args || '').trim();
    const command = `/${commandName}`;
    return suffix ? `${command} ${suffix}` : command;
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
        if (context.deferred && !context.replied && typeof context.editReply === 'function') return context.editReply(normalized);
        if (context.replied && typeof context.followUp === 'function') return context.followUp(normalized);
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
    getCommandPrefix,
    commandReference,
    prefixReference,
    slashReference,
    defer,
    reply,
    replyError,
    normalizePayload
};
