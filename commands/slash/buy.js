import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/buy.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop.')
        .addIntegerOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy.')
                .setRequired(true)
        ),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(
            interaction,
            prefixCommand,
            [String(interaction.options.getInteger('item_id'))]
        );
    }
};
