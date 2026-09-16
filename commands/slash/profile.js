import { SlashCommandBuilder } from 'discord.js';
import sharedCommand from '../shared/profile.js';
import { executeSharedCommand } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View an Idle Miner profile.')
        .addUserOption(option => option.setName('user').setDescription('Optional player to inspect.').setRequired(false))
        .addStringOption(option => option
            .setName('section')
            .setDescription('Optional profile section.')
            .setRequired(false)
            .addChoices(
                { name: 'mines', value: 'mines' },
                { name: 'barriers', value: 'barriers' },
                { name: 'continents', value: 'continents' }
            )),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const section = interaction.options.getString('section');
        return executeSharedCommand(interaction, sharedCommand, [user?.id, section]);
    }
};
