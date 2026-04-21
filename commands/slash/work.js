import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/work.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Operate your mineshafts, elevator, or warehouse.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('shaft')
                .setDescription('Work on a specific shaft tier.')
                .addIntegerOption(option =>
                    option.setName('tier').setDescription('The shaft tier to work on.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('elevator').setDescription('Operate the elevator.')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('warehouse').setDescription('Operate the warehouse.')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tier = interaction.options.getInteger('tier');
        const args = [subcommand];
        if (tier !== null) {
            args.push(String(tier));
        }
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
