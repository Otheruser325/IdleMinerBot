import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/shop.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase special deals and boosters.'),
    async execute(interaction) {
        return executeSharedCommand(interaction, sharedCommand);
    }
};
