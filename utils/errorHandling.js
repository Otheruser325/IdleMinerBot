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
    if (status === 429) return 'Rate Limited';
    if (typeof message === 'string' && message.toLowerCase().includes('missing permissions')) return 'Missing Permissions';
    if (typeof message === 'string' && message.toLowerCase().includes('unknown interaction')) return 'Unknown Interaction';
    if (typeof message === 'string' && message.toLowerCase().includes('interaction has already been acknowledged')) return 'Already Replied';

    return 'Unhandled Error';
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
        console.warn(`[safeReply] ${classifyDiscordError(error)}: ${error?.message || error}`);
    }
}

/**
 * Log errors with context and extra information
 * @param {string} context - Where the error occurred
 * @param {Error} error - The error object
 * @param {Object} [extra={}] - Additional context data
 */
function logError(context, error, extra = {}) {
    const category = classifyDiscordError(error);
    const code = error?.code;
    const status = error?.status;
    const message = error?.message;
    console.error(`[${context}] ${category}${code ? ` (code ${code})` : ''}${status ? ` (status ${status})` : ''}: ${message || error}`);
    if (Object.keys(extra).length > 0) {
        console.error(`[${context}] Extra:`, extra);
    }
}

export {
    classifyDiscordError,
    safeReply,
    logError
};
