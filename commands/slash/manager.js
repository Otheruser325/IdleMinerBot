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

    // Ensure currentMine's area array is initialized
    if (!currentMine[area]) {
        currentMine[area] = [];
    }

    // Calculate the number of managers currently hired in the specified area
    const numManagersHired = currentMine[area].filter(m => m.assigned).length;

    // Determine the cost of hiring based on the number of managers
    const managerCost = managerCosts.find(c => c.AmountManagersBought === numManagersHired);
    if (!managerCost) {
        return interaction.reply('Cost data for hiring managers not found.');
    }

    const cost = managerCost[area.charAt(0).toUpperCase() + area.slice(1)];
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
    currentMine[area].push({
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
    const allManagers = [...currentMine.mineshafts, ...currentMine.elevator, ...currentMine.warehouse];
    managerIndex = allManagers.findIndex(m => m.id === parseInt(identifier) || m.name.toLowerCase() === identifier.toLowerCase());

    if (managerIndex === -1) {
        return interaction.reply('Manager not found.');
    }

    const manager = allManagers[managerIndex];
    if (manager.assigned) {
        return interaction.reply('You cannot fire a manager who is currently assigned to an area. Use `/manager remove` to remove them from their area first.');
    }

    // Remove manager from all areas
    currentMine.mineshafts = currentMine.mineshafts.filter(m => m.id !== manager.id);
    currentMine.elevator = currentMine.elevator.filter(m => m.id !== manager.id);
    currentMine.warehouse = currentMine.warehouse.filter(m => m.id !== manager.id);

    await updateUser(userId, user);
    await interaction.reply('Successfully fired the manager.');
}

// Function to handle assigning a manager
async function handleManagerAssign(interaction, user, currentMine, userId) {
    const managerId = interaction.options.getInteger('managerid');
    const area = interaction.options.getString('area').toLowerCase();

    // Check if area is valid
    if (!['mineshafts', 'elevator', 'warehouse'].includes(area)) {
        return interaction.reply('Invalid area specified.');
    }

    const manager = currentMine.mineshafts.concat(currentMine.elevator, currentMine.warehouse)
        .find(m => m.id === managerId);

    if (!manager) {
        return interaction.reply('Manager not found.');
    }

    if (manager.assigned) {
        return interaction.reply('Manager is already assigned to another area.');
    }

    // Remove manager from all other areas
    currentMine.mineshafts = currentMine.mineshafts.filter(m => m.id !== manager.id);
    currentMine.elevator = currentMine.elevator.filter(m => m.id !== manager.id);
    currentMine.warehouse = currentMine.warehouse.filter(m => m.id !== manager.id);

    // Assign manager to the new area
    currentMine[area].push({ ...manager, assigned: true });

    await updateUser(userId, user);
    await interaction.reply(`Successfully assigned manager to the ${area}.`);
}

// Function to handle removing a manager
async function handleManagerRemove(interaction, user, currentMine, userId) {
    const managerId = interaction.options.getInteger('managerid');
    const area = interaction.options.getString('area').toLowerCase();

    // Check if area is valid
    if (!['elevator', 'warehouse', 'shaft'].includes(area)) {
        return interaction.reply('Invalid area specified.');
    }

    const manager = currentMine[area].find(m => m.id === managerId);
    if (!manager) {
        return interaction.reply('Manager not found in this area.');
    }

    if (!manager.assigned) {
        return interaction.reply('Manager is not assigned to this area.');
    }

    // Remove manager from the area
    currentMine[area] = currentMine[area].filter(m => m.id !== managerId);

    // Add manager back to available managers
    currentMine.mineshafts.push({ ...manager, assigned: false });

    await updateUser(userId, user);
    await interaction.reply('Successfully removed manager from the area.');
}

// Function to handle overview of managers in an area
async function handleManagerOverview(interaction, user, currentMine) {
    const area = interaction.options.getString('area').toLowerCase();
    const areaManagers = currentMine[area] || [];

    if (areaManagers.length === 0) {
        return interaction.reply(`No managers assigned to the ${area}.`);
    }

    const managerList = areaManagers.map(m => `ID: ${m.id}, Name: ${m.name}, Assigned: ${m.assigned ? 'Yes' : 'No'}`).join('\n');
    const embed = new EmbedBuilder()
        .setTitle(`Managers in ${area.charAt(0).toUpperCase() + area.slice(1)}`)
        .setDescription(managerList)
        .setColor('#0099ff');

    await interaction.reply({ embeds: [embed] });
}
