'use strict';

import { SlashCommandBuilder } from 'discord.js';
import info from '../shared/info.js';

export default {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get information about Idle Miner Bot and its patch notes.')
        .addIntegerOption(option => option
            .setName('page')
            .setDescription('The page of the patch notes to view.')
            .setRequired(false)
        ),
    async execute(interaction) {
        return info.handleInfoCommand(interaction, {
            page: interaction.options.getInteger('page')
        });
    }
};
