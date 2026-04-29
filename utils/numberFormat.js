const SHORT_SUFFIXES = ['K', 'M', 'B', 'T'];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

const ILLION_SHORT_SCALE = [
    { power: 3, short: 'K', long: 'Thousand' },
    { power: 6, short: 'M', long: 'Million' },
    { power: 9, short: 'B', long: 'Billion' },
    { power: 12, short: 'T', long: 'Trillion' },
    { power: 15, short: 'Qa', long: 'Quadrillion' },
    { power: 18, short: 'Qi', long: 'Quintillion' },
    { power: 21, short: 'Sx', long: 'Sextillion' },
    { power: 24, short: 'Sp', long: 'Septillion' },
    { power: 27, short: 'Oc', long: 'Octillion' },
    { power: 30, short: 'No', long: 'Nonillion' },
    { power: 33, short: 'Dc', long: 'Decillion' },
    { power: 36, short: 'Ud', long: 'Undecillion' },
    { power: 39, short: 'Dd', long: 'Duodecillion' },
    { power: 42, short: 'Td', long: 'Tredecillion' },
    { power: 45, short: 'Qad', long: 'Quattuordecillion' },
    { power: 48, short: 'Qid', long: 'Quindecillion' },
    { power: 51, short: 'Sxd', long: 'Sexdecillion' },
    { power: 54, short: 'Spd', long: 'Septendecillion' },
    { power: 57, short: 'Ocd', long: 'Octodecillion' },
    { power: 60, short: 'Nod', long: 'Novemdecillion' },
    { power: 63, short: 'Vg', long: 'Vigintillion' },
    { power: 66, short: 'Uvg', long: 'Unvigintillion' },
    { power: 69, short: 'Dvg', long: 'Duovigintillion' },
    { power: 72, short: 'Tvg', long: 'Tresvigintillion' },
    { power: 75, short: 'Qavg', long: 'Quattuorvigintillion' },
    { power: 78, short: 'Qivg', long: 'Quinvigintillion' },
    { power: 81, short: 'Sxvg', long: 'Sexvigintillion' },
    { power: 84, short: 'Spvg', long: 'Septenvigintillion' },
    { power: 87, short: 'Ocvg', long: 'Octovigintillion' },
    { power: 90, short: 'Novg', long: 'Novemvigintillion' },
    { power: 93, short: 'Tg', long: 'Trigintillion' }
];

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatScientific(value, decimals = 3) {
    return value.toExponential(decimals).replace('e+', 'e');
}

function formatEngineering(value, decimals = 3) {
    if (value === 0) return (0).toFixed(decimals);
    const exp = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
    const scaled = value / (10 ** exp);
    return `${scaled.toFixed(decimals)}e${exp}`;
}

function formatAlphabetical(value, decimals = 3) {
    const sign = value < 0 ? '-' : '';
    const absoluteValue = Math.abs(value);
    if (absoluteValue < 1000) return `${sign}${absoluteValue.toFixed(decimals)}`;

    const tier = Math.floor(Math.log10(absoluteValue) / 3) - 1;
    if (tier < SHORT_SUFFIXES.length) {
        const scale = 10 ** ((tier + 1) * 3);
        return `${sign}${(absoluteValue / scale).toFixed(decimals)}${SHORT_SUFFIXES[tier]}`;
    }

    const alphaTier = tier - SHORT_SUFFIXES.length;
    const prefixIndex = Math.floor(alphaTier / ALPHABET.length);
    const secondIndex = alphaTier % ALPHABET.length;
    const prefix = ALPHABET[prefixIndex] || 'z';
    const suffix = `${prefix}${ALPHABET[secondIndex]}`;
    const scale = 10 ** ((tier + 1) * 3);
    return `${sign}${(absoluteValue / scale).toFixed(decimals)}${suffix}`;
}

export function getIllionInfo(num) {
    const value = toFiniteNumber(num);
    const absoluteValue = Math.abs(value);
    let result = null;
    for (let i = ILLION_SHORT_SCALE.length - 1; i >= 0; i--) {
        const entry = ILLION_SHORT_SCALE[i];
        if (absoluteValue >= (10 ** entry.power)) {
            result = entry;
            break;
        }
    }

    if (!result) {
        return { short: '', long: 'Base', power: 0 };
    }

    return result;
}

export function formatWithIllionSuffix(num, decimals = 3) {
    const value = toFiniteNumber(num);
    const sign = value < 0 ? '-' : '';
    const absoluteValue = Math.abs(value);
    const info = getIllionInfo(value);

    if (!info.power) {
        return `${sign}${absoluteValue.toFixed(decimals)}`;
    }

    const scaled = absoluteValue / (10 ** info.power);
    return `${sign}${scaled.toFixed(decimals)}${info.short}`;
}

export function numberFormatAdvanced(num, options = {}) {
    const { mode = 'alphabetical', decimals = 3 } = options;
    const value = toFiniteNumber(num);

    if (mode === 'scientific') return formatScientific(value, decimals);
    if (mode === 'engineering') return formatEngineering(value, decimals);
    if (mode === 'illion') return formatWithIllionSuffix(value, decimals);

    return formatAlphabetical(value, decimals);
}

export default function numberFormat(num) {
    return numberFormatAdvanced(num, { mode: 'illion', decimals: 3 });
}

export function formatAlphabeticalNumber(num, decimals = 3) {
    return numberFormatAdvanced(num, { mode: 'alphabetical', decimals });
}
