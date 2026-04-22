import mineDifficultyJson from '../config/mineDifficulty.json' with { type: 'json' };
import { getMineNumber } from './mineLooker.js';

const difficultyEntries = mineDifficultyJson.mineDifficulty || [];

function resolveMineNumber(mineInput) {
    if (typeof mineInput === 'object' && mineInput) {
        return parseInt(mineInput.mine_number, 10) || getMineNumber(mineInput.mine_name);
    }

    return parseInt(mineInput, 10) || getMineNumber(mineInput);
}

export function getMineDifficultyEntry(mineInput) {
    const mineNumber = resolveMineNumber(mineInput);
    return difficultyEntries.find(entry => entry.MineId === mineNumber) || null;
}

export function getMineDifficultyMultiplier(mineInput) {
    return getMineDifficultyEntry(mineInput)?.Difficulty || 1;
}

export function scaleMineCost(baseCost, mineInput, options = {}) {
    const numericCost = Number(baseCost || 0);
    if (!Number.isFinite(numericCost) || numericCost <= 0) {
        return 0;
    }

    const multiplier = options.ignoreDifficulty ? 1 : getMineDifficultyMultiplier(mineInput);
    return Math.ceil(numericCost * multiplier);
}

export default {
    getMineDifficultyEntry,
    getMineDifficultyMultiplier,
    scaleMineCost
};
