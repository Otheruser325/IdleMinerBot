import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/shaft.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shaft')
        .setDescription('Manage your mineshafts.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View one shaft or all owned shafts.')
                .addIntegerOption(option =>
                    option.setName('tier').setDescription('Shaft tier (optional, 1-30).').setRequired(false).setMinValue(1).setMaxValue(30)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a shaft.')
                .addIntegerOption(option =>
                    option.setName('tier').setDescription('Shaft tier.').setRequired(true).setMinValue(1).setMaxValue(40)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upgrade')
                .setDescription('Upgrade a shaft.')
                .addIntegerOption(option =>
                    option.setName('tier').setDescription('Shaft tier.').setRequired(true).setMinValue(1).setMaxValue(40)
                )
                .addIntegerOption(option =>
                    option.setName('upgrade_count').setDescription('Number of upgrades to buy.').setRequired(false)
                )
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tier = interaction.options.getInteger('tier');
        const upgradeCount = interaction.options.getInteger('upgrade_count');
        const args = [subcommand];
        if (tier !== null) {
            args.push(String(tier));
        }
        if (upgradeCount !== null) {
            args.push(String(upgradeCount));
        }
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
