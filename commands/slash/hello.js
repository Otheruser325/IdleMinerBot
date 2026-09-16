'use strict';

import { SlashCommandBuilder } from 'discord.js';
import hello from '../shared/hello.js';

export default {
    data: new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Say hello.'),
    async execute(interaction) {
        return hello.handleHelloCommand(interaction);
    }
};
