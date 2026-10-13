'use strict';

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import readJson from '../../utils/readJson.js';
import errorHandler from '../../utils/errorHandling.js';
import commandContext from './context.js';
import {
    acknowledgeComponent,
    replyComponent,
    trackComponentCollector,
    updateComponent
} from '../../utils/interactionSessions.js';

const { getActor, defer, reply } = commandContext;
const { wrapAsync, safelyReplyToInteraction } = errorHandler;

const CHUNK_LIMIT = 1000;
const SELECT_MENU_LIMIT = 25;
const SESSION_MS = 5 * 60 * 1000;

const data = readJson(new URL('../../config/patchnotes.json', import.meta.url));
const patchNotes = (Array.isArray(data?.patchnotes) ? data.patchnotes : [])
    .filter(note => note && typeof note.version === 'string')
    .map(note => ({
        version: note.version,
        date: note.date,
        changes: (Array.isArray(note.changes) ? note.changes : [note.changes]).filter(change => typeof change === 'string')
    }));

function formattedFeatures(note) {
    return note.changes.map(change => `- ${change}`).join('\n');
}

function chunkLines(lines, limit = CHUNK_LIMIT) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        const text = line.length > limit ? line.slice(0, limit) : line;
        if (!current) {
            current = text;
        } else if (current.length + 1 + text.length <= limit) {
            current += `\n${text}`;
        } else {
            chunks.push(current);
            current = text;
        }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [''];
}

function noteChunks(note) {
    return chunkLines(note.changes.map(change => `- ${change}`));
}

function buildEmbed(note, pageIndex) {
    const chunks = noteChunks(note);
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`Idle Miner ${note.version}`)
        .setDescription('Here is some information about the bot:')
        .addFields(
            { name: 'Version', value: note.version, inline: true },
            { name: 'Date', value: new Date(note.date).toLocaleDateString(), inline: true },
            { name: 'Developer', value: '<@822964244697710612>', inline: true }
        );
    chunks.forEach((chunk, index) => {
        const name = chunks.length > 1 ? `What's Changed (${index + 1}/${chunks.length})` : 'What\'s Changed';
        embed.addFields({ name, value: chunk });
    });
    embed.addFields({ name: 'Programming Language', value: 'Built using Discord.js v14.x with passion :))' });
    embed
        .setTimestamp()
        .setFooter({ text: `Patch ${pageIndex + 1} of ${patchNotes.length} | Thank you for using our bot!` });
    return embed;
}

function selectRow(sessionId, pageIndex) {
    const options = patchNotes.slice(0, SELECT_MENU_LIMIT).map((note, index) => ({
        label: note.version,
        description: note.date ? String(note.date).slice(0, 100) : undefined,
        value: String(index + 1),
        default: index === pageIndex
    }));
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${sessionId}:select`)
            .setPlaceholder('Jump to a patch version')
            .addOptions(options)
    );
}

function buttonRow(sessionId, pageIndex) {
    const last = patchNotes.length - 1;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${sessionId}:first`).setLabel('⏮ First').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0),
        new ButtonBuilder().setCustomId(`${sessionId}:prev`).setLabel('◀ Newer').setStyle(ButtonStyle.Primary).setDisabled(pageIndex <= 0),
        new ButtonBuilder().setCustomId(`${sessionId}:next`).setLabel('Older ▶').setStyle(ButtonStyle.Primary).setDisabled(pageIndex >= last),
        new ButtonBuilder().setCustomId(`${sessionId}:last`).setLabel('Last ⏭').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex >= last)
    );
}

function buildPayload(sessionId, pageIndex) {
    return {
        embeds: [buildEmbed(patchNotes[pageIndex], pageIndex)],
        components: [selectRow(sessionId, pageIndex), buttonRow(sessionId, pageIndex)]
    };
}

function clampPage(pageInput) {
    const page = Number.parseInt(pageInput, 10);
    if (!Number.isInteger(page) || page < 1 || page > patchNotes.length) return 0;
    return page - 1;
}

async function execute(context, pageInput = 1) {
    const actor = getActor(context);
    if (!patchNotes.length) {
        return reply(context, 'No patch notes are available.');
    }
    await defer(context);

    let currentIndex = clampPage(pageInput);
    const sessionId = `info-${actor?.id || 'anon'}-${Date.now()}`;
    const message = await reply(context, buildPayload(sessionId, currentIndex));
    if (!message?.createMessageComponentCollector) return message;

    const collector = message.createMessageComponentCollector({ filter: () => true, time: SESSION_MS });
    trackComponentCollector(message, collector, { kind: 'info', ownerId: actor?.id, ttlMs: SESSION_MS });

    let processing = false;
    collector.on('collect', wrapAsync(async interaction => {
        if (interaction.user?.id !== actor?.id) {
            return replyComponent(interaction, { content: 'This patch browser is not for you.', ephemeral: true });
        }
        if (!String(interaction.customId || '').startsWith(sessionId)) {
            return replyComponent(interaction, { content: 'That control is no longer available.', ephemeral: true });
        }
        if (processing) {
            return replyComponent(interaction, { content: 'Still updating, please wait a moment.', ephemeral: true });
        }
        processing = true;
        try {
            if (!await acknowledgeComponent(interaction, 'info')) return;
            let next = currentIndex;
            if (interaction.isStringSelectMenu?.()) {
                const chosen = Number.parseInt(interaction.values?.[0], 10);
                if (Number.isInteger(chosen) && chosen >= 1 && chosen <= patchNotes.length) next = chosen - 1;
            } else {
                const action = String(interaction.customId).slice(sessionId.length + 1);
                const last = patchNotes.length - 1;
                if (action === 'first') next = 0;
                else if (action === 'prev') next = Math.max(0, currentIndex - 1);
                else if (action === 'next') next = Math.min(last, currentIndex + 1);
                else if (action === 'last') next = last;
            }
            currentIndex = next;
            await updateComponent(interaction, buildPayload(sessionId, currentIndex));
            collector.resetTimer();
        } finally {
            processing = false;
        }
    }), 'info.collect', async (error, interaction) => {
        await safelyReplyToInteraction(interaction, 'The patch browser could not be updated.');
    });

    collector.on('end', async () => {
        try {
            await message.edit({ components: [] });
        } catch (error) {
            if (error.code !== 10008) console.warn('Could not close the patch browser:', error.message);
        }
    });

    return message;
}

export { formattedFeatures, chunkLines, buildEmbed };
export default { execute, patchNotes, formattedFeatures, chunkLines, buildEmbed };
