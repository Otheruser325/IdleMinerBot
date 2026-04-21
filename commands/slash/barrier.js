import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/barrier.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('barrier')
        .setDescription('Manage barriers in your mine.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Unlock a barrier.')
                .addIntegerOption(option =>
                    option.setName('order').setDescription('Barrier order number.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View your current barriers.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a completed barrier.')
                .addIntegerOption(option =>
                    option.setName('order').setDescription('Barrier order number.').setRequired(true)
                )
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const order = interaction.options.getInteger('order');
        const args = [subcommand];
        if (order !== null) {
            args.push(String(order));
        }
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
