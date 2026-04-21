import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/mine.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Manage your mines.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy a mine.')
                .addStringOption(option =>
                    option.setName('name').setDescription('Mine name.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('visit')
                .setDescription('Visit a mine you own.')
                .addStringOption(option =>
                    option.setName('name').setDescription('Mine name.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('manage')
                .setDescription('View mine details.')
                .addStringOption(option =>
                    option.setName('name').setDescription('Mine name.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('prestige')
                .setDescription('Prestige a mine.')
                .addStringOption(option =>
                    option.setName('name').setDescription('Mine name.').setRequired(true)
                )
        ),
    async execute(interaction) {
        const args = [
            interaction.options.getSubcommand(),
            interaction.options.getString('name')
        ];
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
