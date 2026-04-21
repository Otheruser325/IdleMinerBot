import { SlashCommandBuilder } from 'discord.js';
import prefixCommand from '../prefix/manager.js';
import { executePrefixCommandFromInteraction } from '../../utils/commandBridge.js';

export default {
    data: new SlashCommandBuilder()
        .setName('manager')
        .setDescription('Manage your managers.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('hire')
                .setDescription('Hire a manager.')
                .addStringOption(option =>
                    option.setName('area').setDescription('Area: shaft, elevator, warehouse.').setRequired(true)
                        .addChoices(
                            { name: 'Shaft', value: 'shaft' },
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('fire')
                .setDescription('Fire a manager.')
                .addStringOption(option =>
                    option.setName('managerid_or_name').setDescription('Manager ID or name.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign')
                .setDescription('Assign a manager.')
                .addStringOption(option =>
                    option.setName('area').setDescription('Area: shaft, elevator, warehouse.').setRequired(true)
                        .addChoices(
                            { name: 'Shaft', value: 'shaft' },
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' }
                        )
                )
                .addStringOption(option =>
                    option.setName('managerid_or_name').setDescription('Manager ID or name.').setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('tier').setDescription('Shaft tier if assigning to a shaft.').setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a manager from an area.')
                .addStringOption(option =>
                    option.setName('area').setDescription('Area: shaft, elevator, warehouse.').setRequired(true)
                        .addChoices(
                            { name: 'Shaft', value: 'shaft' },
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' }
                        )
                )
                .addStringOption(option =>
                    option.setName('managerid_or_name').setDescription('Manager ID or name.').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View managers in an area.')
                .addStringOption(option =>
                    option.setName('area').setDescription('Area: shaft, elevator, warehouse.').setRequired(false)
                        .addChoices(
                            { name: 'Shaft', value: 'shaft' },
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ability')
                .setDescription('Use a manager ability.')
                .addStringOption(option =>
                    option.setName('area').setDescription('Area: shaft, elevator, warehouse.').setRequired(true)
                        .addChoices(
                            { name: 'Shaft', value: 'shaft' },
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' }
                        )
                )
                .addStringOption(option =>
                    option.setName('managerid_or_name').setDescription('Manager ID or name.').setRequired(true)
                )
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const managerIdOrName = interaction.options.getString('managerid_or_name');
        const area = interaction.options.getString('area');
        const tier = interaction.options.getInteger('tier');

        let args = [subcommand];

        switch (subcommand) {
            case 'hire':
                args = [subcommand, area];
                break;
            case 'fire':
                args = [subcommand, managerIdOrName];
                break;
            case 'assign':
                args = tier !== null
                    ? [subcommand, area, String(tier), managerIdOrName]
                    : [subcommand, area, managerIdOrName];
                break;
            case 'remove':
                args = [subcommand, area, managerIdOrName];
                break;
            case 'overview':
                args = area ? [subcommand, area] : [subcommand];
                break;
            case 'ability':
                args = [subcommand, area, managerIdOrName];
                break;
            default:
                break;
        }

        return executePrefixCommandFromInteraction(interaction, prefixCommand, args);
    }
};
