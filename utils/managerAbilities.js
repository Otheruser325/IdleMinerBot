/**
 * Manager Abilities Utility
 * Maps EffectIDs to ability descriptions and handles ability activation with real gameplay effects
 */

import managerDataJson from '../config/managers.json' with { type: 'json' };
import managerEffectsJson from '../config/managerEffects.json' with { type: 'json' };

const managerData = managerDataJson.managers;
const managerEffects = managerEffectsJson.managerEffects || [];

function normalizeEffectArea(area) {
    const normalizedArea = String(area || '').toLowerCase();
    if (normalizedArea === 'ground' || normalizedArea === 'warehouse') return 'warehouse';
    if (normalizedArea === 'corridor' || normalizedArea === 'shaft' || normalizedArea === 'mineshaft') return 'shaft';
    if (normalizedArea === 'elevator') return 'elevator';
    return normalizedArea;
}

function getEffectMetadata(effectId) {
    return managerEffects.find(effect => effect.EffectID === Number(effectId)) || null;
}

export function formatAreaLabel(area) {
    const normalizedArea = normalizeEffectArea(area);
    if (normalizedArea === 'shaft') return 'Shaft';
    if (normalizedArea === 'elevator') return 'Elevator';
    if (normalizedArea === 'warehouse') return 'Warehouse';
    return normalizedArea ? normalizedArea.charAt(0).toUpperCase() + normalizedArea.slice(1) : 'Unknown';
}

function inferAbilityType(effectMetadata, fallbackAbility) {
    const stringId = String(effectMetadata?.StringId || '').toLowerCase();
    const effectName = String(effectMetadata?.EffectName || '').toLowerCase();

    if (stringId.includes('instantmoney')) return 'income_beam';
    if (stringId.includes('upgradecost')) return 'cost_reduction';
    if (stringId.includes('loadingpersecond')) return 'loading_speed';
    if (stringId.includes('capacity')) return 'capacity';
    if (stringId.includes('walking') || stringId.includes('tierspersecond')) return 'speed';
    if (stringId.includes('workergainmultiplier')) return 'mining_speed';
    if (stringId.includes('income')) return 'income_multiplier';

    if (effectName.includes('beam')) return 'income_beam';
    if (effectName.includes('cost')) return 'cost_reduction';
    if (effectName.includes('loading')) return 'loading_speed';
    if (effectName.includes('capacity') || effectName.includes('load expansion')) return 'capacity';
    if (effectName.includes('walking') || effectName.includes('movement')) return 'speed';
    if (effectName.includes('mining')) return 'mining_speed';
    if (effectName.includes('income')) return 'income_multiplier';

    return fallbackAbility?.type || 'none';
}

function getEffectDescriptor(effectId) {
    const fallbackAbility = ABILITY_EFFECTS[effectId] || null;
    const effectMetadata = getEffectMetadata(effectId);
    const target = normalizeEffectArea(effectMetadata?.Area) || fallbackAbility?.target || 'none';
    const type = inferAbilityType(effectMetadata, fallbackAbility);

    return {
        effectId: Number(effectId),
        name: effectMetadata?.EffectName || fallbackAbility?.name || 'Unknown',
        description: fallbackAbility?.description || effectMetadata?.EffectDescription || 'No ability data available',
        type,
        target,
        applyEffect: fallbackAbility?.applyEffect || ((baseValue) => baseValue)
    };
}

// Effect ID to ability mapping with real gameplay effects
// ValueX scales by rarity: Junior (0.6), Senior (~0.8), Executive (higher)
const ABILITY_EFFECTS = {
    // Warehouse Abilities (1-5)
    1: {
        name: 'Walking Speed Boost',
        description: 'Warehouse workers move {valueX}x faster for {activeTime}s',
        type: 'speed',
        target: 'warehouse',
        applyEffect: (baseValue, effectValue) => baseValue * effectValue
    },
    2: {
        name: 'Income Multiplier',
        description: 'Warehouse income multiplied by {valueX}x for {activeTime}s',
        type: 'income_multiplier',
        target: 'warehouse',
        applyEffect: (baseIncome, effectValue) => baseIncome * effectValue
    },
    3: {
        name: 'Upgrade Cost Reduction',
        description: 'Warehouse upgrades cost {valueX}x less for {activeTime}s (0.6 = 40% discount)',
        type: 'cost_reduction',
        target: 'warehouse',
        applyEffect: (baseCost, effectValue) => baseCost * effectValue
    },
    4: {
        name: 'Loading Speed Boost',
        description: 'Warehouse loading speed increased by {valueX}x for {activeTime}s',
        type: 'loading_speed',
        target: 'warehouse',
        applyEffect: (baseSpeed, effectValue) => baseSpeed * effectValue
    },
    5: {
        name: 'Load Expansion',
        description: 'Warehouse load capacity increased by {valueX}x for {activeTime}s',
        type: 'capacity',
        target: 'warehouse',
        applyEffect: (baseCapacity, effectValue) => baseCapacity * effectValue
    },
    // Mineshaft Abilities (6-10)
    6: {
        name: 'Income Multiplier',
        description: 'Mineshaft income multiplied by {valueX}x for {activeTime}s',
        type: 'income_multiplier',
        target: 'shaft',
        applyEffect: (baseIncome, effectValue) => baseIncome * effectValue
    },
    7: {
        name: 'Income Beam',
        description: '{valueX}% of mined resources beamed directly to warehouse as cash for {activeTime}s (0.4 = 40%)',
        type: 'income_beam',
        target: 'shaft',
        applyEffect: (amountMined, effectValue) => amountMined * effectValue
    },
    8: {
        name: 'Mining Speed Boost',
        description: 'Mining speed increased by {valueX}x for {activeTime}s',
        type: 'mining_speed',
        target: 'shaft',
        applyEffect: (baseSpeed, effectValue) => baseSpeed * effectValue
    },
    9: {
        name: 'Walking Speed Boost',
        description: 'Shaft workers move {valueX}x faster for {activeTime}s',
        type: 'speed',
        target: 'shaft',
        applyEffect: (baseSpeed, effectValue) => baseSpeed * effectValue
    },
    10: {
        name: 'Upgrade Cost Reduction',
        description: 'Shaft upgrades cost {valueX}x less for {activeTime}s (0.6 = 40% discount)',
        type: 'cost_reduction',
        target: 'shaft',
        applyEffect: (baseCost, effectValue) => baseCost * effectValue
    },
    // Elevator Abilities (11-16)
    11: {
        name: 'Movement Speed Boost',
        description: 'Elevator moves {valueX}x faster for {activeTime}s',
        type: 'speed',
        target: 'elevator',
        applyEffect: (baseSpeed, effectValue) => baseSpeed * effectValue
    },
    12: {
        name: 'Load Expansion',
        description: 'Elevator load capacity increased by {valueX}x for {activeTime}s',
        type: 'capacity',
        target: 'elevator',
        applyEffect: (baseCapacity, effectValue) => baseCapacity * effectValue
    },
    13: {
        name: 'Loading Speed Boost',
        description: 'Elevator loading speed increased by {valueX}x for {activeTime}s',
        type: 'loading_speed',
        target: 'elevator',
        applyEffect: (baseSpeed, effectValue) => baseSpeed * effectValue
    },
    14: {
        name: 'Income Beam',
        description: '{valueX}% of extracted resources beamed directly to warehouse as cash for {activeTime}s (0.4 = 40%)',
        type: 'income_beam',
        target: 'elevator',
        applyEffect: (amountExtracted, effectValue) => amountExtracted * effectValue
    },
    15: {
        name: 'Income Multiplier',
        description: 'Elevator income multiplied by {valueX}x for {activeTime}s',
        type: 'income_multiplier',
        target: 'elevator',
        applyEffect: (baseIncome, effectValue) => baseIncome * effectValue
    },
    16: {
        name: 'Upgrade Cost Reduction',
        description: 'Elevator upgrades cost {valueX}x less for {activeTime}s (0.6 = 40% discount)',
        type: 'cost_reduction',
        target: 'elevator',
        applyEffect: (baseCost, effectValue) => baseCost * effectValue
    }
};

/**
 * Get ability details by EffectID
 * @param {number} effectId - The effect ID
 * @returns {Object|null} - Ability details
 */
export function getAbilityByEffectId(effectId) {
    return getEffectDescriptor(effectId);
}

/**
 * Get all active effects for a mine
 * @param {Object} currentMine - Current mine data
 * @returns {Object} - Active effects by type
 */
export function getActiveEffects(currentMine) {
    const now = Date.now();
    const effects = {
        income_multiplier: { shaft: 1, elevator: 1, warehouse: 1 },
        speed: { shaft: 1, elevator: 1, warehouse: 1 },
        capacity: { shaft: 1, elevator: 1, warehouse: 1 },
        loading_speed: { shaft: 1, elevator: 1, warehouse: 1 },
        mining_speed: { shaft: 1, elevator: 1, warehouse: 1 },
        cost_reduction: { shaft: 1, elevator: 1, warehouse: 1 },
        income_beam: { shaft: 0, elevator: 0 } // Percentage (0-1)
    };

    if (!currentMine.managers) return effects;

    // Check all areas for assigned managers with active abilities
    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        if (!currentMine.managers[area]) return;

        currentMine.managers[area].forEach(manager => {
            if (!manager.assigned || !manager.ability_state?.active) return;

            // Check if ability is still active (not expired)
            if (manager.ability_state.expires_at < now) {
                manager.ability_state.active = false;
                return;
            }

            const effectId = manager.effect_id || manager.EffectID;
            const ability = getEffectDescriptor(effectId);
            const valueX = manager.value_x || manager.ValueX || 1;

            if (!ability || ability.type === 'none') return;

            // Apply effect based on type
            switch (ability.type) {
                case 'income_multiplier':
                    effects.income_multiplier[ability.target] *= valueX;
                    break;
                case 'speed':
                    effects.speed[ability.target] *= valueX;
                    break;
                case 'capacity':
                    effects.capacity[ability.target] *= valueX;
                    break;
                case 'loading_speed':
                    effects.loading_speed[ability.target] *= valueX;
                    break;
                case 'mining_speed':
                    effects.mining_speed.shaft *= valueX;
                    break;
                case 'cost_reduction':
                    effects.cost_reduction[ability.target] *= valueX;
                    break;
                case 'income_beam':
                    effects.income_beam[ability.target] = Math.max(
                        effects.income_beam[ability.target],
                        valueX
                    );
                    break;
            }
        });
    });

    return effects;
}

/**
 * Apply income multiplier to cash reward
 * @param {number} baseCash - Base cash amount
 * @param {Object} currentMine - Current mine data
 * @returns {Object} - { finalCash, multiplier, breakdown }
 */
export function applyIncomeMultiplier(baseCash, currentMine) {
    const effects = getActiveEffects(currentMine);
    
    // Warehouse income multiplier affects final sale
    const multiplier = effects.income_multiplier.warehouse;
    const finalCash = baseCash * multiplier;

    return {
        finalCash,
        multiplier,
        breakdown: multiplier > 1 ? [
            `Base: ${baseCash}`,
            `Manager Multiplier: ${multiplier.toFixed(2)}x`,
            `Final: ${Math.floor(finalCash)}`
        ] : null
    };
}

/**
 * Apply income beam to shaft mining - returns instant cash from mined resources
 * @param {number} amountMined - Amount mined
 * @param {Object} currentMine - Current mine data
 * @returns {Object} - { beamAmount, remainingDeposit, message }
 */
export function applyShaftIncomeBeam(amountMined, currentMine) {
    const effects = getActiveEffects(currentMine);
    const beamPercent = effects.income_beam.shaft;

    if (beamPercent <= 0) {
        return { beamAmount: 0, remainingDeposit: amountMined, message: null };
    }

    const beamAmount = Math.floor(amountMined * beamPercent);
    const remainingDeposit = amountMined - beamAmount;

    return {
        beamAmount,
        remainingDeposit,
        message: `💰 Income Beam activated! ${beamAmount} minerals beamed directly to warehouse as cash!`
    };
}

/**
 * Apply income beam to elevator extraction - returns instant cash from extracted resources
 * @param {number} amountExtracted - Amount extracted
 * @param {Object} currentMine - Current mine data
 * @returns {Object} - { beamAmount, remainingDeposit, message }
 */
export function applyElevatorIncomeBeam(amountExtracted, currentMine) {
    const effects = getActiveEffects(currentMine);
    const beamPercent = effects.income_beam.elevator;

    if (beamPercent <= 0) {
        return { beamAmount: 0, remainingDeposit: amountExtracted, message: null };
    }

    const beamAmount = Math.floor(amountExtracted * beamPercent);
    const remainingDeposit = amountExtracted - beamAmount;

    return {
        beamAmount,
        remainingDeposit,
        message: `⚡ Income Beam activated! ${beamAmount} minerals instantly converted to cash!`
    };
}

/**
 * Apply speed multiplier to time
 * @param {number} baseTimeMs - Base time in milliseconds
 * @param {string} area - Area name (shaft, elevator, warehouse)
 * @param {Object} currentMine - Current mine data
 * @returns {number} - Adjusted time
 */
export function applySpeedBoost(baseTimeMs, area, currentMine) {
    const effects = getActiveEffects(currentMine);
    const speedMultiplier = effects.speed[area];
    return Math.floor(baseTimeMs / speedMultiplier);
}

/**
 * Apply capacity boost
 * @param {number} baseCapacity - Base capacity
 * @param {string} area - Area name
 * @param {Object} currentMine - Current mine data
 * @returns {number} - Adjusted capacity
 */
export function applyCapacityBoost(baseCapacity, area, currentMine) {
    const effects = getActiveEffects(currentMine);
    const capacityMultiplier = effects.capacity[area];
    return Math.floor(baseCapacity * capacityMultiplier);
}

/**
 * Apply mining speed boost (shaft only)
 * @param {number} baseTimeMs - Base mining time
 * @param {Object} currentMine - Current mine data
 * @returns {number} - Adjusted time
 */
export function applyMiningSpeedBoost(baseTimeMs, currentMine) {
    const effects = getActiveEffects(currentMine);
    const speedMultiplier = effects.mining_speed.shaft;
    return Math.floor(baseTimeMs / speedMultiplier);
}

/**
 * Apply loading speed boost
 * @param {number} baseLoadingSpeed - Base loading speed (units per second)
 * @param {string} area - Area name
 * @param {Object} currentMine - Current mine data
 * @returns {number} - Adjusted loading speed
 */
export function applyLoadingSpeedBoost(baseLoadingSpeed, area, currentMine) {
    const effects = getActiveEffects(currentMine);
    const speedMultiplier = effects.loading_speed[area];
    return baseLoadingSpeed * speedMultiplier;
}

/**
 * Apply cost reduction
 * @param {number} baseCost - Base cost
 * @param {string} area - Area name
 * @param {Object} currentMine - Current mine data
 * @returns {number} - Adjusted cost
 */
export function applyCostReduction(baseCost, area, currentMine) {
    const effects = getActiveEffects(currentMine);
    const costMultiplier = effects.cost_reduction[area];
    return Math.floor(baseCost * costMultiplier);
}

/**
 * Format active effects for display
 * @param {Object} currentMine - Current mine data
 * @returns {string} - Formatted effects string
 */
export function formatActiveEffects(currentMine) {
    const effects = getActiveEffects(currentMine);
    const lines = [];

    if (effects.income_multiplier.warehouse > 1) {
        lines.push(`💰 Income Multiplier: ${effects.income_multiplier.warehouse.toFixed(2)}x`);
    }
    if (effects.income_beam.shaft > 0) {
        lines.push(`⚡ Shaft Income Beam: ${(effects.income_beam.shaft * 100).toFixed(0)}%`);
    }
    if (effects.income_beam.elevator > 0) {
        lines.push(`⚡ Elevator Income Beam: ${(effects.income_beam.elevator * 100).toFixed(0)}%`);
    }
    if (effects.speed.shaft > 1) {
        lines.push(`🚀 Shaft Speed: ${effects.speed.shaft.toFixed(2)}x`);
    }
    if (effects.speed.elevator > 1) {
        lines.push(`🚀 Elevator Speed: ${effects.speed.elevator.toFixed(2)}x`);
    }
    if (effects.mining_speed.shaft > 1) {
        lines.push(`⛏️ Mining Speed: ${effects.mining_speed.shaft.toFixed(2)}x`);
    }
    if (effects.loading_speed.shaft > 1) {
        lines.push(`📦 Shaft Loading: ${effects.loading_speed.shaft.toFixed(2)}x`);
    }
    if (effects.loading_speed.elevator > 1) {
        lines.push(`📦 Elevator Loading: ${effects.loading_speed.elevator.toFixed(2)}x`);
    }
    if (effects.capacity.shaft > 1) {
        lines.push(`📊 Shaft Capacity: ${effects.capacity.shaft.toFixed(2)}x`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No active effects';
}

export function getMineWideIncomeMultiplier(currentMine) {
    const effects = getActiveEffects(currentMine);
    return effects.income_multiplier.shaft
        * effects.income_multiplier.elevator
        * effects.income_multiplier.warehouse;
}

function formatDuration(secondsRemaining) {
    const safeSeconds = Math.max(0, Math.ceil(secondsRemaining));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function getActiveAreaAbilities(currentMine, area, options = {}) {
    const now = Date.now();
    const tier = options.tier ?? null;
    const managers = currentMine?.managers?.[area] || [];

    return managers
        .filter(manager => {
            if (!manager.assigned || !manager.ability_state?.active || manager.ability_state.expires_at <= now) {
                return false;
            }

            if (area === 'shaft' && tier !== null && manager.assigned_tier && manager.assigned_tier !== tier) {
                return false;
            }

            return true;
        })
        .map(manager => {
            const ability = getManagerAbilityInfo(manager);
            const secondsRemaining = Math.ceil((manager.ability_state.expires_at - now) / 1000);
            return {
                managerName: manager.name || manager.Name || `Manager ${manager.manager_id || manager.ManagerID || 'Unknown'}`,
                abilityName: ability.name,
                description: ability.description,
                type: ability.type,
                target: ability.target,
                valueX: ability.valueX,
                secondsRemaining,
                remainingLabel: formatDuration(secondsRemaining)
            };
        });
}

export function formatActiveAreaAbilities(currentMine, area, options = {}) {
    const abilities = getActiveAreaAbilities(currentMine, area, options);
    if (abilities.length === 0) {
        return 'No active manager ability boosts';
    }

    return abilities
        .map(ability => {
            const tierLabel = area === 'shaft' && options.tier !== null && options.tier !== undefined
                ? `Shaft Tier ${options.tier} | `
                : '';
            return `${tierLabel}${ability.managerName}: ${ability.abilityName} (${ability.remainingLabel} left)`;
        })
        .join('\n');
}

export function formatAbilityAllEffects(currentMine) {
    const now = Date.now();
    const groupedAbilities = new Map();

    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        const managers = currentMine?.managers?.[area] || [];
        for (const manager of managers) {
            if (!manager.assigned || !manager.ability_state?.active || manager.ability_state.expires_at <= now) {
                continue;
            }

            const ability = getManagerAbilityInfo(manager);
            const areaLabel = formatAreaLabel(area);
            const tierLabel = area === 'shaft' && manager.assigned_tier ? `Tier ${manager.assigned_tier}` : null;
            const groupKey = area === 'shaft' && ability.type !== 'income_multiplier'
                ? `${area}:${ability.type}`
                : `${area}:${ability.type}:${manager.assigned_tier || 'all'}`;

            if (!groupedAbilities.has(groupKey)) {
                groupedAbilities.set(groupKey, {
                    area,
                    areaLabel,
                    abilityName: ability.name,
                    type: ability.type,
                    tiers: new Set(),
                    values: []
                });
            }

            const groupedAbility = groupedAbilities.get(groupKey);
            if (tierLabel) {
                groupedAbility.tiers.add(tierLabel);
            }
            groupedAbility.values.push(Number(ability.valueX || 1));
        }
    });

    if (groupedAbilities.size === 0) {
        return 'No active effects';
    }

    return Array.from(groupedAbilities.values()).map(group => {
        if (group.area === 'shaft' && group.type !== 'income_multiplier') {
            const tierSummary = group.tiers.size > 0 ? ` (${Array.from(group.tiers).join(', ')})` : '';
            return `${group.areaLabel} ${group.abilityName}${tierSummary}`;
        }

        if (group.type === 'income_multiplier') {
            const totalMultiplier = group.values.reduce((total, value) => total * value, 1);
            const tierSummary = group.tiers.size > 0 ? ` (${Array.from(group.tiers).join(', ')})` : '';
            return `${group.areaLabel} ${group.abilityName}: ${totalMultiplier.toFixed(2)}x${tierSummary}`;
        }

        const peakValue = group.values.reduce((maxValue, value) => Math.max(maxValue, value), 1);
        const tierSummary = group.tiers.size > 0 ? ` (${Array.from(group.tiers).join(', ')})` : '';
        return `${group.areaLabel} ${group.abilityName}: ${peakValue.toFixed(2)}x${tierSummary}`;
    }).join('\n');
}

/**
 * Check if a manager is assigned to a specific area
 * @param {Object} currentMine - Current mine data
 * @param {string} area - Area name ('shaft', 'elevator', 'warehouse')
 * @returns {boolean} - True if a manager is assigned to the area
 */
export function isManagerAssigned(currentMine, area) {
    if (!currentMine?.managers?.[area]) return false;
    return currentMine.managers[area].some(m => m.assigned);
}

/**
 * Check if a specific shaft tier has a manager assigned
 * @param {Object} currentMine - Current mine data
 * @param {number} tier - Shaft tier number
 * @returns {boolean} - True if the tier has an assigned manager
 */
export function isShaftTierManaged(currentMine, tier) {
    if (!currentMine?.managers?.shaft) return false;
    return currentMine.managers.shaft.some(m => m.assigned && m.assigned_tier === tier);
}

/**
 * Get all shaft tiers that have assigned managers
 * @param {Object} currentMine - Current mine data
 * @returns {number[]} - Array of tier numbers with managers
 */
export function getManagedShaftTiers(currentMine) {
    if (!currentMine?.managers?.shaft) return [];
    return currentMine.managers.shaft
        .filter(m => m.assigned && m.assigned_tier)
        .map(m => m.assigned_tier);
}

/**
 * Get the manager automation status for all areas
 * @param {Object} currentMine - Current mine data
 * @returns {Object} - Status of each area and overall automation
 */
export function getManagerAutomationStatus(currentMine) {
    const shaft = isManagerAssigned(currentMine, 'shaft');
    const elevator = isManagerAssigned(currentMine, 'elevator');
    const warehouse = isManagerAssigned(currentMine, 'warehouse');
    
    return {
        shaft,
        elevator,
        warehouse,
        fullyAutomated: shaft && elevator && warehouse,
        partiallyAutomated: shaft || elevator || warehouse,
        areasAutomated: ['shaft', 'elevator', 'warehouse'].filter(area => 
            isManagerAssigned(currentMine, area)
        )
    };
}

/**
 * Get formatted ability description for a manager
 * @param {Object} manager - Manager object with effect_id, value_x, active_time
 * @returns {string} - Formatted description
 */
export function getAbilityDescription(manager) {
    const effectId = manager.effect_id || manager.EffectID;
    const ability = getAbilityByEffectId(effectId);
    
    if (!ability) {
        return 'Unknown Ability';
    }
    
    const valueX = manager.value_x || manager.ValueX || 1;
    const activeTime = manager.active_time || manager.ActiveTime || 60;
    
    return ability.description
        .replace('{valueX}', valueX)
        .replace('{activeTime}', activeTime);
}

/**
 * Get full ability info for a manager
 * @param {Object} manager - Manager object
 * @returns {Object} - Full ability info
 */
export function getManagerAbilityInfo(manager) {
    const effectId = manager.effect_id || manager.EffectID;
    const ability = getAbilityByEffectId(effectId);
    
    if (!ability) {
        return {
            name: 'Unknown',
            description: 'No ability data available',
            type: 'none',
            target: 'none',
            cooldown: manager.cooldown || manager.Cooldown || 300,
            activeTime: manager.active_time || manager.ActiveTime || 60,
            valueX: manager.value_x || manager.ValueX || 1
        };
    }
    
    return {
        name: ability.name,
        description: getAbilityDescription(manager),
        rawDescription: ability.description,
        type: ability.type,
        target: ability.target,
        cooldown: manager.cooldown || manager.Cooldown || 300,
        activeTime: manager.active_time || manager.ActiveTime || 60,
        valueX: manager.value_x || manager.ValueX || 1
    };
}

/**
 * Find manager data by ID from the config
 * @param {number} managerId - The manager ID
 * @returns {Object|null} - Manager data from config
 */
export function getManagerConfig(managerId) {
    return managerData.find(m => m.ManagerID === parseInt(managerId, 10)) || null;
}

/**
 * Check if manager ability is available (not on cooldown)
 * @param {Object} manager - Manager with ability_state
 * @returns {boolean} - True if ability is available
 */
export function isAbilityAvailable(manager) {
    if (!manager.ability_state) return true;
    
    const now = Date.now();
    const lastUsed = manager.ability_state.last_used || 0;
    const cooldown = (manager.cooldown || manager.Cooldown || 300) * 1000;
    
    return now >= lastUsed + cooldown;
}

/**
 * Get remaining cooldown time in seconds
 * @param {Object} manager - Manager with ability_state
 * @returns {number} - Seconds remaining (0 if ready)
 */
export function getAbilityCooldownRemaining(manager) {
    if (!manager.ability_state || !manager.ability_state.last_used) return 0;
    
    const now = Date.now();
    const lastUsed = manager.ability_state.last_used;
    const cooldown = (manager.cooldown || manager.Cooldown || 300) * 1000;
    const remaining = Math.ceil((lastUsed + cooldown - now) / 1000);
    
    return Math.max(0, remaining);
}

/**
 * Format ability state for display
 * @param {Object} manager - Manager object
 * @returns {string} - Formatted status
 */
export function formatAbilityStatus(manager) {
    const ability = getManagerAbilityInfo(manager);
    const cooldownRemaining = getAbilityCooldownRemaining(manager);
    
    if (cooldownRemaining > 0) {
        const minutes = Math.floor(cooldownRemaining / 60);
        const seconds = cooldownRemaining % 60;
        return `⏳ ${ability.name} (Cooldown: ${minutes}m ${seconds}s)`;
    }
    
    if (manager.ability_state?.active) {
        const remaining = Math.ceil((manager.ability_state.expires_at - Date.now()) / 1000);
        return `✨ ${ability.name} (Active: ${remaining}s remaining)`;
    }
    
    return `✅ ${ability.name} (Ready)`;
}

/**
 * Activate a manager's ability
 * @param {Object} manager - Manager object
 * @returns {Object} - Updated ability state
 */
export function activateAbility(manager) {
    const now = Date.now();
    const activeTime = (manager.active_time || manager.ActiveTime || 60) * 1000;
    
    return {
        active: true,
        activated_at: now,
        expires_at: now + activeTime,
        last_used: now,
        effect_id: manager.effect_id || manager.EffectID,
        value_x: manager.value_x || manager.ValueX
    };
}

/**
 * Deactivate a manager's ability
 * @param {Object} manager - Manager object
 * @returns {Object|null} - Updated ability state
 */
export function deactivateAbility(manager) {
    if (!manager.ability_state) return null;
    
    return {
        ...manager.ability_state,
        active: false,
        activated_at: null,
        expires_at: null
    };
}

/**
 * Get all managers with abilities in a specific area
 * @param {Object} currentMine - Current mine data
 * @param {string} area - Area name (shaft, elevator, warehouse)
 * @returns {Array} - Managers with ability info
 */
export function getManagersWithAbilities(currentMine, area) {
    if (!currentMine.managers || !currentMine.managers[area]) return [];
    
    return currentMine.managers[area].map(manager => ({
        ...manager,
        ability_info: getManagerAbilityInfo(manager),
        ability_status: formatAbilityStatus(manager)
    }));
}

export default {
    getAbilityByEffectId,
    getAbilityDescription,
    getManagerAbilityInfo,
    getManagerConfig,
    isAbilityAvailable,
    getAbilityCooldownRemaining,
    formatAbilityStatus,
    activateAbility,
    deactivateAbility,
    getManagersWithAbilities,
    getActiveEffects,
    applyIncomeMultiplier,
    applyShaftIncomeBeam,
    applyElevatorIncomeBeam,
    applySpeedBoost,
    applyCapacityBoost,
    applyMiningSpeedBoost,
    applyLoadingSpeedBoost,
    applyCostReduction,
    formatActiveEffects,
    formatAbilityAllEffects,
    formatAreaLabel,
    getMineWideIncomeMultiplier,
    getActiveAreaAbilities,
    formatActiveAreaAbilities,
    ABILITY_EFFECTS,
    isManagerAssigned,
    isShaftTierManaged,
    getManagedShaftTiers,
    getManagerAutomationStatus
};
