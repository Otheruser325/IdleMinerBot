const mineFactors = require('../config/mineFactors.json').mines;

module.exports = function getMineFactor(mineName) {
    const mine = mineFactors.find(m => m.MineName === mineName);
    return mine ? mine.Factor : 1; // Default to 1 if not found
}
