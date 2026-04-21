function normalizeReplyPayload(payload) {
    if (typeof payload === 'string') {
        return { content: payload };
    }

    return payload ? { ...payload } : {};
}

async function acknowledgeInteraction(interaction) {
    if (interaction.deferred || interaction.replied) {
        return;
    }

    await interaction.deferReply();
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
        send: (payload) => replyFromInteraction(interaction, payload, state)
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
