import mineFactorsJson from '../config/mineFactors.json' with { type: 'json' };
import { getMineNumber } from './mineLooker.js';

const mineFactors = mineFactorsJson.mines;

export default function getMineFactor(mineInput, prestigeCount = 0) {
    const mineNumber = parseInt(mineInput, 10) || getMineNumber(mineInput);
    const mine = mineFactors.find(m =>
        m.MineNumber === mineNumber &&
        (m.PrestigeCount || 0) === prestigeCount
    );
    return mine ? mine.Factor : 1;
}
