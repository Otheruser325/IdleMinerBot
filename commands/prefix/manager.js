const { getUser, updateUser } = require('../../dataManager');
const { EmbedBuilder } = require('discord.js');
const numberFormat = require('../../utils/numberFormat');
const managerData = require('../../config/managers.json').managers;
const managerCosts = require('../../config/managerCosts.json').managerCosts;

module.exports = {
    name: 'manager',
    description: 'Manage your managers by hiring, firing, assigning, or removing them.',
    async execute(message, args) {
        const userId = message.author.id;
        const user = await getUser(userId);

        if (!user) {
            return message.reply('You need to start the game first by using `im!start`.');
        }

        const currentMine = user.mines.find(mine => mine.MineName === user.currentMine);
        if (!currentMine) {
            return message.reply('Current mine data not found.');
        }

        // Initialize managers if they are not present
        currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };

        // Initialize areas if they are not present
        currentMine.mineshafts = currentMine.mineshafts || [];
        currentMine.elevator = currentMine.elevator || [];
        currentMine.warehouse = currentMine.warehouse || [];

        if (args.length < 1) {
            return message.reply(`Please provide a subcommand: \`hire\`, \`fire\`, \`assign\`, \`remove\`, or \`overview\`.`);
        }

        const subcommand = args[0];
        const area = args[1] ? args[1].toLowerCase() : null;
        const identifierOrId = args.slice(2).join(' '); // Manager ID or name

        switch (subcommand) {
            case 'hire':
                await handleManagerHire(message, user, currentMine, userId, area);
                break;
            case 'fire':
                await handleManagerFire(message, user, currentMine, userId, identifierOrId);
                break;
            case 'assign':
                await handleManagerAssign(message, user, currentMine, userId, parseInt(identifierOrId), area);
                break;
            case 'remove':
                await handleManagerRemove(message, user, currentMine, userId, parseInt(identifierOrId), area);
                break;
            case 'overview':
                await handleManagerOverview(message, user, currentMine, area);
                break;
            default:
                return message.reply('Invalid subcommand. Use `hire`, `fire`, `assign`, `remove`, or `overview`.');
        }
    }
};

// Function to handle hiring a manager
async function handleManagerHire(message, user, currentMine, userId, area) {
    // Check if area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }
    
    const managersAvailable = managerData.filter(m => m.Area.toLowerCase() === area);

    if (managersAvailable.length === 0) {
        return message.reply(`No managers available for the ${area}.`);
    }

    // Ensure managers for the area are initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };
    currentMine.managers[area] = currentMine.managers[area] || [];

    // Calculate the number of managers currently hired in the specified area
    const numManagersHired = (currentMine.managers[area] || []).filter(m => m.assigned).length;

    // Determine the cost of hiring based on the number of managers
    const managerCost = managerCosts.find(c => c.AmountManagersBought === numManagersHired);
    if (!managerCost) {
        return message.reply('Cost data for hiring managers not found.');
    }

    // Get the cost based on the area
    const areaCostKey = area.charAt(0).toUpperCase() + area.slice(1);
    const cost = managerCost[areaCostKey];
    if (cost === undefined) {
        return message.reply(`Cost data for area "${area}" not found.`);
    }

    if (user.cash < cost) {
        return message.reply(`You need ${numberFormat(cost)} cash to hire a manager in the ${area}.`);
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
        return message.reply(`No managers with rarity ${rarityID} available in the ${area}.`);
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
        return message.reply(`Successfully hired ${newManager.Name} (${newManager.ManagerID}) for the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle firing a manager
async function handleManagerFire(message, user, currentMine, userId, identifierOrId) {
    let managerIndex;

    // Check in all areas
    const allManagers = [...currentMine.managers.shaft, ...currentMine.managers.elevator, ...currentMine.managers.warehouse];
    managerIndex = allManagers.findIndex(m => m.id === parseInt(identifierOrId) || m.name.toLowerCase() === identifierOrId.toLowerCase());

    if (managerIndex === -1) {
        return message.reply('Manager not found.');
    }

    const manager = allManagers[managerIndex];
    if (manager.assigned) {
        return message.reply('You cannot fire a manager who is currently assigned to an area. Use `!manager remove` to remove them from their area first.');
    }

    // Remove manager from all areas
    currentMine.managers.shaft = currentMine.managers.shaft.filter(m => m.id !== manager.id);
    currentMine.managers.elevator = currentMine.managers.elevator.filter(m => m.id !== manager.id);
    currentMine.managers.warehouse = currentMine.managers.warehouse.filter(m => m.id !== manager.id);

    await updateUser(userId, user);
    return message.reply('Successfully fired the manager.');
}

// Function to handle assigning a manager
async function handleManagerAssign(message, user, currentMine, userId, managerIdOrName, area) {
    // Check if area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    // Ensure managers are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };

    // Ensure area is properly initialized
    currentMine.managers[area] = currentMine.managers[area] || [];

    // Find the manager by ID or name
    const allManagers = [
        ...currentMine.managers.shaft,
        ...currentMine.managers.elevator,
        ...currentMine.managers.warehouse
    ];

    const manager = allManagers.find(m => 
        m.id === parseInt(managerIdOrName, 10) ||
        (typeof managerIdOrName === 'string' && m.name.toLowerCase() === managerIdOrName.toLowerCase())
    );

    if (!manager) {
        return message.reply('Manager not found.');
    }

    // Check if the manager is already assigned
    if (manager.assigned) {
        return message.reply('Manager is already assigned to another area.');
    }

    // Check if the target area already has an assigned manager
    if (currentMine.managers[area].some(m => m.assigned)) {
        return message.reply(`The ${area} already has an assigned manager. Remove the current manager before assigning a new one.`);
    }

    // Remove the manager from all other areas
    ['shaft', 'elevator', 'warehouse'].forEach(a => {
        if (a !== area) {
            currentMine.managers[a] = currentMine.managers[a].filter(m => m.id !== manager.id);
        }
    });

    // Assign the manager to the new area
    currentMine.managers[area].push({ ...manager, assigned: true });

    try {
        await updateUser(userId, user);
        return message.reply(`Successfully assigned manager ${manager.name} to the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle removing a manager
async function handleManagerRemove(message, user, currentMine, userId, managerId, area) {
    // Check if area is valid
    if (!['elevator', 'warehouse', 'shaft'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    const manager = currentMine.managers[area].find(m => m.id === managerId);
    if (!manager) {
        return message.reply('Manager not found in this area.');
    }

    if (!manager.assigned) {
        return message.reply('Manager is not assigned to this area.');
    }

    // Remove manager from the area
    currentMine.managers[area] = currentMine.managers[area].filter(m => m.id !== managerId);

    // Add manager back to available managers
    currentMine.managers.shaft.push({ ...manager, assigned: false });

    await updateUser(userId, user);
    return message.reply('Successfully removed manager from the area.');
}

// Function to handle overview of managers in an area
async function handleManagerOverview(message, user, currentMine, area) {
    if (!['elevator', 'warehouse', 'shaft'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    const areaManagers = currentMine.managers[area] || [];

    if (areaManagers.length === 0) {
        return message.reply(`No managers assigned to the ${area}.`);
    }

    const managerList = areaManagers.map(m => `ID: ${m.id}, Name: ${m.name}, Assigned: ${m.assigned ? 'Yes' : 'No'}`).join('\n');
    const embed = new EmbedBuilder()
        .setTitle(`Managers in ${area.charAt(0).toUpperCase() + area.slice(1)}`)
        .setDescription(managerList)
        .setColor('#0099ff');

    return message.reply({ embeds: [embed] });
}
