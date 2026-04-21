import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/leaderboard.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top users in the guild by cash.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
