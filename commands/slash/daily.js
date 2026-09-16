'use strict';

import { SlashCommandBuilder } from 'discord.js';
import daily from '../shared/daily.js';

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily Super Cash.'),
    async execute(interaction) {
        return daily.handleDailyCommand(interaction);
    }
};
