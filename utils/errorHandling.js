/**
 * Discord error handling utilities
 * Centralizes error classification, safe replies, and structured logging
 */

/**
 * Classify Discord API errors by their error codes or status
 * @param {Error} error - The error object from Discord API
 * @returns {string} - Human-readable error category
 */
function classifyDiscordError(error) {
    const code = error?.code;
    const status = error?.status;
    const message = error?.message;

    if (code === 50013 || code === '50013') return 'Missing Permissions';
    if (code === 50001 || code === '50001') return 'Missing Access';
    if (code === 10008 || code === '10008') return 'Unknown Message';
    if (code === 10003 || code === '10003') return 'Unknown Channel';
    if (code === 10062 || code === '10062') return 'Unknown Interaction';
    if (code === 40060 || code === '40060') return 'Interaction Expired';
    if (code === 'ChannelNotCached') return 'Channel Not Cached';
    if (code === 50007 || code === '50007') return 'Cannot Message User';
    if (status === 429) return 'Rate Limited';
    if (typeof message === 'string' && message.toLowerCase().includes('missing permissions')) return 'Missing Permissions';
    if (typeof message === 'string' && message.toLowerCase().includes('unknown interaction')) return 'Unknown Interaction';
    if (typeof message === 'string' && message.toLowerCase().includes('interaction has already been acknowledged')) return 'Already Replied';
    if (typeof message === 'string' && message.toLowerCase().includes('could not find the channel where this message came from in the cache')) return 'Channel Not Cached';
    if (typeof message === 'string' && message.toLowerCase().includes('cannot send messages to this user')) return 'Cannot Message User';

    return 'Unhandled Error';
}

function shouldIgnoreDiscordError(error) {
    const category = classifyDiscordError(error);

    return category === 'Unknown Message'
        || category === 'Unknown Channel'
        || category === 'Unknown Interaction'
        || category === 'Interaction Expired'
        || category === 'Already Replied'
        || category === 'Channel Not Cached';
}

function shouldWarnDiscordError(error) {
    const category = classifyDiscordError(error);

    return category === 'Missing Permissions'
        || category === 'Missing Access'
        || category === 'Cannot Message User'
        || category === 'Rate Limited';
}

/**
 * Safely send a reply or follow-up to a message/interaction
 * Handles cases where the target is invalid or Discord API fails
 * @param {Object} target - The message or interaction object
 * @param {Object|string} payload - The content to send
 */
async function safeReply(target, payload) {
    try {
        if (!target) return;
        if (typeof target.isRepliable === 'function' || typeof target.deferred === 'boolean' || typeof target.replied === 'boolean') {
            if (target.deferred && !target.replied && typeof target.editReply === 'function') {
                return await target.editReply(payload);
            }

            if (!target.deferred && !target.replied && typeof target.reply === 'function') {
                return await target.reply(payload);
            }

            if (typeof target.followUp === 'function') {
                return await target.followUp(payload);
            }

            if (typeof target.editReply === 'function') {
                return await target.editReply(payload);
            }
        }

        if (typeof target.reply === 'function') return await target.reply(payload);
        if (typeof target.followUp === 'function') return await target.followUp(payload);
    } catch (error) {
        logError('safeReply', error);
    }
}

async function safeUpdateInteraction(interaction, payload, context = 'safeUpdateInteraction', extra = {}) {
    try {
        return await interaction.update(payload);
    } catch (error) {
        logError(context, error, extra);
        return null;
    }
}

async function safeEditMessage(message, payload, context = 'safeEditMessage', extra = {}) {
    try {
        return await message.edit(payload);
    } catch (error) {
        logError(context, error, extra);
        return null;
    }
}

/**
 * Log errors with context and extra information
 * @param {string} context - Where the error occurred
 * @param {Error} error - The error object
 * @param {Object} [extra={}] - Additional context data
 */
function logError(context, error, extra = {}) {
    if (!error) {
        return;
    }

    const category = classifyDiscordError(error);
    const code = error?.code;
    const status = error?.status;
    const message = error?.message;

    if (shouldIgnoreDiscordError(error)) {
        return;
    }

    const logLine = `[${context}] ${category}${code ? ` (code ${code})` : ''}${status ? ` (status ${status})` : ''}: ${message || error}`;
    const logger = shouldWarnDiscordError(error) ? console.warn : console.error;
    logger(logLine);
    if (Object.keys(extra).length > 0) {
        logger(`[${context}] Extra:`, extra);
    }
}

export {
    classifyDiscordError,
    shouldIgnoreDiscordError,
    shouldWarnDiscordError,
    safeReply,
    safeUpdateInteraction,
    safeEditMessage,
    logError
};
