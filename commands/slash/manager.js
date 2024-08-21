const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const managerData = require('../../config/managers.json').managers;
const managerCosts = require('../../config/managerCosts.json').managerCosts;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manager')
        .setDescription('Manage your managers with various options.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('hire')
                .setDescription('Hire a new manager.')
                .addStringOption(option =>
                    option.setName('area')
                        .setDescription('The area to hire a manager for (elevator, warehouse, shaft).')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' },
                            { name: 'Shaft', value: 'shaft' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('fire')
                .setDescription('Fire a manager.')
                .addStringOption(option =>
                    option.setName('identifier')
                        .setDescription('The ID or name of the manager to fire.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign')
                .setDescription('Assign a manager to a work area.')
                .addIntegerOption(option =>
                    option.setName('managerid')
                        .setDescription('The ID of the manager to assign.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('area')
                        .setDescription('The area to assign the manager (elevator, warehouse, shaft).')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' },
                            { name: 'Shaft', value: 'shaft' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a manager from their work area.')
                .addIntegerOption(option =>
                    option.setName('managerid')
                        .setDescription('The ID of the manager to remove.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('area')
                        .setDescription('The area to remove the manager from (elevator, warehouse, shaft).')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' },
                            { name: 'Shaft', value: 'shaft' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View all managers in a specified area.')
                .addStringOption(option =>
                    option.setName('area')
                        .setDescription('The area to view managers in (elevator, warehouse, shaft).')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Elevator', value: 'elevator' },
                            { name: 'Warehouse', value: 'warehouse' },
                            { name: 'Shaft', value: 'shaft' }
                        )
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const user = await getUser(userId);

        if (!user) {
            return interaction.reply('You need to start the game first by using `/start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return interaction.reply('Current mine data not found.');
        }

        switch (subcommand) {
            case 'hire':
                await handleManagerHire(interaction, user, currentMine, userId);
                break;
            case 'fire':
                await handleManagerFire(interaction, user, currentMine, userId);
                break;
            case 'assign':
                await handleManagerAssign(interaction, user, currentMine, userId);
                break;
            case 'remove':
                await handleManagerRemove(interaction, user, currentMine, userId);
                break;
            case 'overview':
                await handleManagerOverview(interaction, user, currentMine);
                break;
            default:
                return interaction.reply('Invalid subcommand.');
        }
    }
};

// Function to handle hiring a manager
async function handleManagerHire(interaction, user, currentMine, userId) {
    const area = interaction.options.getString('area');
    const managersAvailable = managerData.filter(m => m.Area.toLowerCase() === area);

    if (managersAvailable.length === 0) {
        return interaction.reply(`No managers are currently available to hire in the ${area}.`);
    }

    const numManagersHired = user.managers.filter(m => m.area === area).length;
    const managerCost = managerCosts.find(c => c.AmountManagersBought === numManagersHired);

    if (!managerCost) {
        return interaction.reply('Cost data for hiring managers not found.');
    }

    if (user.cash < managerCost[area.charAt(0).toUpperCase() + area.slice(1)]) {
        return interaction.reply(`You need ${numberFormat(managerCost[area.charAt(0).toUpperCase() + area.slice(1)])} cash to hire a manager in the ${area}.`);
    }

    user.cash -= managerCost[area.charAt(0).toUpperCase() + area.slice(1)];

    // Determine the rarity of the manager based on odds
    const randomNum = Math.random() * 100;
    let rarityID = 1; // Default to junior

    if (randomNum <= 60) {
        rarityID = 1; // Junior
    } else if (randomNum <= 85) {
        rarityID = 2; // Senior
    } else {
        rarityID = 3; // Executive
    }

    const availableManagersByRarity = managersAvailable.filter(m => m.RarityID === rarityID);
    if (availableManagersByRarity.length === 0) {
        return interaction.reply(`No managers with rarity ${rarityID} available in the ${area}.`);
    }

    const newManager = availableManagersByRarity[Math.floor(Math.random() * availableManagersByRarity.length)];
    user.managers.push({
        id: newManager.ManagerID,
        name: newManager.Name,
        area: area
    });

    await updateUser(userId, user);
    await interaction.reply(`Successfully hired ${newManager.Name} (${newManager.ManagerID}) for the ${area}.`);
}

// Function to handle firing a manager
async function handleManagerFire(interaction, user, currentMine, userId) {
    const identifier = interaction.options.getString('identifier');
    let managerIndex;

    if (!isNaN(identifier)) {
        // Identifier is a manager ID
        managerIndex = user.managers.findIndex(m => m.id === parseInt(identifier));
    } else {
        // Identifier is a manager name
        managerIndex = user.managers.findIndex(m => m.name.toLowerCase() === identifier.toLowerCase());
    }

    if (managerIndex === -1) {
        return interaction.reply('Manager not found.');
    }

    const manager = user.managers[managerIndex];
    if (manager.area) {
        return interaction.reply('You cannot fire a manager who is currently assigned to an area. Use `/manager remove` to remove them from their area first.');
    }

    user.managers.splice(managerIndex, 1);
    await updateUser(userId, user);
    await interaction.reply('Successfully fired the manager.');
}

// Function to handle assigning a manager
async function handleManagerAssign(interaction, user, currentMine, userId) {
    const managerId = interaction.options.getInteger('managerid');
    const area = interaction.options.getString('area');
    const manager = user.managers.find(m => m.id === managerId);

    if (!manager) {
        return interaction.reply('Manager not found.');
    }

    if (manager.area) {
        return interaction.reply('Manager is already assigned to an area.');
    }

    manager.area = area;
    await updateUser(userId, user);
    await interaction.reply(`Successfully assigned ${manager.name} to the ${area}.`);
}

// Function to handle removing a manager
async function handleManagerRemove(interaction, user, currentMine, userId) {
    const managerId = interaction.options.getInteger('managerid');
    const area = interaction.options.getString('area');
    const manager = user.managers.find(m => m.id === managerId);

    if (!manager) {
        return interaction.reply('Manager not found.');
    }

    if (manager.area !== area) {
        return interaction.reply('Manager is not assigned to this area.');
    }

    manager.area = null;
    await updateUser(userId, user);
    await interaction.reply(`Successfully removed ${manager.name} from the ${area}.`);
}

// Function to handle manager overview
async function handleManagerOverview(interaction, user, currentMine) {
    const area = interaction.options.getString('area');
    const managersInArea = user.managers.filter(m => m.area === area);

    if (managersInArea.length === 0) {
        return interaction.reply(`No managers assigned to the ${area}.`);
    }

    const overviewEmbed = new EmbedBuilder()
        .setTitle(`${area.charAt(0).toUpperCase() + area.slice(1)} Managers`)
        .setDescription(managersInArea.map(m => `**${m.name}** (ID: ${m.id})`).join('\n'))
        .setColor('#0099ff');

    await interaction.reply({ embeds: [overviewEmbed] });
}
