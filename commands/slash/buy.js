'use strict';

import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/buy.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop.')
        .addIntegerOption(option => option
            .setName('item_id')
            .setDescription('ID of the item to buy.')
            .setRequired(true)
        ),
    async execute(interaction) {
        return executeSharedCommand(
            interaction,
            sharedCommand,
            [String(interaction.options.getInteger('item_id'))]
        );
    }
};
