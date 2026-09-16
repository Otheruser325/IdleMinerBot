'use strict';

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import commandContext from './context.js';
import { acknowledgeComponent, trackComponentCollector } from '../../utils/interactionSessions.js';
import { logError, safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';

const COMMANDS_PER_PAGE = 10;
const PAGINATION_IDLE_MS = 60_000;
const PAGINATION_MAX_MS = 15 * 60_000;

const COMMAND_GUIDANCE = Object.freeze({
    balance: 'Check your cash wallets. Use `im!balance` or `/balance`, and optionally provide a player to inspect their balance.',
    barrier: 'Check or unlock mine barriers. Use it before buying a shaft tier that is blocked by a timed or paid barrier.',
    buy: 'Purchase a shop item by ID or name after unlocking the shop. Use `im!shop` first to compare boosts and instant-cash items.',
    continent: 'Use `im!continent manage` or `/continent manage` to inspect progress, then buy the next continent only after completing its mine requirements.',
    daily: 'Claim Super Cash once per day. Use it regularly, but remember new accounts may need to progress before the command unlocks.',
    elevator: 'Use `im!elevator overview` to inspect capacity and loading, then upgrade it after improving shaft production.',
    hello: 'A quick connection check for the bot.',
    help: 'Browse this list or request one command directly, such as `im!help work` or `/help command:work`.',
    leaderboard: 'View server rankings. Build cash across the relevant continent wallets and use the buttons to switch ranking types.',
    manager: 'Hire, assign, remove, and activate managers. Assign shaft managers to specific tiers and use abilities before long work cycles.',
    mine: 'View or switch mines. Use mine overviews to choose the most productive mine before upgrading its shafts and logistics.',
    monthly: 'Premium players can claim the monthly Super Cash reward after meeting the progression requirements.',
    settings: 'Use `overview`, `set`, or `reset` to manage alerts, number formatting, and premium idle-time settings.',
    shaft: 'Use `overview` to inspect production, `buy` to unlock the next tier, and `upgrade` to improve output. Upgrade Tier 1 before buying later tiers.',
    shop: 'Browse available boosters and premium items. Compare active duration, income factors, and instant-cash rewards before buying.',
    start: 'Create your Idle Miner account. Run this once before using gameplay commands.',
    use: 'Activate an inventory item by ID. Use boosts before a long manual operation or while manager automation is active.',
    warehouse: 'Move minerals from the elevator into cash. Upgrade warehouse capacity and loading speed after improving the elevator.',
    work: 'Run `im!work shaft <tier>`, `im!work elevator`, or `im!work warehouse`. Work in order: shaft → elevator → warehouse. Do not close the channel while the progress message is active; the operation still commits if Discord progress updates fail.',
    monthly: 'Claim the premium monthly reward after unlocking the required progression milestone.'
});

function getCommandCollection(context) {
    return commandContext.isInteraction(context)
        ? context.client?.slashCommands
        : context.client?.commands;
}

function collectCommands(context) {
    const collection = getCommandCollection(context);
    const commands = [];
    const seen = new Set();
    for (const command of collection?.values?.() || []) {
        const name = String(command?.data?.name || command?.name || '').toLowerCase();
        if (!name || name === 'help' || seen.has(name)) continue;
        seen.add(name);
        const aliases = Array.isArray(command.aliases) ? command.aliases.map(String) : [];
        const usage = formatUsage(context, name, command.usage);
        commands.push({
            name,
            aliases,
            description: command.data?.description || command.description || 'No description available.',
            usage,
            guidance: formatGuidance(context, command.guidance || COMMAND_GUIDANCE[name] || 'Use the command description and usage as a starting point, then check the response for the next recommended gameplay step.')
        });
    }
    return commands.sort((left, right) => left.name.localeCompare(right.name));
}

function formatGuidance(context, guidance) {
    const activeReferencePrefix = commandContext.commandReference(context, '');
    return String(guidance || '').replaceAll('im!', activeReferencePrefix);
}

function formatUsage(context, name, usage) {
    const raw = String(usage || '').trim();
    const prefixUsage = commandContext.prefixReference(context, name, raw);
    const slashUsage = commandContext.slashReference(name, raw);
    if (!raw) return `${prefixUsage} | ${slashUsage}`;
    return `${prefixUsage} | ${slashUsage}`;
}

function commandLookup(commands, input) {
    const requested = String(input || '').trim().toLowerCase();
    return commands.find(command => command.name === requested || command.aliases.some(alias => alias.toLowerCase() === requested));
}

function commandDetail(context, command) {
    const aliases = command.aliases.length ? command.aliases.map(alias => commandContext.prefixReference(context, alias)).join(', ') : 'None';
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`Command help: ${command.name}`)
        .setDescription(command.description)
        .addFields(
            { name: 'Aliases', value: aliases },
            { name: 'Usage', value: `\`${command.usage}\`` },
            { name: 'Gameplay advice', value: command.guidance }
        )
        .setFooter({ text: `Prefix commands use ${commandContext.prefixReference(context, '')} (case-insensitive); slash commands use ${commandContext.slashReference('')}.` })
        .setTimestamp();
    return commandContext.reply(context, { embeds: [embed] });
}

function pagePayload(commands, page, totalPages, sessionId, context = null) {
    const visible = commands.slice((page - 1) * COMMANDS_PER_PAGE, page * COMMANDS_PER_PAGE);
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Idle Miner Help')
        .setDescription('Use the buttons to browse commands, or request a specific command for detailed usage.')
        .setFooter({ text: `Page ${page} of ${totalPages} • Buttons expire after 60 seconds of inactivity` })
        .setTimestamp();

    for (const command of visible) {
        const aliases = command.aliases.length ? ` | Aliases: ${command.aliases.map(alias => commandContext.prefixReference(context, alias)).join(', ')}` : '';
        embed.addFields({
            name: `${command.name}${aliases}`,
            value: `${command.description}\nUsage: \`${command.usage}\``.slice(0, 1024),
            inline: false
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${sessionId}:previous`).setLabel('◀️ Previous').setStyle(ButtonStyle.Primary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId(`${sessionId}:next`).setLabel('Next ▶️').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages)
    );
    return { embeds: [embed], components: [row] };
}

async function paginate(context, commands) {
    const ownerId = commandContext.getActor(context)?.id || 'unknown';
    const sessionId = `help:${ownerId}:${Date.now()}`;
    const totalPages = Math.max(1, Math.ceil(commands.length / COMMANDS_PER_PAGE));
    let page = 1;

    const render = () => pagePayload(commands, page, totalPages, sessionId, context);
    let message = commandContext.isInteraction(context)
        ? await commandContext.reply(context, render())
        : await context.reply({ ...render(), fetchReply: true });

    if (!message?.createMessageComponentCollector && commandContext.isInteraction(context) && typeof context.fetchReply === 'function') {
        message = await context.fetchReply();
    }
    if (!message?.createMessageComponentCollector) return message;

    const collector = message.createMessageComponentCollector({
        filter: interaction => interaction.user?.id === ownerId && interaction.customId?.startsWith(`${sessionId}:`),
        idle: PAGINATION_IDLE_MS,
        time: PAGINATION_MAX_MS
    });
    trackComponentCollector(message, collector, {
        ownerId,
        kind: 'help',
        ttlMs: PAGINATION_MAX_MS,
        idleMs: PAGINATION_IDLE_MS,
        disableOnEnd: true
    });

    collector.on('collect', async interaction => {
        try {
            if (!await acknowledgeComponent(interaction, 'help.pagination')) return;
            const action = interaction.customId.slice(`${sessionId}:`.length);
            if (action === 'previous') page = Math.max(1, page - 1);
            if (action === 'next') page = Math.min(totalPages, page + 1);
            await safeUpdateInteraction(interaction, render(), 'help:pagination:update', {
                userId: interaction.user?.id,
                page
            });
        } catch (error) {
            logError('help:pagination:collect', error, { userId: interaction?.user?.id });
        }
    });

    collector.once('end', () => {
        void safeEditMessage(message, { components: [] }, 'help:pagination:end', { messageId: message?.id });
    });
    return message;
}

export async function handleHelpCommand(context, { args = [] } = {}) {
    await commandContext.defer(context);
    const commands = collectCommands(context);
    const requested = Array.isArray(args) ? args[0] : args;
    const command = commandLookup(commands, requested);
    if (requested) return command
        ? commandDetail(context, command)
        : commandContext.reply(context, `Command \`${requested}\` was not found. Use \`im!help\` or \`/help\` to browse available commands.`);
    return paginate(context, commands);
}

export { COMMAND_GUIDANCE, collectCommands, commandDetail, pagePayload, formatGuidance, formatUsage };
export default {
    name: 'help',
    description: 'Browse Idle Miner commands and gameplay advice.',
    execute: (context, args = []) => handleHelpCommand(context, { args }),
    handleHelpCommand,
    COMMAND_GUIDANCE
};
