import miscJson from '../config/misc.json' with { type: 'json' };

const miscEntries = miscJson.misc || [];

function getMiscEntry(key) {
    return miscEntries.find(entry => entry.key === key) || null;
}

export function getMiscValue(key, fallback = 0) {
    const entry = getMiscEntry(key);
    if (!entry) {
        return fallback;
    }

    if (typeof entry.valueDouble === 'number' && entry.valueDouble !== 0) {
        return entry.valueDouble;
    }

    return entry.value ?? fallback;
}

export function getMaxCountTiers() {
    return Number(getMiscValue('MaxCountTiers', 30));
}

export function getMaxCorridorLevel() {
    return Number(getMiscValue('MaxCorridorLevel', 2000));
}

export function getMaxElevatorLevel() {
    return Number(getMiscValue('MaxElevatorLevel', 5000));
}

export function getMaxGroundLevel() {
    return Number(getMiscValue('MaxGroundLevel', 5000));
}

export default {
    getMiscValue,
    getMaxCountTiers,
    getMaxCorridorLevel,
    getMaxElevatorLevel,
    getMaxGroundLevel
};
