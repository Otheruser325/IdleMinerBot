'use strict';

const GLOBAL_HANDLERS_INSTALLED = Symbol.for('idleminerbot.globalErrorHandlersInstalled');

function normalizeError(error) {
    if (error instanceof Error) return error;
    if (typeof error === 'string') return new Error(error);

    try {
        const normalized = new Error(JSON.stringify(error));
        if (error && typeof error === 'object') {
            if (error.code !== undefined) normalized.code = error.code;
            if (error.status !== undefined) normalized.status = error.status;
            if (error.name) normalized.name = error.name;
        }
        return normalized;
    } catch {
        return new Error(String(error));
    }
}

function classifyDiscordError(error) {
    const code = error?.code;
    const status = error?.status;
    const message = String(error?.message || '').toLowerCase();

    if (code === 50013 || code === '50013' || message.includes('missing permissions')) return 'Missing Permissions';
    if (code === 50001 || code === '50001') return 'Missing Access';
    if (code === 10008 || code === '10008') return 'Unknown Message';
    if (code === 10003 || code === '10003') return 'Unknown Channel';
    if (code === 10062 || code === '10062' || message.includes('unknown interaction')) return 'Unknown Interaction';
    if (code === 40060 || code === '40060') return 'Interaction Expired';
    if (code === 'ChannelNotCached' || message.includes('could not find the channel where this message came from in the cache')) return 'Channel Not Cached';
    if (code === 50007 || code === '50007' || message.includes('cannot send messages to this user')) return 'Cannot Message User';
    if (status === 429) return 'Rate Limited';
    if (message.includes('interaction has already been acknowledged')) return 'Already Replied';
    return 'Unhandled Error';
}

function shouldIgnoreDiscordError(error) {
    return [
        'Unknown Message',
        'Unknown Channel',
        'Unknown Interaction',
        'Interaction Expired',
        'Already Replied',
        'Channel Not Cached'
    ].includes(classifyDiscordError(error));
}

function shouldWarnDiscordError(error) {
    return [
        'Missing Permissions',
        'Missing Access',
        'Cannot Message User',
        'Rate Limited'
    ].includes(classifyDiscordError(error));
}

function isRepliableInteraction(value) {
    try {
        return Boolean(value && typeof value.isRepliable === 'function' && value.isRepliable());
    } catch {
        return false;
    }
}

function getInteractionContext(interaction) {
    if (!interaction) return {};
    return {
        interactionId: interaction.id,
        interactionType: interaction.type,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        commandName: interaction.commandName,
        customId: interaction.customId
    };
}

function sanitizeMetadata(metadata = {}) {
    const sensitiveKey = /(token|secret|password|authorization|cookie|api[-_]?key|rawbody|signature)/i;
    return Object.fromEntries(
        Object.entries(metadata || {})
            .filter(([key, value]) => value !== undefined && !sensitiveKey.test(key))
            .map(([key, value]) => [
                key,
                value && typeof value === 'object'
                    ? (typeof value.then === 'function' ? '[Promise]' : '[Object]')
                    : value
            ])
    );
}

function logError(context, error, metadata = {}) {
    if (!error) return;
    const normalizedError = normalizeError(error);
    if (shouldIgnoreDiscordError(normalizedError)) return;

    const details = sanitizeMetadata(metadata);
    const category = classifyDiscordError(normalizedError);
    const logger = shouldWarnDiscordError(normalizedError) ? console.warn : console.error;
    logger(`[${context}] ${category}${normalizedError.code ? ` (code ${normalizedError.code})` : ''}: ${normalizedError.message}`, {
        name: normalizedError.name,
        status: normalizedError.status,
        stack: normalizedError.stack,
        ...details
    });
}

function normalizePayload(payload) {
    return typeof payload === 'string' ? { content: payload } : { ...(payload || {}) };
}

async function safelyReplyToInteraction(interaction, content) {
    try {
        if (!isRepliableInteraction(interaction)) return false;
        const payload = normalizePayload(content);
        if (payload.ephemeral === undefined) payload.ephemeral = true;

        if (interaction.replied || interaction.deferred) {
            if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (typeof interaction.followUp === 'function') {
                await interaction.followUp(payload);
            } else {
                return false;
            }
        } else {
            await interaction.reply(payload);
        }
        return true;
    } catch (error) {
        logError('error-handler.reply-interaction', error, getInteractionContext(interaction));
        return false;
    }
}

async function safelyReplyToMessage(message, content) {
    try {
        if (!message || typeof message.reply !== 'function') return false;
        await message.reply(content);
        return true;
    } catch (error) {
        logError('error-handler.reply-message', error, {
            messageId: message?.id,
            userId: message?.author?.id,
            guildId: message?.guildId || message?.guild?.id,
            channelId: message?.channelId || message?.channel?.id
        });
        return false;
    }
}

async function safeReply(target, payload) {
    if (isRepliableInteraction(target)) return safelyReplyToInteraction(target, payload);
    return safelyReplyToMessage(target, payload);
}

async function safeUpdateInteraction(interaction, payload, context = 'safeUpdateInteraction', extra = {}) {
    try {
        if (!interaction) return null;
        if (interaction.deferred || interaction.replied) {
            if (typeof interaction.editReply === 'function') return await interaction.editReply(payload);
            if (typeof interaction.followUp === 'function') return await interaction.followUp(payload);
            return null;
        }
        if (typeof interaction.update === 'function') return await interaction.update(payload);
        if (typeof interaction.reply === 'function') return await interaction.reply(payload);
        return null;
    } catch (error) {
        logError(context, error, { ...getInteractionContext(interaction), ...extra });
        return null;
    }
}

async function safeEditMessage(message, payload, context = 'safeEditMessage', extra = {}) {
    let timer;
    try {
        if (!message || typeof message.edit !== 'function') return null;
        const editPromise = Promise.resolve().then(() => message.edit(payload));
        const timeoutPromise = new Promise(resolve => {
            timer = setTimeout(() => resolve(null), 5_000);
            timer.unref?.();
        });
        return await Promise.race([editPromise, timeoutPromise]);
    } catch (error) {
        logError(context, error, {
            messageId: message?.id,
            channelId: message?.channelId || message?.channel?.id,
            ...extra
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function wrapAsync(handler, context, onError) {
    return (...args) => {
        let result;
        try {
            result = handler(...args);
        } catch (error) {
            return handleWrappedError(error, context, args, onError);
        }
        return Promise.resolve(result).catch(error => handleWrappedError(error, context, args, onError));
    };
}

function handleWrappedError(error, context, args, onError) {
    const source = args[0];
    const metadata = isRepliableInteraction(source)
        ? getInteractionContext(source)
        : {
            messageId: source?.id,
            userId: source?.author?.id,
            guildId: source?.guildId || source?.guild?.id,
            channelId: source?.channelId || source?.channel?.id
        };
    logError(context, error, metadata);

    if (typeof onError !== 'function') return undefined;
    try {
        return Promise.resolve(onError(error, ...args)).catch(replyError => {
            logError(`${context}.error-handler`, replyError);
        });
    } catch (replyError) {
        logError(`${context}.error-handler`, replyError);
        return undefined;
    }
}

function wrapCommand(command, commandType) {
    if (!command || typeof command.execute !== 'function') return command;
    const commandName = command.data?.name || command.name || 'unknown';
    const wrappedCommand = Object.assign({}, command);
    const originalExecute = command.execute;
    wrappedCommand.execute = wrapAsync(
        (...args) => originalExecute.apply(command, args),
        `command.${commandType}.${commandName}`,
        async (_error, source) => {
            if (isRepliableInteraction(source)) {
                await safelyReplyToInteraction(source, 'There was an error executing this command. Please try again.');
            } else {
                await safelyReplyToMessage(source, 'There was an error trying to execute that command!');
            }
        }
    );
    return wrappedCommand;
}

function installGlobalErrorHandlers(client, options = {}) {
    const existingHandlers = global[GLOBAL_HANDLERS_INSTALLED];
    if (existingHandlers) {
        existingHandlers.setClient?.(client);
        return existingHandlers;
    }

    let activeClient = client;
    let shuttingDown = false;
    const shutdownOnUncaughtException = options.shutdownOnUncaughtException !== false;
    const reportProcessError = (context, error, metadata) => logError(context, error, metadata);
    const shutdownAfterFatalError = () => {
        if (shuttingDown || !shutdownOnUncaughtException) return;
        shuttingDown = true;
        process.exitCode = 1;
        try {
            activeClient?.destroy();
        } catch (error) {
            reportProcessError('global-error-handler.destroy', error);
        }
        const timer = setTimeout(() => process.exit(1), 10_000);
        timer.unref?.();
    };

    const handlers = {
        onUncaughtException: error => {
            reportProcessError('process.uncaughtException', error);
            shutdownAfterFatalError();
        },
        onUnhandledRejection: (reason, promise) => reportProcessError('process.unhandledRejection', reason, { promise }),
        onRejectionHandled: promise => reportProcessError(
            'process.rejectionHandled',
            'A previously unhandled rejection was later handled.',
            { promise }
        ),
        onClientError: error => reportProcessError('discord.client.error', error),
        onShardError: error => reportProcessError('discord.client.shardError', error),
        onClientWarn: warning => console.warn('[discord.client.warn]', warning)
    };

    process.on('uncaughtException', handlers.onUncaughtException);
    process.on('unhandledRejection', handlers.onUnhandledRejection);
    process.on('rejectionHandled', handlers.onRejectionHandled);

    handlers.setClient = nextClient => {
        if (!nextClient || nextClient[GLOBAL_HANDLERS_INSTALLED]) return;
        activeClient = nextClient;
        nextClient.on('error', handlers.onClientError);
        nextClient.on('shardError', handlers.onShardError);
        nextClient.on('warn', handlers.onClientWarn);
        nextClient[GLOBAL_HANDLERS_INSTALLED] = true;
    };

    handlers.setClient(client);
    global[GLOBAL_HANDLERS_INSTALLED] = handlers;
    return handlers;
}

export {
    classifyDiscordError,
    shouldIgnoreDiscordError,
    shouldWarnDiscordError,
    getInteractionContext,
    sanitizeMetadata,
    installGlobalErrorHandlers,
    logError,
    safeReply,
    safeUpdateInteraction,
    safeEditMessage,
    safelyReplyToInteraction,
    safelyReplyToMessage,
    wrapAsync,
    wrapCommand
};

export default {
    classifyDiscordError,
    shouldIgnoreDiscordError,
    shouldWarnDiscordError,
    getInteractionContext,
    sanitizeMetadata,
    installGlobalErrorHandlers,
    logError,
    safeReply,
    safeUpdateInteraction,
    safeEditMessage,
    safelyReplyToInteraction,
    safelyReplyToMessage,
    wrapAsync,
    wrapCommand
};
