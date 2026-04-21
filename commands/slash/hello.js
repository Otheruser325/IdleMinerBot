import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/hello.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('hello')
        .setDescription('Say hello.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
