import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/continent.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('continent')
        .setDescription('Manage your continents.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a continent.')
                .addStringOption(option =>
                    option.setName('name').setDescription('Continent name, cash type, or mine reference.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('manage')
                .setDescription('View your continent progress.')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const name = interaction.options.getString('name');
        const args = name ? [subcommand, name] : [subcommand];
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
