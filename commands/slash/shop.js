import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/shop.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase special deals and boosters.'),
    async execute(interaction) {
        return executePrefixCommandFromInteraction(interaction, prefixCommand);
    }
};
