'use strict';

import { SlashCommandBuilder } from 'discord.js';
import balance from '../shared/balance.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance and cash types.')
        .addUserOption(option => option
            .setName('user')
            .setDescription('The user whose balance you want to check.')
            .setRequired(false)
        ),
    async execute(interaction) {
        return balance.handleBalanceCommand(interaction, {
            targetUser: interaction.options.getUser('user')
        });
    }
};
