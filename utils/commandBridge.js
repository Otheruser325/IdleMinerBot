function normalizeReplyPayload(payload) {
    if (typeof payload === 'string') return { content: payload };

    const normalized = payload ? { ...payload } : {};
    delete normalized.fetchReply;
    return normalized;
}

async function acknowledgeInteraction(interaction) {
    if (!interaction || interaction.deferred || interaction.replied) return true;
    if (typeof interaction.deferReply !== 'function') return false;

    try {
        await interaction.deferReply();
        return true;
    } catch {
        return Boolean(interaction.deferred || interaction.replied);
    }
}

async function fetchInteractionReply(interaction, fallback) {
    if (typeof interaction?.fetchReply === 'function') {
        try {
            return await interaction.fetchReply();
        } catch {
            // The interaction can still be usable even when the reply fetch
            // races Discord's acknowledgement endpoint.
        }
    }
    return fallback || interaction;
}

async function replyFromInteraction(interaction, payload, state) {
    const normalized = normalizeReplyPayload(payload);

    if (state.initialResponseSent || interaction.replied) {
        if (typeof interaction.followUp === 'function') return interaction.followUp(normalized);
        if (typeof interaction.editReply === 'function') return interaction.editReply(normalized);
        throw new TypeError('Interaction cannot send a follow-up response.');
    }

    state.initialResponseSent = true;
    if (interaction.deferred && typeof interaction.editReply === 'function') {
        return interaction.editReply(normalized);
    }
    if (typeof interaction.reply !== 'function') {
        throw new TypeError('Interaction cannot send a response.');
    }

    const response = await interaction.reply(normalized);
    return fetchInteractionReply(interaction, response);
}

function createInteractionChannel(interaction, state) {
    const channel = interaction.channel;
    return {
        ...(channel || {}),
        id: interaction.channelId || channel?.id,
        guild: interaction.guild,
        guildId: interaction.guildId,
        isDMBased: () => !interaction.guildId,
        send: payload => {
            // Prefix commands use channel.send for public follow-up messages;
            // interactions use the acknowledged response as that channel.
            return replyFromInteraction(interaction, payload, state);
        }
    };
}

function createMessageAdapter(interaction) {
    const state = { initialResponseSent: false };
    const channel = createInteractionChannel(interaction, state);

    return {
        id: interaction.id,
        __interactionAdapter: true,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        commandName: interaction.commandName,
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel,
        client: interaction.client,
        createdTimestamp: interaction.createdTimestamp,
        reply: payload => replyFromInteraction(interaction, payload, state),
        // Shared long-running commands use message.edit for progress updates.
        // Map that operation directly to the deferred interaction response when
        // Discord does not return a fetchable Message object.
        edit: payload => {
            if (typeof interaction.editReply !== 'function') {
                throw new TypeError('Interaction cannot edit its response.');
            }
            return interaction.editReply(normalizeReplyPayload(payload));
        }
    };
}

async function executeSharedCommand(interaction, command, args = []) {
    if (!interaction || !command || typeof command.execute !== 'function') {
        throw new TypeError('An interaction and executable command are required.');
    }

    // Slash commands and prefix commands now share one execution boundary. The
    // command receives the same message-shaped context in both paths, while
    // Discord's one-response acknowledgement is handled exactly once here.
    const acknowledged = await acknowledgeInteraction(interaction);
    if (!acknowledged && !interaction.deferred && !interaction.replied) {
        throw new Error('Unable to acknowledge the interaction.');
    }

    const normalizedArgs = Array.isArray(args)
        ? args.filter(value => value !== undefined && value !== null).map(String)
        : [];
    return command.execute(createMessageAdapter(interaction), normalizedArgs);
}

async function executePrefixCommandFromInteraction(interaction, prefixCommand, args = []) {
    return executeSharedCommand(interaction, prefixCommand, args);
}

export {
    acknowledgeInteraction,
    createMessageAdapter,
    executeSharedCommand,
    executePrefixCommandFromInteraction
};
