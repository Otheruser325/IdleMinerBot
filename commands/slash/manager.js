const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
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
                .addStringOption(option =>
                    option.setName('managerid_or_name')
                        .setDescription('The ID or name of the manager to assign.')
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

        // Initialize managers if they are not present
        currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };

        // Initialize areas if they are not present
        currentMine.mineshafts = currentMine.mineshafts || [];
        currentMine.elevator = currentMine.elevator || [];
        currentMine.warehouse = currentMine.warehouse || [];

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
    const area = interaction.options.getString('area').toLowerCase();
    const managersAvailable = managerData.filter(m => m.Area.toLowerCase() === area);

    if (managersAvailable.length === 0) {
        return interaction.reply(`No managers available for the ${area}.`);
    }

    // Ensure managers for the area are initialized
    currentMine.managers[area] = currentMine.managers[area] || [];

    // Calculate the number of managers currently hired in the specified area
    const numManagersHired = currentMine.managers[area].filter(m => m.assigned).length;

    // Determine the cost of hiring based on the number of managers
    const managerCost = managerCosts.find(c => c.AmountManagersBought === numManagersHired);
    if (!managerCost) {
        return interaction.reply('Cost data for hiring managers not found.');
    }

    // Get the cost based on the area
    const areaCostKey = area.charAt(0).toUpperCase() + area.slice(1);
    const cost = managerCost[areaCostKey];
    if (cost === undefined || isNaN(cost)) {
        return interaction.reply(`Cost data for area "${area}" not found.`);
    }

    if (user.cash < cost) {
        return interaction.reply(`You need ${numberFormat(cost)} cash to hire a manager in the ${area}.`);
    }

    // Deduct the cost from the user's cash
    user.cash -= cost;

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
    currentMine.managers[area].push({
        id: newManager.ManagerID,
        name: newManager.Name,
        assigned: false
    });

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        await interaction.reply(`Successfully hired ${newManager.Name} (${newManager.ManagerID}) for the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        await interaction.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle firing a manager
async function handleManagerFire(interaction, user, currentMine, userId) {
    const identifier = interaction.options.getString('identifier');
    let managerIndex;

    // Check in all areas
    const allManagers = [...currentMine.managers.shaft, ...currentMine.managers.elevator, ...currentMine.managers.warehouse];
    managerIndex = allManagers.findIndex(m => m.id === parseInt(identifier) || m.name.toLowerCase() === identifier.toLowerCase());

    if (managerIndex === -1) {
        return interaction.reply('Manager not found.');
    }

    const manager = allManagers[managerIndex];
    if (manager.assigned) {
        return interaction.reply('You cannot fire a manager who is currently assigned to an area. Use `/manager remove` to remove them from their area first.');
    }

    // Remove manager from all areas
    currentMine.managers.shaft = currentMine.managers.shaft.filter(m => m.id !== manager.id);
    currentMine.managers.elevator = currentMine.managers.elevator.filter(m => m.id !== manager.id);
    currentMine.managers.warehouse = currentMine.managers.warehouse.filter(m => m.id !== manager.id);

    await updateUser(userId, user);
    await interaction.reply('Successfully fired the manager.');
}

// Function to handle assigning a manager
async function handleManagerAssign(interaction, user, currentMine, userId) {
    const managerIdOrName = interaction.options.getString('managerid_or_name');
    const area = interaction.options.getString('area').toLowerCase();

    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return interaction.reply('Invalid area specified.');
    }

    // Ensure managers and area are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };
    currentMine.managers[area] = currentMine.managers[area] || [];

    // Find the manager by ID or name
    const allManagers = [
        ...currentMine.managers.shaft,
        ...currentMine.managers.elevator,
        ...currentMine.managers.warehouse
    ];

    const manager = allManagers.find(m =>
        m.id === parseInt(managerIdOrName) ||
        m.name.toLowerCase() === managerIdOrName.toLowerCase()
    );

    if (!manager) {
        return interaction.reply('Manager not found.');
    }

    // Check if the manager is already assigned
    if (manager.assigned) {
        return interaction.reply('This manager is already assigned to another area.');
    }

    // Check if the target area already has an assigned manager
    if (currentMine.managers[area].some(m => m.assigned)) {
        return interaction.reply(`The ${area} already has an assigned manager. Remove the current manager before assigning a new one.`);
    }

    // Remove the manager from all other areas
    ['shaft', 'elevator', 'warehouse'].forEach(a => {
        if (a !== area) {
            currentMine.managers[a] = currentMine.managers[a].filter(m => m.id !== manager.id);
        }
    });

    // Assign the manager to the new area
    if (!currentMine.managers[area]) {
        currentMine.managers[area] = [];
    }
    currentMine.managers[area].push({ ...manager, assigned: true });

    try {
        await updateUser(userId, user);
        return interaction.reply(`Successfully assigned manager ${manager.name} to the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return interaction.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle removing a manager
async function handleManagerRemove(interaction, user, currentMine, userId) {
    const managerId = interaction.options.getInteger('managerid');
    const area = interaction.options.getString('area').toLowerCase();

    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return interaction.reply('Invalid area.');
    }

    const managerIndex = currentMine.managers[area].findIndex(m => m.id === managerId);
    if (managerIndex === -1) {
        return interaction.reply('Manager not found.');
    }

    // Check if the manager is not assigned
    if (!currentMine.managers[area][managerIndex].assigned) {
        return interaction.reply('This manager is not currently assigned.');
    }

    // Remove the manager from the area
    currentMine.managers[area][managerIndex].assigned = false;
    await updateUser(userId, user);
    await interaction.reply(`Successfully removed the manager from the ${area}.`);
}

// Function to handle viewing all managers in an area
async function handleManagerOverview(interaction, user, currentMine) {
    const area = interaction.options.getString('area').toLowerCase();

    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return interaction.reply('Invalid area.');
    }

    const managersInArea = currentMine.managers[area];
    if (managersInArea.length === 0) {
        return interaction.reply(`There are no managers currently in the ${area}.`);
    }

    const embed = new EmbedBuilder()
        .setTitle(`Managers in the ${area.charAt(0).toUpperCase() + area.slice(1)}`)
        .setDescription(managersInArea.map(m => `ID: ${m.id}, Name: ${m.name}, Assigned: ${m.assigned ? 'Yes' : 'No'}`).join('\n'))
        .setColor('#0099ff');

    await interaction.reply({ embeds: [embed] });
}
