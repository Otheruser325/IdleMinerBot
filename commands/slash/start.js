import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/start.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your mining empire.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
