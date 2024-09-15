module.exports = function numberFormat(num) {
    const suffixes = ['K', 'M', 'B', 'T']; // Base suffixes for thousands to trillions
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const base = 1000;

    // Handle numbers less than 1,000
    if (num < base) return num.toFixed(3);

    // Determine the tier index based on the magnitude of the number
    let tier = Math.floor(Math.log10(num) / 3) - 1;

    // Handle tiers beyond 'T' by generating alphabetical suffixes
    const generateAlphabetSuffix = (tier) => {
        tier -= 4; // Adjust for the base suffixes already handled (K, M, B, T)

        // Generate suffixes starting from 'aa', 'ab', ..., 'zz'
        let suffix = '';
        for (let i = 0; i <= Math.floor(tier / alphabet.length); i++) {
            suffix += alphabet[tier % alphabet.length];
            tier = Math.floor(tier / alphabet.length) - 1;
        }
        return suffix;
    };

    // Handle numbers greater than trillions
    if (tier >= suffixes.length) {
        const suffix = generateAlphabetSuffix(tier);

        // Calculate the correct scale and return formatted number with custom suffix
        const scale = Math.pow(10, (tier + 1) * 3);
        const scaled = num / scale;

        return scaled.toFixed(3) + suffix;
    }

    // Use base suffixes for numbers from thousands to trillions
    const suffix = suffixes[tier];
    const scale = Math.pow(10, (tier + 1) * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};