module.exports = function numberFormat(num) {
    const suffixes = ['K', 'M', 'B', 'T']; // Suffixes for thousands, millions, billions, trillions
    const base = 26; // Base for alphabetic suffixes

    // Handle numbers less than 1,000
    if (num < 1e3) return num.toFixed(3);

    // Determine the tier index based on the magnitude of the number
    // Calculate tier, ensuring that thousands use 'K'
    let tier = Math.floor(Math.log10(num) / 3);
    
    if (num < 1e6) {
        tier = 1; // Explicitly set to use 'K' for thousands
    }

    if (tier < suffixes.length) {
        // Use base suffixes for thousands to trillions
        const suffix = suffixes[tier - 1]; // Subtract 1 to use correct suffix
        const scale = Math.pow(10, (tier - 1) * 3); // Scale for thousands
        const scaled = num / scale;
        return scaled.toFixed(3) + suffix;
    }

    // For numbers larger than trillion, use alphabetic suffixes starting from "aa"
    const alphabetSuffix = (n) => {
        let str = '';
        while (n >= 0) {
            str = String.fromCharCode((n % base) + 97) + str;
            n = Math.floor(n / base) - 1;
        }
        return str;
    };

    // Calculate the appropriate suffix for numbers larger than trillion
    const suffixIndex = tier - suffixes.length; // Offset by the length of base suffixes
    const suffix = alphabetSuffix(suffixIndex);
    const scale = Math.pow(10, (suffixes.length + suffixIndex) * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};
