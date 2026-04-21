import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/help.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help for the bot commands.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
