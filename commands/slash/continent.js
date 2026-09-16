import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/continent.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('continent')
        .setDescription('Manage your continents.')
        .addSubcommand(subcommand => subcommand
            .setName('buy')
            .setDescription('Buy a continent.')
            .addStringOption(option => option.setName('name').setDescription('Continent name, cash type, or mine reference.').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('manage')
            .setDescription('View continent progress; defaults to your current continent.')
            .addStringOption(option => option.setName('name').setDescription('Optional continent name.').setRequired(false))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const name = interaction.options.getString('name');
        return executeSharedCommand(interaction, sharedCommand, name ? [subcommand, name] : [subcommand]);
    }
};
