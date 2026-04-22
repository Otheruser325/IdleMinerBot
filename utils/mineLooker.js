/**
 * Mine Looker Utility
 * Maps mine numbers to standardized mine names and supports alias lookups.
 */

const MINE_NAMES = {
    1: 'Coal Mine',
    2: 'Gold Mine',
    3: 'Ruby Mine',
    4: 'Diamond Mine',
    5: 'Emerald Mine',
    6: 'Amethyst Mine',
    7: 'Moonstone Mine',
    8: 'Sapphire Mine',
    9: 'Crystal Mine',
    10: 'Jade Mine',
    11: 'Amber Mine',
    12: 'Sunstone Mine',
    13: 'Topaz Mine',
    14: 'Platinum Mine',
    15: 'Obsidian Mine',
    16: 'Heliodor Mine',
    17: 'Realgar Mine',
    18: 'Alexandrite Mine',
    19: 'Celestine Mine',
    20: 'Titanite Mine'
};

function normalizeLookupValue(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildMineEntry(mineNumber, mineName) {
    const baseName = mineName.replace(/\s+mine$/i, '');
    const aliases = new Set([
        normalizeLookupValue(mineName),
        normalizeLookupValue(baseName),
        normalizeLookupValue(`mine ${mineNumber}`),
        normalizeLookupValue(mineNumber)
    ]);

    return {
        mineNumber,
        mineName,
        aliases
    };
}

const MINE_ENTRIES = Object.entries(MINE_NAMES).map(([mineNumber, mineName]) =>
    buildMineEntry(parseInt(mineNumber, 10), mineName)
);

export function getMineName(mineNumber) {
    const normalizedNum = parseInt(mineNumber, 10);
    return MINE_NAMES[normalizedNum] || `Mine ${normalizedNum}`;
}

export function getMinesByContinent(continentName) {
    const ranges = {
        'Start Continent': [1, 2, 3, 4, 5],
        'Ice Continent': [6, 7, 8, 9, 10],
        'Fire Continent': [11, 12, 13, 14, 15],
        'Dawn Continent': [16, 17, 18, 19, 20]
    };

    const mineNumbers = ranges[continentName] || [];
    return mineNumbers.map(num => MINE_NAMES[num]);
}

export function getMineNumber(mineInput) {
    const resolved = resolveMine(mineInput);
    return resolved ? resolved.mineNumber : null;
}

export function resolveMine(mineInput) {
    const normalizedInput = normalizeLookupValue(mineInput);
    if (!normalizedInput) {
        return null;
    }

    return MINE_ENTRIES.find(entry => entry.aliases.has(normalizedInput)) || null;
}

export default {
    getMineName,
    getMinesByContinent,
    getMineNumber,
    resolveMine
};
