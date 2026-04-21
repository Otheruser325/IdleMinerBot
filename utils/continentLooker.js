/**
 * Continent Looker Utility
 * Maps mine numbers to continents and cash types, and normalizes old stored values.
 */

import { getMineName, getMineNumber, resolveMine } from './mineLooker.js';

function normalizeLookupValue(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const CONTINENT_RANGES = [
    {
        name: 'Start Continent',
        minMine: 1,
        maxMine: 5,
        cashType: 'cash',
        cashField: 'cash',
        cashLabel: 'Starter Cash',
        idleCashField: 'idle_cash',
        aliases: ['start continent', 'starter continent', 'start', 'starter', 'cash', 'starter cash']
    },
    {
        name: 'Ice Continent',
        minMine: 6,
        maxMine: 10,
        cashType: 'ice_cash',
        cashField: 'ice_cash',
        cashLabel: 'Ice Cash',
        idleCashField: 'idle_ice_cash',
        aliases: ['ice continent', 'ice', 'ice cash']
    },
    {
        name: 'Fire Continent',
        minMine: 11,
        maxMine: 15,
        cashType: 'fire_cash',
        cashField: 'fire_cash',
        cashLabel: 'Fire Cash',
        idleCashField: 'idle_fire_cash',
        aliases: ['fire continent', 'fire', 'fire cash']
    }
];

const CONTINENTS_WITH_INDEX = CONTINENT_RANGES.map((continent, index) => ({
    ...continent,
    index
}));

function getContinentInfo(continentNameOrObject) {
    const normalizedName = normalizeContinentName(continentNameOrObject);
    return CONTINENTS_WITH_INDEX.find(continent => continent.name === normalizedName) || null;
}

export function getContinentByMineNumber(mineNumber) {
    const normalizedNum = parseInt(mineNumber, 10);
    return CONTINENTS_WITH_INDEX.find(c => normalizedNum >= c.minMine && normalizedNum <= c.maxMine) || null;
}

export function getContinentName(mineNumber) {
    const continent = getContinentByMineNumber(mineNumber);
    return continent ? continent.name : 'Unknown Continent';
}

export function getCashType(mineNumber) {
    const continent = getContinentByMineNumber(mineNumber);
    return continent ? continent.cashType : 'cash';
}

export function getCashField(mineNumber) {
    const continent = getContinentByMineNumber(mineNumber);
    return continent ? continent.cashField : 'cash';
}

export function getIdleCashField(mineNumber) {
    const continent = getContinentByMineNumber(mineNumber);
    return continent ? continent.idleCashField : 'idle_cash';
}

export function getCashLabelByField(cashField) {
    const continent = CONTINENTS_WITH_INDEX.find(entry => entry.cashField === cashField);
    return continent ? continent.cashLabel : 'Cash';
}

export function getCashLabelForContinent(continentName) {
    return getContinentInfo(continentName)?.cashLabel || 'Cash';
}

export function getCashFieldForContinent(continentName) {
    return getContinentInfo(continentName)?.cashField || 'cash';
}

export function getPreviousContinent(continentName) {
    const continent = getContinentInfo(continentName);
    if (!continent || continent.index === 0) {
        return null;
    }

    return CONTINENTS_WITH_INDEX[continent.index - 1];
}

export function getUnlockCashFieldForContinent(continentName) {
    return getPreviousContinent(continentName)?.cashField || 'cash';
}

export function getUnlockCashLabelForContinent(continentName) {
    return getPreviousContinent(continentName)?.cashLabel || 'Cash';
}

export function normalizeContinentName(continentInput) {
    if (!continentInput) {
        return null;
    }

    if (typeof continentInput === 'object') {
        return normalizeContinentName(
            continentInput.ContinentName ||
            continentInput.continent_name ||
            continentInput.name
        );
    }

    const normalizedInput = normalizeLookupValue(continentInput);
    if (!normalizedInput) {
        return null;
    }

    const directMatch = CONTINENTS_WITH_INDEX.find(continent =>
        continent.aliases.some(alias => alias === normalizedInput) ||
        normalizeLookupValue(continent.name) === normalizedInput
    );

    if (directMatch) {
        return directMatch.name;
    }

    const resolvedMine = resolveMine(continentInput);
    if (resolvedMine) {
        return getContinentName(resolvedMine.mineNumber);
    }

    return null;
}

export function resolveContinent(continentInput) {
    const continentName = normalizeContinentName(continentInput);
    return continentName ? getContinentInfo(continentName) : null;
}

export function normalizeOwnedContinents(continents) {
    const values = Array.isArray(continents) ? continents : [];
    const normalized = values
        .map(normalizeContinentName)
        .filter(Boolean);

    if (!normalized.includes('Start Continent')) {
        normalized.unshift('Start Continent');
    }

    return [...new Set(normalized)].sort((left, right) => {
        const leftIndex = getContinentInfo(left)?.index ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = getContinentInfo(right)?.index ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
    });
}

export function userOwnsContinent(user, continentName) {
    const normalizedTarget = normalizeContinentName(continentName);
    if (!normalizedTarget) {
        return false;
    }

    return normalizeOwnedContinents(user?.continents).includes(normalizedTarget);
}

export function normalizeMineData(mine) {
    const mineNumber = parseInt(mine.mine_number, 10) || getMineNumber(mine.mine_name);
    const continent = getContinentByMineNumber(mineNumber);

    return {
        ...mine,
        mine_number: mineNumber,
        mine_name: getMineName(mineNumber),
        continent_name: continent ? continent.name : mine.continent_name
    };
}

export function getMinesForContinent(continentName) {
    const continent = getContinentInfo(continentName);
    if (!continent) {
        return [];
    }

    const mines = [];
    for (let i = continent.minMine; i <= continent.maxMine; i++) {
        mines.push(i);
    }
    return mines;
}

export default {
    getContinentByMineNumber,
    getContinentName,
    getCashType,
    getCashField,
    getCashFieldForContinent,
    getCashLabelByField,
    getCashLabelForContinent,
    getIdleCashField,
    getMinesForContinent,
    getPreviousContinent,
    getUnlockCashFieldForContinent,
    getUnlockCashLabelForContinent,
    normalizeContinentName,
    normalizeMineData,
    normalizeOwnedContinents,
    resolveContinent,
    userOwnsContinent
};
