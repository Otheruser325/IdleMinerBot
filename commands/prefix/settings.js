import { EmbedBuilder } from 'discord.js';
import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { DEFAULT_USER_PREFERENCES, isValidNumberFormat, normalizeUserPreferences } from '../../utils/userPreferences.js';

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

export default {
    name: 'settings',
    description: 'View or update your Idle Miner preferences.',
    usage: 'overview | set <setting> <value> | reset',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);
            if (!user) return message.reply('You need to start the game first by using `im!start`.');

            const sub = (args[0] || 'overview').toLowerCase();
            const preferences = normalizeUserPreferences(user.preferences, user.has_premium);

            if (sub === 'overview') {
                const embed = new EmbedBuilder().setColor('#3498db').setTitle('⚙️ Your Settings')
                    .setDescription(formatPreferences(preferences, user.has_premium));
                return message.reply({ embeds: [embed] });
            }

            if (sub === 'reset') {
                const resetPrefs = normalizeUserPreferences(DEFAULT_USER_PREFERENCES, user.has_premium);
                user.preferences = resetPrefs;
                await updateUser(userId, { preferences: user.preferences });
                return message.reply('✅ Your settings were reset to defaults.');
            }

            if (sub !== 'set') {
                return message.reply('Usage: `im!settings overview`, `im!settings set <setting> <value>`, or `im!settings reset`.');
            }

            const key = String(args[1] || '').toLowerCase();
            const value = String(args[2] || '').toLowerCase();

            const map = {
                number_format: 'number_format',
                idle_cash_alerts: 'idle_cash_alerts',
                daily_monthly_sc_alerts: 'daily_monthly_sc_alerts',
                barrier_alerts: 'barrier_alerts',
                bottleneck_alerts: 'bottleneck_alerts',
                idle_time: 'idle_time_minutes'
            };
            const field = map[key];
            if (!field) return message.reply('Unknown setting key.');

            if (field === 'number_format') {
                if (!isValidNumberFormat(value)) {
                    return message.reply('Invalid number format. Use: illion, alphabetical, scientific, engineering.');
                }
                preferences.number_format = value;
            } else if (field === 'idle_time_minutes') {
                const minutes = Number(value);
                if (!user.has_premium) return message.reply('Idle time customization is Premium only.');
                if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return message.reply('Idle time must be between 1 and 60 minutes.');
                preferences.idle_time_minutes = Math.floor(minutes);
            } else {
                if (!['on', 'off', 'true', 'false'].includes(value)) return message.reply('Value must be on/off.');
                preferences[field] = value === 'on' || value === 'true';
            }

            user.preferences = normalizeUserPreferences(preferences, user.has_premium);
            await updateUser(userId, { preferences: user.preferences });
            return message.reply(`✅ Updated **${field}** to **${user.preferences[field]}**.`);
        });
    }
};
