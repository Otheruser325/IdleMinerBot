import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/settings.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View or update your settings.')
        .addSubcommand(sub => sub.setName('overview').setDescription('View your settings.'))
        .addSubcommand(sub => sub.setName('reset').setDescription('Reset your settings.'))
        .addSubcommand(sub => sub.setName('set').setDescription('Set a preference.')
            .addStringOption(o => o.setName('setting').setDescription('Setting key').setRequired(true)
                .addChoices(
                    { name: 'number_format', value: 'number_format' },
                    { name: 'idle_cash_alerts', value: 'idle_cash_alerts' },
                    { name: 'daily_monthly_sc_alerts', value: 'daily_monthly_sc_alerts' },
                    { name: 'barrier_alerts', value: 'barrier_alerts' },
                    { name: 'bottleneck_alerts', value: 'bottleneck_alerts' },
                    { name: 'idle_time', value: 'idle_time' }
                ))
            .addStringOption(o => o.setName('value').setDescription('New value').setRequired(true))
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const args = [sub];
        if (sub === 'set') {
            args.push(interaction.options.getString('setting'));
            args.push(interaction.options.getString('value'));
        }
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
