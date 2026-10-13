'use strict';

import { SlashCommandBuilder } from 'discord.js';
import infoCommand from '../shared/info.js';
const { execute } = infoCommand;

export default {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Displays information about the bot.')
        .addIntegerOption(option => option.setName('page').setDescription('The patch-note page to view.')),
    async execute(interaction) {
        return execute(interaction, interaction.options.getInteger('page'));
    }
};
