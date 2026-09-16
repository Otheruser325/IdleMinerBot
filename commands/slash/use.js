import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/use.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

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
        return executeSharedCommand(
            interaction,
            sharedCommand,
            [String(interaction.options.getInteger('itemid'))]
        );
    }
};
