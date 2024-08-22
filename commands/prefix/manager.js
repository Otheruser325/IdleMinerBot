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
    const numManagersHired = (currentMine.managers[area] || []).length;

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
    // Ensure managers are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };

    // Find the manager by ID or name across all areas
    let manager;
    let managerArea;

    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        if (!manager) {
            manager = currentMine.managers[area].find(m => 
                m.id === parseInt(identifierOrId) || 
                m.name.toLowerCase() === identifierOrId.toLowerCase()
            );
            if (manager) managerArea = area;
        }
    });

    if (!manager) {
        return message.reply('Manager not found.');
    }

    if (manager.assigned) {
        return message.reply('You cannot fire a manager who is currently assigned to an area. Use `!manager remove` to remove them from their area first.');
    }

    // Remove the manager from the respective area
    currentMine.managers[managerArea] = currentMine.managers[managerArea].filter(m => m.id !== manager.id);

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        return message.reply('Successfully fired the manager.');
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle assigning a manager
async function handleManagerAssign(message, user, currentMine, userId, managerIdOrName, area) {
    // Check if the area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    // Ensure managers are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };

    // Ensure the specific area is properly initialized
    if (!Array.isArray(currentMine.managers[area])) {
        currentMine.managers[area] = [];
    }

    // Find the manager by ID or name across all areas
    const allManagers = [
        ...(currentMine.managers.shaft || []),
        ...(currentMine.managers.elevator || []),
        ...(currentMine.managers.warehouse || [])
    ];

    const manager = allManagers.find(m =>
        m.id === parseInt(managerIdOrName, 10) ||
        (typeof managerIdOrName === 'string' && m.name.toLowerCase() === managerIdOrName.toLowerCase())
    );

    if (!manager) {
        return message.reply('Manager not found.');
    }

    // Check if the target area already has an assigned manager
    const areaHasManager = currentMine.managers[area].some(m => m.assigned);
    if (areaHasManager) {
        return message.reply(`The ${area} already has an assigned manager. Remove the current manager before assigning a new one.`);
    }

    // Remove the manager from all other areas and set `assigned` to false
    ['shaft', 'elevator', 'warehouse'].forEach(a => {
        currentMine.managers[a] = currentMine.managers[a].map(m => {
            if (m.id === manager.id) {
                m.assigned = false;
            }
            return m;
        }).filter(m => m.id !== manager.id); // Remove manager from the area
    });

    // Assign the manager to the new area and set `assigned` to true
    manager.assigned = true;
    currentMine.managers[area].push(manager);

    // Update the user's data in the database
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
    // Check if the area is valid
    if (!['elevator', 'warehouse', 'shaft'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    // Ensure managers are properly initialized
    currentMine.managers = currentMine.managers || {
        shaft: [],
        elevator: [],
        warehouse: []
    };

    // Ensure the specific area is properly initialized
    if (!Array.isArray(currentMine.managers[area])) {
        currentMine.managers[area] = [];
    }

    // Find the manager in the specified area
    const managerIndex = currentMine.managers[area].findIndex(m => m.id === managerId);
    if (managerIndex === -1) {
        return message.reply('Manager not found in this area.');
    }

    const manager = currentMine.managers[area][managerIndex];

    if (!manager.assigned) {
        return message.reply('Manager is not assigned to this area.');
    }

    // Remove manager from the area
    currentMine.managers[area].splice(managerIndex, 1);

    // Update the manager's assigned status and push it back to the general pool
    manager.assigned = false;
    currentMine.managers.shaft.push(manager);

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        return message.reply('Successfully removed manager from the area.');
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
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
