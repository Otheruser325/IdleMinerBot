import mineFactorsJson from '../config/mineFactors.json' with { type: 'json' };

const mineFactors = mineFactorsJson.mines;

export default function getMineFactor(mineName) {
    const mine = mineFactors.find(m => m.MineName === mineName);
    return mine ? mine.Factor : 1;
}
