function normalizeReplyPayload(payload) {
    if (typeof payload === 'string') {
        return { content: payload };
    }

    return payload ? { ...payload } : {};
}

async function resolveInteractionChannel(interaction) {
    if (interaction.channel && typeof interaction.channel.send === 'function') {
        return interaction.channel;
    }

    if (!interaction.channelId || !interaction.client?.channels?.fetch) {
        return null;
    }

    try {
        return await interaction.client.channels.fetch(interaction.channelId);
    } catch {
        return null;
    }
}

async function acknowledgeInteraction(interaction) {
    if (interaction.deferred || interaction.replied) {
        return;
    }

    try {
        await interaction.deferReply();
    } catch {
        // Discord may return Unknown interaction when acknowledgements timeout.
    }
}

async function replyFromInteraction(interaction, payload, state) {
    const normalized = {
        ...normalizeReplyPayload(payload)
    };

    if (interaction.deferred && !state.initialResponseSent) {
        state.initialResponseSent = true;
        await interaction.editReply(normalized);
        return interaction.fetchReply();
    }

    if (!interaction.deferred && !interaction.replied) {
        state.initialResponseSent = true;
        await interaction.reply(normalized);
        return interaction.fetchReply();
    }

    return interaction.followUp(normalized);
}

function createInteractionChannel(interaction, state) {
    return {
        id: interaction.channelId,
        isDMBased: () => !interaction.guildId,
        send: async (payload) => {
            const channel = await resolveInteractionChannel(interaction);
            if (channel && typeof channel.send === 'function') {
                return channel.send(normalizeReplyPayload(payload));
            }

            return replyFromInteraction(interaction, payload, state);
        }
    };
}

function createMessageAdapter(interaction) {
    const state = { initialResponseSent: false };

    return {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: createInteractionChannel(interaction, state),
        client: interaction.client,
        reply: (payload) => replyFromInteraction(interaction, payload, state)
    };
}

async function executePrefixCommandFromInteraction(interaction, prefixCommand, args = []) {
    await acknowledgeInteraction(interaction);
    const message = createMessageAdapter(interaction);
    return prefixCommand.execute(message, args);
}

export {
    acknowledgeInteraction,
    createMessageAdapter,
    executePrefixCommandFromInteraction
};
