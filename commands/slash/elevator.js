import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/elevator.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('elevator')
        .setDescription('Manage your elevator.')
        .addSubcommand(subcommand =>
            subcommand.setName('overview').setDescription('View your elevator overview.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upgrade')
                .setDescription('Upgrade your elevator.')
                .addIntegerOption(option =>
                    option.setName('upgrade_count').setDescription('Number of upgrades to buy.').setRequired(false)
                )
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const upgradeCount = interaction.options.getInteger('upgrade_count');
        const args = [subcommand];
        if (upgradeCount !== null) {
            args.push(String(upgradeCount));
        }
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
