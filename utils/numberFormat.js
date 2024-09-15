module.exports = function numberFormat(num) {
    const suffixes = ['K', 'M', 'B', 'T']; // Base suffixes for thousands to trillions
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'; // Alphabet for suffix generation

    // Handle numbers less than 1,000
    if (num < 1000) return num.toFixed(3);

    // Determine the tier index based on the magnitude of the number
    let tier = Math.floor(Math.log10(num) / 3) - 1;

    // Function to generate the alphabetic suffix after T
    const generateAlphabetSuffix = (tier) => {
        tier -= 4; // Start from where 'T' ends

        // Determine the prefix (e.g., 'a', 'b', 'c', etc.)
        let prefixIndex = Math.floor(tier / alphabet.length); // 'a', 'b', 'c'
        let secondLetterIndex = tier % alphabet.length; // 'aa', 'ab', 'ac', etc.

        // Construct the suffix
        const prefix = alphabet[prefixIndex]; // 'a', 'b', 'c', etc.
        const suffix = prefix + alphabet[secondLetterIndex]; // 'aa', 'ab', 'ac', etc.

        return suffix;
    };

    // Handle tiers beyond 'T'
    if (tier >= suffixes.length) {
        const suffix = generateAlphabetSuffix(tier);

        // Calculate the correct scale for large numbers
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