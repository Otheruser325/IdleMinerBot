'use strict';

import { SlashCommandBuilder } from 'discord.js';
import start from '../shared/start.js';

export default {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your mining empire.'),
    async execute(interaction) {
        return start.handleStartCommand(interaction);
    }
};
