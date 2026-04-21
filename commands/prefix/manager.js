import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import managerDataJson from '../../config/managers.json' with { type: 'json' };
import managerCostsJson from '../../config/managerCosts.json' with { type: 'json' };
import { getManagerAbilityInfo, formatAbilityStatus, activateAbility, getAbilityCooldownRemaining, getManagersWithAbilities, formatActiveEffects } from '../../utils/managerAbilities.js';

const managerData = managerDataJson.managers;
const managerCosts = managerCostsJson.managerCosts;

function normalizeManagerArea(area) {
    const normalizedArea = String(area || '').toLowerCase();
    if (normalizedArea === 'ground' || normalizedArea === 'warehouse') {
        return 'warehouse';
    }

    if (normalizedArea === 'corridor' || normalizedArea === 'shaft' || normalizedArea === 'mineshaft' || normalizedArea === 'mineshafts') {
        return 'shaft';
    }

    if (normalizedArea === 'elevator') {
        return 'elevator';
    }

    return normalizedArea;
}

function getManagerDisplayId(manager) {
    const baseId = manager.manager_id ?? manager.ManagerID ?? 0;
    const genderId = manager.gender_id ?? manager.GenderId ?? 0;
    return genderId === 1 ? baseId + 100000 : baseId;
}

function getManagerGenderEmoji(manager) {
    const genderId = manager.gender_id ?? manager.GenderId ?? 0;
    return genderId === 1 ? '👩' : '👨';
}

function normalizeManagerIdentifier(value) {
    if (value === undefined || value === null) {
        return { raw: '', numericId: null };
    }

    const raw = value.toString().trim();
    const numericId = /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
    return { raw, numericId };
}

function normalizeOwnedManager(manager) {
    if (!manager) {
        return manager;
    }

    manager.work_area = normalizeManagerArea(manager.work_area ?? manager.Area);
    if (manager.gender_id === undefined && manager.GenderId !== undefined) {
        manager.gender_id = manager.GenderId;
    }

    if (manager.assigned_tier === undefined) {
        manager.assigned_tier = null;
    }

    return manager;
}

function normalizeMineManagers(currentMine) {
    currentMine.managers = currentMine.managers || { shaft: [], elevator: [], warehouse: [] };

    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        const existingManagers = Array.isArray(currentMine.managers[area]) ? currentMine.managers[area] : [];
        currentMine.managers[area] = existingManagers.map(normalizeOwnedManager);
    });
}

function isDirectPurchaseManager(manager) {
    return Number(manager.AvailableThroughPurchase ?? 0) === 1;
}

function getManagerBuyOrder(manager) {
    return Number(manager.ManagerBuyOrder ?? 0);
}

function pickManagerByBuyOrder(managers) {
    const prioritizedManagers = managers.filter(manager => getManagerBuyOrder(manager) > 0);
    const highestBuyOrder = prioritizedManagers.length > 0
        ? Math.max(...prioritizedManagers.map(getManagerBuyOrder))
        : null;
    const candidatePool = highestBuyOrder !== null
        ? prioritizedManagers.filter(manager => getManagerBuyOrder(manager) === highestBuyOrder)
        : managers;

    return candidatePool[Math.floor(Math.random() * candidatePool.length)] || null;
}

function findManagerInCollection(collection = [], identifier) {
    if (identifier.numericId !== null) {
        const byId = collection.find(manager =>
            manager.manager_id === identifier.numericId ||
            getManagerDisplayId(manager) === identifier.numericId
        );
        if (byId) {
            return byId;
        }
    }

    const lowered = identifier.raw.toLowerCase();
    return collection.find(manager => manager.name.toLowerCase() === lowered) || null;
}

function findManagerAcrossAreas(currentMine, identifier) {
    return ['shaft', 'elevator', 'warehouse']
        .map(area => findManagerInCollection(currentMine.managers?.[area], identifier))
        .find(Boolean) || null;
}

export default {
    name: 'manager',
    description: 'Manage your managers by hiring, firing, assigning, or removing them.',
    async execute(message, args) {
        const userId = message.author.id;
        return withUserLock(userId, async () => {
            const user = await getUser(userId);

            if (!user) {
                return message.reply('You need to start the game first by using `im!start` (or `/start` if using slash).');
            }

            const currentMine = user.mines.find(mine => mine.mine_name === user.current_mine);
            if (!currentMine) {
                return message.reply('Current mine data not found.');
            }

            normalizeMineManagers(currentMine);
            currentMine.mineshafts = currentMine.mineshafts || [];
            currentMine.elevator = currentMine.elevator || [];
            currentMine.warehouse = currentMine.warehouse || [];

            if (args.length < 1) {
                return message.reply(`<@${userId}>, to manage your managers, you'll need to do: **hire** for hiring a specific manager in your ${currentMine.mine_name}'s workstations (shaft, elevator and warehouse; i.e. im!manager hire shaft), **fire** to sack a manager from their job in your ${currentMine.mine_name}, as long you unassigned them from a workstation, **assign** for assigning a hired manager in your workstation using either ID or name, if their statistics do comply (i.e. **im!manager assign warehouse 1** or **im!manager assign warehouse Benjamin Booth**), **remove** for removing an assigned manager in their workstation (i.e. **im!manager remove warehouse 1** or **im!manager remove warehouse Benjamin Booth**), **overview** with either workstation specified (shaft, elevator or warehouse) to view all your managers you've currently hired in that workstation in your ${currentMine.mine_name}, or **ability** to view a manager's special ability (i.e. **im!manager ability shaft 1**).`);
            }

            const subcommand = args[0].toLowerCase();
            const area = args[1] ? normalizeManagerArea(args[1]) : null;
            const managerIdOrName = args.slice(2).join(' ');
		    const managerIdOrName2 = args.slice(1).join(' ');

            if (!currentMine.mineshafts[0]) {
                return message.reply(`You don't have a valid tier 1 shaft in your ${currentMine.mine_name}. Purchase it using **\`im!shaft buy 1\`** before accessing your managers.`);
            }

            const firstShaftLevel = currentMine.mineshafts[0].level;
            if (firstShaftLevel < 5) {
                return message.reply(`You need to upgrade your first shaft to **Level 5** in your __${currentMine.mine_name}__ before accessing your managers.`);
            }

            switch (subcommand) {
                case 'hire':
                    return handleManagerHire(message, user, currentMine, userId, area);
                case 'fire':
			        return handleManagerFire(message, user, currentMine, userId, managerIdOrName2);
                case 'assign': {
                    let tier = null;
                    let managerId = managerIdOrName;

                    if (area === 'shaft' && args[2]) {
                        const possibleTier = parseInt(args[2], 10);
                        if (!isNaN(possibleTier) && possibleTier >= 1 && possibleTier <= 40) {
                            tier = possibleTier;
                            managerId = args.slice(3).join(' ');
                        }
                    }

                    return handleManagerAssign(message, user, currentMine, userId, managerId, area, tier);
                }
                case 'remove':
                    return handleManagerRemove(message, user, currentMine, userId, managerIdOrName, area);
                case 'overview':
                    return handleManagerOverview(message, user, currentMine, area);
                case 'ability': {
                    const abilityArea = args[1] ? normalizeManagerArea(args[1]) : null;
                    const abilityManagerId = args.slice(2).join(' ');
                    return handleManagerAbility(message, user, currentMine, userId, abilityArea, abilityManagerId);
                }
                default:
			        return message.reply(`Invalid subcommand, <@${userId}>! To manage your managers, you'll need to do: **hire** for hiring a specific manager in your ${currentMine.mine_name}'s workstations (shaft, elevator and warehouse; i.e. im!manager hire shaft), **fire** to sack a manager from their job in your ${currentMine.mine_name}, as long you unassigned them from a workstation, **assign** for assigning a hired manager in your workstation using either ID or name, if their statistics do comply (i.e. **im!manager assign warehouse 1** or **im!manager assign warehouse Benjamin Booth**), **remove** for removing an assigned manager in their workstation (i.e. **im!manager remove warehouse 1** or **im!manager remove warehouse Benjamin Booth**), **overview** with either workstation specified (shaft, elevator or warehouse) to view all your managers you've currently hired in that workstation in your ${currentMine.mine_name}, or **ability** to view a manager's special ability (i.e. **im!manager ability shaft 1**).`);
            }
        });
    }
};

// Function to handle hiring a manager
async function handleManagerHire(message, user, currentMine, userId, area) {
    if (!area) {
        return message.reply('Please mention the area you want to hire the manager in. Available areas: shaft, elevator, warehouse.');
    }
    
    // Check if area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    const managersAvailable = managerData.filter(manager =>
        normalizeManagerArea(manager.Area) === area && isDirectPurchaseManager(manager)
    );

    if (managersAvailable.length === 0) {
        return message.reply(`No directly purchasable managers are available for the ${area}.`);
    }

    // Ensure managers for the area are initialized
    normalizeMineManagers(currentMine);

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
        return message.reply(`No directly purchasable managers with rarity ${rarityID} are available in the ${area}.`);
    }

    const newManager = pickManagerByBuyOrder(availableManagersByRarity);
    user.cash -= cost;
    currentMine.managers[area].push({
        manager_id: newManager.ManagerID,
		name: newManager.Name,
		gender_id: newManager.GenderId || 0,
		rarity_id: newManager.RarityID,
		effect_id: newManager.EffectID,
        work_area: normalizeManagerArea(newManager.Area),
		value_x: newManager.ValueX,
        assigned: false
    });

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        const displayId = getManagerDisplayId({ manager_id: newManager.ManagerID, gender_id: newManager.GenderId || 0 });
        return message.reply(`Successfully hired ${newManager.Name} (${displayId}) for the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle firing a manager
async function handleManagerFire(message, user, currentMine, userId, managerIdOrName) {
    if (!managerIdOrName) {
        return message.reply('Please mention the ID or name of the manager you want to fire.');
    }

    // Ensure managers are properly initialized
    normalizeMineManagers(currentMine);
	
    const manager = findManagerAcrossAreas(currentMine, normalizeManagerIdentifier(managerIdOrName));

    if (!manager) {
        return message.reply('Manager not found.');
    }

    if (manager.assigned) {
        return message.reply('You cannot fire a manager who is currently assigned to an area. Use `im!manager remove` to remove them from their area first.');
    }

    // Remove the manager from all areas
    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        currentMine.managers[area] = currentMine.managers[area].filter(m => m.manager_id !== manager.manager_id);
    });

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        return message.reply(`Successfully fired ${manager.name} (${getManagerDisplayId(manager)}).`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle assigning a manager
async function handleManagerAssign(message, user, currentMine, userId, managerIdOrName, area, tier) {
    if (!area) {
        return message.reply('Please specify the area. Available areas: shaft, elevator, warehouse.');
    }
    
    if (!managerIdOrName) {
        return message.reply('Please mention the ID or name of the manager you want to assign. Usage: im!manager assign warehouse 1 or im!manager assign shaft 1 <manager>');
    }

    // Shaft managers require a tier
    if (area === 'shaft' && !tier) {
        return message.reply('Shaft managers require a tier (1-40). Usage: im!manager assign shaft <tier> <manager>');
    }

    // Validate tier for shaft managers
    if (area === 'shaft' && tier) {
        const shaft = currentMine.mineshafts.find(s => s.tier === tier);
        if (!shaft) {
            return message.reply(`You do not own a shaft of Tier ${tier} in the ${currentMine.mine_name}.`);
        }
    }

    // Non-shaft managers shouldn't have tier specified
    if (area !== 'shaft' && tier) {
        return message.reply('Tier parameter is only used for shaft managers.');
    }

    // Check if the area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    // Ensure managers are properly initialized
    normalizeMineManagers(currentMine);
	
    const manager = findManagerInCollection(
        currentMine.managers[area],
        normalizeManagerIdentifier(managerIdOrName)
    );

    if (!manager) {
        return message.reply('Manager not found.');
    }

    // Verify the manager's area compatibility
    if (manager.work_area.toLowerCase() !== area.toLowerCase()) {
        return message.reply(`Manager ${manager.name} cannot be assigned to the ${area}. They are only available for the ${manager.work_area}.`);
    }

    // For shaft managers, check if that specific tier already has a manager
    if (area === 'shaft') {
        const tierHasManager = currentMine.managers.shaft.some(m => m.assigned && m.assigned_tier === tier);
        if (tierHasManager) {
            return message.reply(`Shaft Tier ${tier} already has an assigned manager. Remove the current manager before assigning a new one.`);
        }
    } else {
        // For elevator/warehouse, only one manager per area
        const areaHasManager = currentMine.managers[area].some(m => m.assigned);
        if (areaHasManager) {
            return message.reply(`The ${area} already has an assigned manager. Remove the current manager before assigning a new one.`);
        }
    }

    // Remove the manager from all other areas and set `Assigned` to false
    ['shaft', 'elevator', 'warehouse'].forEach(a => {
        currentMine.managers[a] = currentMine.managers[a].map(m => {
            if (m.manager_id === manager.manager_id) {
                m.assigned = false;
                m.assigned_tier = null; // Clear tier assignment
            }
            return m;
        }).filter(m => m.manager_id !== manager.manager_id); // Remove manager from the area
    });

    // Assign the manager to the new area and set properties
    manager.assigned = true;
    if (area === 'shaft' && tier) {
        manager.assigned_tier = tier;
    }
    currentMine.managers[area].push(manager);

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        const tierInfo = (area === 'shaft' && tier) ? ` (Tier ${tier})` : '';
        return message.reply(`Successfully assigned manager ${manager.name} (${getManagerDisplayId(manager)}) to the ${area}${tierInfo}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle removing a manager
async function handleManagerRemove(message, user, currentMine, userId, managerIdOrName, area) {
    if (!managerIdOrName) {
        return message.reply('Please mention the ID of the manager you want to remove from the area. Usage: im!manager remove warehouse 1');
    }

    if (!area) {
        return message.reply('Please specify the area. Available areas: shaft, elevator, warehouse.');
    }
    
    // Check if the area is valid
    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    // Ensure managers are properly initialized
    normalizeMineManagers(currentMine);
	
    const manager = findManagerInCollection(
        currentMine.managers[area],
        normalizeManagerIdentifier(managerIdOrName)
    );

    if (!manager) {
        return message.reply('Manager not found.');
    }

    if (!manager.assigned) {
        return message.reply('Manager is not assigned to this area.');
    }

    // Get tier info before clearing it
    const tierInfo = (area === 'shaft' && manager.assigned_tier) ? ` (Tier ${manager.assigned_tier})` : '';

    // Update the manager's assigned status to false
    manager.assigned = false;
    if (area === 'shaft') {
        manager.assigned_tier = null; // Clear tier assignment
    }

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        return message.reply(`Successfully removed manager ${manager.name} (${getManagerDisplayId(manager)})${tierInfo} from the ${area}.`);
    } catch (error) {
        console.error('Failed to update user data:', error);
        return message.reply('There was an error while updating your data. Please try again later.');
    }
}

// Function to handle overview of managers in an area
async function handleManagerOverview(message, user, currentMine, area) {
    if (area && !['elevator', 'warehouse', 'shaft'].includes(area)) {
        return message.reply('Invalid area specified.');
    }

    normalizeMineManagers(currentMine);

    const areasToShow = area ? [area] : ['shaft', 'elevator', 'warehouse'];
    const sections = areasToShow.map(selectedArea => {
        const managersWithAbilities = getManagersWithAbilities(currentMine, selectedArea);
        if (managersWithAbilities.length === 0) {
            return {
                name: selectedArea.charAt(0).toUpperCase() + selectedArea.slice(1),
                value: 'No managers hired'
            };
        }

        return {
            name: selectedArea.charAt(0).toUpperCase() + selectedArea.slice(1),
            value: managersWithAbilities.map(m => {
                const tierInfo = (selectedArea === 'shaft' && m.assigned_tier) ? ` (Tier ${m.assigned_tier})` : '';
                const genderLabel = (m.gender_id ?? 0) === 1 ? 'Female' : 'Male';
                return `${getManagerGenderEmoji(m)} ID: ${getManagerDisplayId(m)}, Name: ${m.name}, Gender: ${genderLabel}, Assigned: ${m.assigned ? 'Yes' : 'No'}${tierInfo}\n${m.ability_status}`;
            }).join('\n\n')
        };
    });

    const embed = new EmbedBuilder()
        .setTitle(area ? `Managers in ${area.charAt(0).toUpperCase() + area.slice(1)}` : `All Managers in ${currentMine.mine_name}`)
        .setColor('#0099ff');

    sections.forEach(section => {
        embed.addFields({ name: section.name, value: section.value, inline: false });
    });

    return message.reply({ embeds: [embed] });
}

// Function to handle manager ability activation
async function handleManagerAbility(message, user, currentMine, userId, area, managerIdOrName) {
    if (!area) {
        return message.reply('Please specify the area. Usage: im!manager ability <area> <manager_id_or_name>');
    }

    if (!['shaft', 'elevator', 'warehouse'].includes(area)) {
        return message.reply('Invalid area. Available areas: shaft, elevator, warehouse.');
    }

    if (!managerIdOrName) {
        return message.reply('Please specify the manager ID or name. Usage: im!manager ability <area> <manager_id_or_name>');
    }

    // Ensure managers are initialized
    normalizeMineManagers(currentMine);

    // Find the manager
    const manager = findManagerInCollection(
        currentMine.managers[area],
        normalizeManagerIdentifier(managerIdOrName)
    );

    if (!manager) {
        return message.reply(`Manager not found in ${area}. Use im!manager overview ${area} to see available managers.`);
    }

    // Get ability info
    const abilityInfo = getManagerAbilityInfo(manager);
    const cooldownRemaining = getAbilityCooldownRemaining(manager);

    // Check if ability is already active
    if (manager.ability_state?.active) {
        const remaining = Math.ceil((manager.ability_state.expires_at - Date.now()) / 1000);
        return message.reply(`✨ ${manager.name}'s ${abilityInfo.name} is already active! ${remaining}s remaining.`);
    }

    // Check if can activate
    if (cooldownRemaining > 0) {
        const minutes = Math.floor(cooldownRemaining / 60);
        const seconds = cooldownRemaining % 60;
        return message.reply(`⏳ ${manager.name}'s ${abilityInfo.name} is on cooldown. ${minutes}m ${seconds}s remaining.`);
    }

    if (!manager.assigned) {
        return message.reply(`❌ ${manager.name} must be assigned to ${area} to use their ability.`);
    }

    // Activate the ability!
    manager.ability_state = activateAbility(manager);
    
    // Save to database
    try {
        await updateUser(userId, user);
        
        // Get updated active effects for display
        const activeEffects = formatActiveEffects(currentMine);
        
        const embed = new EmbedBuilder()
            .setTitle(`✨ ${manager.name}'s Ability Activated!`)
            .setColor('#00FF00')
            .setDescription(`${abilityInfo.name} is now active for ${abilityInfo.activeTime}s!`)
            .addFields(
                { name: 'Effect', value: abilityInfo.description, inline: false },
                { name: 'Active Effects', value: activeEffects, inline: false }
            )
            .setFooter({ text: `Cooldown will be ${abilityInfo.cooldown}s after ability ends` });
        
        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Failed to activate ability:', error);
        manager.ability_state = null; // Rollback
        return message.reply('There was an error activating the ability. Please try again.');
    }
}
