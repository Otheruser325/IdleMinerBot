import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/use.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use a booster from your inventory.')
        .addIntegerOption(option =>
            option
                .setName('itemid')
                .setDescription('The booster item ID to use.')
                .setRequired(true)
        ),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(
            interaction,
            prefixCommand,
            [String(interaction.options.getInteger('itemid'))]
        );
    }
};
