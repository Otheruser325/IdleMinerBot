import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/leaderboard.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top users in the guild by cash.'),
    async execute(interaction) {
        return executeSharedCommand(interaction, sharedCommand);
    }
};
