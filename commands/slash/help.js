'use strict';

import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/help.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse Idle Miner commands and gameplay advice.')
        .addStringOption(option => option
            .setName('command')
            .setDescription('Command or prefix alias to look up')
            .setRequired(false)),
    async execute(interaction) {
        const command = interaction.options.getString('command');
        return executeSharedCommand(interaction, sharedCommand, command ? [command] : []);
    }
};
