'use strict';

import { SlashCommandBuilder } from 'discord.js';
import monthly from '../shared/monthly.js';

export default {
    data: new SlashCommandBuilder()
        .setName('monthly')
        .setDescription('Claim your premium monthly Super Cash bonus.'),
    async execute(interaction) {
        return monthly.handleMonthlyCommand(interaction);
    }
};
