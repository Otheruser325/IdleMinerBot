import mineFactorsJson from '../config/mineFactors.json' with { type: 'json' };
import { getMineNumber } from './mineLooker.js';

const mineFactors = mineFactorsJson.mines;

function resolveMineNumber(mineInput) {
    if (mineInput && typeof mineInput === 'object') {
        const explicit = parseInt(mineInput.mine_number, 10);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        return getMineNumber(mineInput.mine_name);
    }

    return parseInt(mineInput, 10) || getMineNumber(mineInput);
}

function resolvePrestigeCount(mineInput, prestigeCount) {
    if (mineInput && typeof mineInput === 'object') {
        const embedded = Number(mineInput.prestige_count ?? mineInput.prestigeCount);
        if (Number.isFinite(embedded)) return Math.max(0, Math.floor(embedded));
    }

    const numeric = Number(prestigeCount);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

export default function getMineFactor(mineInput, prestigeCount = 0) {
    const mineNumber = resolveMineNumber(mineInput);
    const prestige = resolvePrestigeCount(mineInput, prestigeCount);
    const mine = mineFactors.find(m =>
        m.MineNumber === mineNumber &&
        (m.PrestigeCount || 0) === prestige
    );
    return mine ? mine.Factor : 1;
}
