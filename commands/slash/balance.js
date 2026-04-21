import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/balance.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance and cash types.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user whose balance you want to check.')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const args = targetUser ? [targetUser.id] : [];
        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
