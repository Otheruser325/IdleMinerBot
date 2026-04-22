import managerCostsJson from '../config/managerCosts.json' with { type: 'json' };
import { getCashField, getCashLabelByField } from './continentLooker.js';
import { getMineNumber } from './mineLooker.js';

const managerCosts = managerCostsJson.managerCosts || [];

function getManagerDisplayId(manager) {
    const baseId = Number(manager?.manager_id ?? manager?.ManagerID ?? 0);
    const genderId = Number(manager?.gender_id ?? manager?.GenderId ?? 0);
    return genderId === 1 ? baseId + 100000 : baseId;
}

function getNormalizedManagerName(manager) {
    return String(manager?.name ?? manager?.Name ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getManagerSignature(manager) {
    return `${getManagerDisplayId(manager)}|${getNormalizedManagerName(manager)}`;
}

function getAreaCostField(area) {
    return area.charAt(0).toUpperCase() + area.slice(1);
}

function getDuplicateCompensationCost(area, managerIndex) {
    const costRow = managerCosts.find(entry => entry.AmountManagersBought === managerIndex);
    return Number(costRow?.[getAreaCostField(area)] || 0);
}

function getManagerWalletField(currentMine) {
    const mineNumber = parseInt(currentMine?.mine_number, 10) || getMineNumber(currentMine?.mine_name);
    return getCashField(mineNumber);
}

export function purgeDuplicateManagersFromMine(user, currentMine) {
    if (!currentMine?.managers) {
        return null;
    }

    const compensationEvents = [];
    const walletField = getManagerWalletField(currentMine);
    const walletLabel = getCashLabelByField(walletField);

    ['shaft', 'elevator', 'warehouse'].forEach(area => {
        const areaManagers = Array.isArray(currentMine.managers[area]) ? currentMine.managers[area] : [];
        const seenSignatures = new Set();
        const retainedManagers = [];

        areaManagers.forEach((manager, index) => {
            const signature = getManagerSignature(manager);
            if (seenSignatures.has(signature)) {
                const baseCost = getDuplicateCompensationCost(area, index);
                const compensation = Math.floor(baseCost * 0.5);
                if (compensation > 0) {
                    user[walletField] = (user[walletField] || 0) + compensation;
                }

                compensationEvents.push({
                    area,
                    managerName: manager.name,
                    managerDisplayId: getManagerDisplayId(manager),
                    compensation,
                    walletLabel
                });
                return;
            }

            seenSignatures.add(signature);
            retainedManagers.push(manager);
        });

        currentMine.managers[area] = retainedManagers;
    });

    if (compensationEvents.length === 0) {
        return null;
    }

    return {
        walletField,
        walletLabel,
        compensationEvents
    };
}

export default {
    purgeDuplicateManagersFromMine
};
