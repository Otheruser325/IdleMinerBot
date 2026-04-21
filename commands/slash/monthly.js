import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/monthly.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('monthly')
        .setDescription('Claim your premium monthly Super Cash bonus.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
