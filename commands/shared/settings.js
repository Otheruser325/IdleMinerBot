import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getUser, commitUserSnapshot, withUserLock } from '../../dataManager.js';
import { DEFAULT_USER_PREFERENCES, isValidNumberFormat, normalizeUserPreferences } from '../../utils/userPreferences.js';
import { acknowledgeComponent, trackComponentCollector } from '../../utils/interactionSessions.js';
import { safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';
import commandContext from './context.js';

const SETTING_OPTIONS = [
    ['number_format', 'Number format'],
    ['idle_cash_alerts', 'Idle cash alerts'],
    ['daily_monthly_sc_alerts', 'Daily/monthly SC alerts'],
    ['barrier_alerts', 'Barrier alerts'],
    ['bottleneck_alerts', 'Bottleneck alerts'],
    ['idle_time', 'Idle time']
];

function formatPreferences(prefs, hasPremium) {
    return [
        `**Number Format:** ${prefs.number_format}`,
        `**Idle Cash Alerts:** ${prefs.idle_cash_alerts ? 'On' : 'Off'}`,
        `**Daily/Monthly SC Alerts:** ${prefs.daily_monthly_sc_alerts ? 'On' : 'Off'}`,
        `**Barrier Alerts:** ${prefs.barrier_alerts ? 'On' : 'Off'}`,
        `**Bottleneck Alerts:** ${prefs.bottleneck_alerts ? 'On' : 'Off'}`,
        `**Idle Time:** ${prefs.idle_time_minutes}m ${hasPremium ? '' : '(Premium only to customize)'}`
    ].join('\n');
}

function settingMenu(customId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Choose a setting')
            .addOptions(SETTING_OPTIONS.map(([value, label]) => ({ label, value })))
    );
}

function valueMenu(customId, field, hasPremium) {
    const options = field === 'number_format'
        ? ['illion', 'alphabetical', 'scientific', 'engineering']
        : field === 'idle_time_minutes'
            ? (hasPremium ? ['1', '5', '10', '30', '60'] : ['10'])
            : ['on', 'off'];
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Choose a value')
            .addOptions(options.map(value => ({ label: value, value })))
    );
}

async function persistSetting(userId, user, key, value) {
    const preferences = normalizeUserPreferences(user.preferences, user.has_premium);
    const map = {
        number_format: 'number_format',
        idle_cash_alerts: 'idle_cash_alerts',
        daily_monthly_sc_alerts: 'daily_monthly_sc_alerts',
        barrier_alerts: 'barrier_alerts',
        bottleneck_alerts: 'bottleneck_alerts',
        idle_time: 'idle_time_minutes'
    };
    const field = map[key];
    if (!field) return { error: 'Unknown setting key.' };

    if (field === 'number_format') {
        if (!isValidNumberFormat(value)) return { error: 'Invalid number format.' };
        preferences[field] = value;
    } else if (field === 'idle_time_minutes') {
        const minutes = Number(value);
        if (!user.has_premium) return { error: 'Idle time customization is Premium only.' };
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return { error: 'Idle time must be between 1 and 60 minutes.' };
        preferences[field] = Math.floor(minutes);
    } else {
        if (!['on', 'off', 'true', 'false'].includes(String(value).toLowerCase())) return { error: 'Value must be on/off.' };
        preferences[field] = ['on', 'true'].includes(String(value).toLowerCase());
    }

    user.preferences = normalizeUserPreferences(preferences, user.has_premium);
    await commitUserSnapshot(userId, { preferences: user.preferences });
    return { field, value: user.preferences[field] };
}

async function showSettingSelector(message, userId, user, initialKey = null) {
    const token = `${userId}:${Date.now()}`;
    const settingId = initialKey ? null : `settings:key:${token}`;
    const valuePrefix = `settings:value:${token}:`;
    const initialValueId = `${valuePrefix}${initialKey || ''}`;
    const initialField = initialKey === 'idle_time' ? 'idle_time_minutes' : initialKey;
    const reply = await message.reply({
        embeds: [new EmbedBuilder().setColor('#3498db').setTitle('⚙️ Configure a setting').setDescription(initialKey ? 'Choose the new value.' : 'Choose the setting you want to change.')],
        components: [initialKey ? valueMenu(initialValueId, initialField, user.has_premium) : settingMenu(settingId)],
        fetchReply: true
    });
    if (!reply?.createMessageComponentCollector) return reply;

    const collector = trackComponentCollector(
        reply,
        reply.createMessageComponentCollector({
            filter: interaction => interaction.user?.id === userId && (interaction.customId === settingId || interaction.customId.startsWith(valuePrefix)),
            idle: 60_000,
            time: 15 * 60_000
        }),
        { ownerId: userId, kind: 'settings', ttlMs: 15 * 60_000, idleMs: 60_000 }
    );

    collector.on('collect', async interaction => {
        if (!await acknowledgeComponent(interaction, 'settings.collector')) return;
        if (settingId && interaction.customId === settingId) {
            const key = interaction.values?.[0];
            const field = key === 'idle_time' ? 'idle_time_minutes' : key;
            await safeUpdateInteraction(interaction, {
                embeds: [new EmbedBuilder().setColor('#3498db').setTitle(`⚙️ Configure ${key}`).setDescription('Choose the new value.')],
                components: [valueMenu(`${valuePrefix}${key}`, field, user.has_premium)]
            }, 'settings.valueMenu');
            return;
        }

        const key = initialKey || interaction.customId.slice(valuePrefix.length);
        const result = await persistSetting(userId, user, key, interaction.values?.[0]);
        const content = result.error ? `❌ ${result.error}` : `✅ Updated **${result.field}** to **${result.value}**.`;
        await safeUpdateInteraction(interaction, { content, embeds: [], components: [] }, 'settings.persist');
        collector.stop('completed');
    });

    collector.on('end', async () => {
        await safeEditMessage(reply, { components: [] }, 'settings.collector:end');
    });
    return reply;
}

export default {
    name: 'settings',
    description: 'View or update your Idle Miner preferences.',
    usage: 'overview | set [setting] [value] | reset',
    async execute(message, args = []) {
        const userId = message.user?.id || message.author?.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);
            if (!user) return message.reply(`You need to start the game first by using \`${commandContext.commandReference(message, 'start')}\`.`);

            const sub = (args[0] || 'overview').toLowerCase();
            const preferences = normalizeUserPreferences(user.preferences, user.has_premium);
            if (sub === 'overview') {
                return message.reply({ embeds: [new EmbedBuilder().setColor('#3498db').setTitle('⚙️ Your Settings').setDescription(formatPreferences(preferences, user.has_premium))] });
            }
            if (sub === 'reset') {
                user.preferences = normalizeUserPreferences(DEFAULT_USER_PREFERENCES, user.has_premium);
                await commitUserSnapshot(userId, { preferences: user.preferences });
                return message.reply('✅ Your settings were reset to defaults.');
            }
            if (sub !== 'set') return message.reply(`Usage: \`${commandContext.commandReference(message, 'settings', 'overview')}\`, \`${commandContext.commandReference(message, 'settings', 'set')}\`, or \`${commandContext.commandReference(message, 'settings', 'reset')}\`.`);
            if (!args[1]) return showSettingSelector(message, userId, user);
            if (!args[2]) return showSettingSelector(message, userId, user, args[1].toLowerCase());

            const result = await persistSetting(userId, user, args[1].toLowerCase(), args[2]);
            if (result.error) return message.reply(`❌ ${result.error}`);
            return message.reply(`✅ Updated **${result.field}** to **${result.value}**.`);
        });
    }
};
