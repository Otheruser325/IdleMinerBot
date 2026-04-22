import { getUser, updateUser, withUserLock } from '../../dataManager.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import numberFormat from '../../utils/numberFormat.js';
import managerDataJson from '../../config/managers.json' with { type: 'json' };
import managerCostsJson from '../../config/managerCosts.json' with { type: 'json' };
import { getManagerAbilityInfo, formatAbilityStatus, activateAbility, getAbilityCooldownRemaining, getManagersWithAbilities, formatAbilityAllEffects, formatAreaLabel, formatActiveEffects } from '../../utils/managerAbilities.js';
import { logError, safeEditMessage, safeUpdateInteraction } from '../../utils/errorHandling.js';
import { getCashField, getCashLabelByField } from '../../utils/continentLooker.js';
import { getMineNumber } from '../../utils/mineLooker.js';

const managerData = managerDataJson.managers;
const managerCosts = managerCostsJson.managerCosts;
const MANAGERS_PER_PAGE = 6;

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
    const baseId = getManagerBaseId(manager);
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

function getManagerBaseId(manager) {
    const rawId = Number(manager?.manager_id ?? manager?.ManagerID ?? 0);
    if (!Number.isFinite(rawId)) {
        return 0;
    }

    return rawId >= 100000 ? rawId - 100000 : rawId;
}

function getNormalizedManagerName(manager) {
    return String(manager?.name ?? manager?.Name ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeOwnedManager(manager) {
    if (!manager) {
        return manager;
    }

    const rawId = Number(manager.manager_id ?? manager.ManagerID ?? 0);
    if (manager.gender_id === undefined && manager.GenderId === undefined && rawId >= 100000) {
        manager.gender_id = 1;
    }

    manager.manager_id = getManagerBaseId(manager);
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

function getManagerSignature(manager) {
    return `${getManagerDisplayId(manager)}|${getNormalizedManagerName(manager)}`;
}

function getOwnedManagerSignatures(currentMine) {
    const ownedIds = new Set();
    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        for (const manager of currentMine.managers?.[area] || []) {
            ownedIds.add(getManagerSignature(manager));
        }
    });
    return ownedIds;
}

function managerExistsInMine(currentMine, manager) {
    return getOwnedManagerSignatures(currentMine).has(getManagerSignature(manager));
}

function managerExistsInArea(currentMine, area, manager) {
    const areaManagers = currentMine.managers?.[area] || [];
    const targetSignature = getManagerSignature(manager);
    return areaManagers.some(existingManager => getManagerSignature(existingManager) === targetSignature);
}

function formatAssignedManagerLabel(manager, area, abilityName = null) {
    const areaLabel = formatAreaLabel(area);
    const tierLabel = area === 'shaft' && manager.assigned_tier ? ` Tier ${manager.assigned_tier}` : '';
    const abilityLabel = abilityName ? `: ${abilityName}` : '';
    return `${manager.name} (${areaLabel}${tierLabel}${abilityLabel})`;
}

function clampFieldValue(lines) {
    return lines.join('\n').slice(0, 1024);
}

function getManagerHireWallet(currentMine) {
    const mineNumber = parseInt(currentMine?.mine_number, 10) || getMineNumber(currentMine?.mine_name);
    return getCashField(mineNumber);
}

function creditDuplicateManagerCompensation(user, currentMine, cost) {
    const walletField = getManagerHireWallet(currentMine);
    const compensation = Math.floor(cost * 0.5);
    user[walletField] = (user[walletField] || 0) + compensation;
    return { walletField, compensation };
}

function findManagerInCollection(collection = [], identifier) {
    if (identifier.numericId !== null) {
        const byId = collection.find(manager =>
            getManagerBaseId(manager) === identifier.numericId ||
            getManagerDisplayId(manager) === identifier.numericId
        );
        if (byId) {
            return byId;
        }
    }

    const lowered = identifier.raw.toLowerCase().replace(/\s+/g, ' ').trim();
    return collection.find(manager => getNormalizedManagerName(manager) === lowered) || null;
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
                return message.reply(`<@${userId}>, to manage your managers, you'll need to do: **hire** for hiring a specific manager in your ${currentMine.mine_name}'s workstations (shaft, elevator and warehouse; i.e. im!manager hire shaft), **fire** to sack a manager from their job in your ${currentMine.mine_name}, as long you unassigned them from a workstation, **assign** for assigning a hired manager in your workstation using either ID or name, if their statistics do comply (i.e. **im!manager assign warehouse 1** or **im!manager assign warehouse Benjamin Booth**), **remove** for removing an assigned manager in their workstation (i.e. **im!manager remove warehouse 1** or **im!manager remove warehouse Benjamin Booth**), **overview** with either workstation specified (shaft, elevator or warehouse) to view all your managers you've currently hired in that workstation in your ${currentMine.mine_name}, or **ability** to view a manager's special ability (i.e. **im!manager ability shaft 1** or **im!manager ability all**).`);
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
                    if (args[1]?.toLowerCase() === 'all') {
                        return handleAllManagerAbilities(message, user, currentMine, userId);
                    }
                    return handleManagerAbility(message, user, currentMine, userId, abilityArea, abilityManagerId);
                }
                default:
			        return message.reply(`Invalid subcommand, <@${userId}>! To manage your managers, you'll need to do: **hire** for hiring a specific manager in your ${currentMine.mine_name}'s workstations (shaft, elevator and warehouse; i.e. im!manager hire shaft), **fire** to sack a manager from their job in your ${currentMine.mine_name}, as long you unassigned them from a workstation, **assign** for assigning a hired manager in your workstation using either ID or name, if their statistics do comply (i.e. **im!manager assign warehouse 1** or **im!manager assign warehouse Benjamin Booth**), **remove** for removing an assigned manager in their workstation (i.e. **im!manager remove warehouse 1** or **im!manager remove warehouse Benjamin Booth**), **overview** with either workstation specified (shaft, elevator or warehouse) to view all your managers you've currently hired in that workstation in your ${currentMine.mine_name}, or **ability** to view a manager's special ability (i.e. **im!manager ability shaft 1** or **im!manager ability all**).`);
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

    normalizeMineManagers(currentMine);

    const managersAvailable = managerData.filter(manager =>
        normalizeManagerArea(manager.Area) === area
        && isDirectPurchaseManager(manager)
        && !managerExistsInMine(currentMine, manager)
    );

    if (managersAvailable.length === 0) {
        return message.reply(`You have already collected every directly purchasable manager available for the ${area}.`);
    }

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

    const walletField = getManagerHireWallet(currentMine);
    const walletLabel = getCashLabelByField(walletField);
    const availableCash = user[walletField] || 0;

    if (availableCash < cost) {
        return message.reply(`You need ${numberFormat(cost)} ${walletLabel} to hire a manager in the ${area}.`);
    }

    const newManager = pickManagerByBuyOrder(managersAvailable);
    if (!newManager) {
        return message.reply(`No directly purchasable managers are currently available for the ${area}.`);
    }

    if (managerExistsInMine(currentMine, newManager) || managerExistsInArea(currentMine, area, newManager)) {
        const { walletField, compensation } = creditDuplicateManagerCompensation(user, currentMine, cost);
        const walletLabel = getCashLabelByField(walletField);
        try {
            await updateUser(userId, user);
            try {
                await message.author.send(
                    `A duplicate manager roll in ${currentMine.mine_name} was purged automatically.\nYou were compensated ${numberFormat(compensation)} ${walletLabel}.`
                );
                return message.reply('A duplicate manager roll was purged automatically. I sent your compensation details by DM.');
            } catch (dmError) {
                logError('manager:hireDuplicateComp:dm', dmError, { userId, area, managerId: getManagerBaseId(newManager) });
                return message.reply(
                    `A duplicate manager roll was purged automatically. Your compensation was still applied: ${numberFormat(compensation)} ${walletLabel}.`
                );
            }
        } catch (error) {
            logError('manager:hireDuplicateComp', error, { userId, area, managerId: getManagerBaseId(newManager) });
            return message.reply('A duplicate manager was detected, but compensation could not be applied right now. Please try again later.');
        }
    }

    user[walletField] = availableCash - cost;
    currentMine.managers[area].push({
        manager_id: getManagerBaseId(newManager),
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
        logError('manager:hire', error, { userId, area });
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
        currentMine.managers[area] = currentMine.managers[area].filter(m => getManagerSignature(m) !== getManagerSignature(manager));
    });

    // Update the user's data in the database
    try {
        await updateUser(userId, user);
        return message.reply(`Successfully fired ${manager.name} (${getManagerDisplayId(manager)}).`);
    } catch (error) {
        logError('manager:fire', error, { userId, manager: managerIdOrName });
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
            if (getManagerSignature(m) === getManagerSignature(manager)) {
                m.assigned = false;
                m.assigned_tier = null; // Clear tier assignment
            }
            return m;
        }).filter(m => getManagerSignature(m) !== getManagerSignature(manager)); // Remove manager from the area
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
        logError('manager:assign', error, { userId, area, tier, manager: managerIdOrName });
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
        logError('manager:remove', error, { userId, area, manager: managerIdOrName });
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
    const managerEntries = areasToShow.flatMap(selectedArea => {
        const managersWithAbilities = getManagersWithAbilities(currentMine, selectedArea);
        return managersWithAbilities.map(manager => ({
            area: selectedArea,
            manager
        }));
    });

    if (managerEntries.length === 0) {
        return message.reply(area ? `No managers hired in ${area}.` : `You have not hired any managers in ${currentMine.mine_name}.`);
    }

    const totalPages = Math.ceil(managerEntries.length / MANAGERS_PER_PAGE);
    const baseTitle = area
        ? `Managers in ${area.charAt(0).toUpperCase() + area.slice(1)}`
        : `All Managers in ${currentMine.mine_name}`;

    const buildEmbed = page => {
        const startIndex = page * MANAGERS_PER_PAGE;
        const pageEntries = managerEntries.slice(startIndex, startIndex + MANAGERS_PER_PAGE);
        const embed = new EmbedBuilder()
            .setTitle(baseTitle)
            .setColor('#0099ff')
            .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

        pageEntries.forEach(({ area: selectedArea, manager }) => {
            const tierInfo = selectedArea === 'shaft' && manager.assigned_tier ? ` | Tier ${manager.assigned_tier}` : '';
            const genderLabel = (manager.gender_id ?? 0) === 1 ? 'Female' : 'Male';
            const status = manager.assigned ? 'Assigned' : 'Unassigned';
            const abilitySummary = manager.ability_status || 'No ability status available';

            embed.addFields({
                name: `${selectedArea.charAt(0).toUpperCase() + selectedArea.slice(1)} | ${manager.name}`,
                value: `${getManagerGenderEmoji(manager)} ID: ${getManagerDisplayId(manager)} | ${genderLabel} | ${status}${tierInfo}\n${abilitySummary}`,
                inline: false
            });
        });

        return embed;
    };

    if (totalPages === 1) {
        return message.reply({ embeds: [buildEmbed(0)] });
    }

    let currentPage = 0;
    const customToken = `${message.author.id}_${Date.now()}`;
    const previousId = `manager_prev_${customToken}`;
    const nextId = `manager_next_${customToken}`;
    const buildRow = page => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(previousId)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(nextId)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages - 1)
    );

    const replyMessage = await message.reply({
        embeds: [buildEmbed(currentPage)],
        components: [buildRow(currentPage)],
        fetchReply: true
    });

    const collector = replyMessage.createMessageComponentCollector({
        filter: interaction =>
            interaction.user.id === message.author.id &&
            [previousId, nextId].includes(interaction.customId),
        time: 60000
    });

    collector.on('collect', async interaction => {
        if (interaction.customId === previousId && currentPage > 0) {
            currentPage--;
        } else if (interaction.customId === nextId && currentPage < totalPages - 1) {
            currentPage++;
        }

        await safeUpdateInteraction(
            interaction,
            { embeds: [buildEmbed(currentPage)], components: [buildRow(currentPage)] },
            'manager:overview:update',
            { userId: interaction.user.id, page: currentPage + 1 }
        );
    });

    collector.on('end', async () => {
        if (replyMessage.editable) {
            await safeEditMessage(
                replyMessage,
                { components: [] },
                'manager:overview:end',
                { messageId: replyMessage.id }
            );
        }
    });

    return replyMessage;
}

// Function to handle manager ability activation
async function handleAllManagerAbilities(message, user, currentMine, userId) {
    normalizeMineManagers(currentMine);

    const activatedManagers = [];
    const skippedCooldown = [];
    const skippedActive = [];
    const skippedUnassigned = [];

    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        for (const manager of currentMine.managers[area] || []) {
            const abilityInfo = getManagerAbilityInfo(manager);

            if (!manager.assigned) {
                skippedUnassigned.push(formatAssignedManagerLabel(manager, area));
                continue;
            }

            if (manager.ability_state?.active) {
                skippedActive.push(formatAssignedManagerLabel(manager, area));
                continue;
            }

            const cooldownRemaining = getAbilityCooldownRemaining(manager);
            if (cooldownRemaining > 0) {
                skippedCooldown.push(formatAssignedManagerLabel(manager, area));
                continue;
            }

            manager.ability_state = activateAbility(manager);
            activatedManagers.push(formatAssignedManagerLabel(manager, area, abilityInfo.name));
        }
    });

    if (activatedManagers.length === 0) {
        const reasons = [];
        if (skippedCooldown.length > 0) reasons.push(`${skippedCooldown.length} on cooldown`);
        if (skippedUnassigned.length > 0) reasons.push(`${skippedUnassigned.length} unassigned`);
        return message.reply(`No manager abilities could be activated right now${reasons.length ? ` (${reasons.join(', ')})` : ''}.`);
    }

    try {
        await updateUser(userId, user);

        const embed = new EmbedBuilder()
            .setTitle(`Manager Abilities Activated in ${currentMine.mine_name}`)
            .setColor('#00FF00')
            .addFields(
                { name: 'Activated', value: clampFieldValue(activatedManagers), inline: false },
                { name: 'Active Effects', value: formatAbilityAllEffects(currentMine), inline: false }
            );

        if (skippedCooldown.length > 0) {
            embed.addFields({ name: 'Skipped (Cooldown)', value: clampFieldValue(skippedCooldown), inline: false });
        }

        if (skippedActive.length > 0) {
            embed.addFields({ name: 'Skipped (Already Active)', value: clampFieldValue(skippedActive), inline: false });
        }

        if (skippedUnassigned.length > 0) {
            embed.addFields({ name: 'Skipped (Unassigned)', value: clampFieldValue(skippedUnassigned), inline: false });
        }

        return message.reply({ embeds: [embed] });
    } catch (error) {
        logError('manager:abilityAll', error, { userId });
        return message.reply('There was an error activating all available manager abilities. Please try again.');
    }
}

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
        logError('manager:ability', error, { userId, area, manager: managerIdOrName });
        manager.ability_state = null; // Rollback
        return message.reply('There was an error activating the ability. Please try again.');
    }
}
