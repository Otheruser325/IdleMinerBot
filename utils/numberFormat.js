module.exports = function numberFormat(num) {
    const suffixes = ['', 'K', 'M', 'B', 'T']; // Suffixes for thousands, millions, billions, trillions
    const base = 26; // Base for alphabetic suffixes

    // Handle numbers less than 1,000
    if (num < 1e3) return num.toFixed(3);

    // Determine the tier index based on the magnitude of the number
    // Correctly calculate tier to handle thousands (K) separately
    let tier = Math.floor(Math.log10(num) / 3);

    if (tier >= suffixes.length) {
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
    }

    // Use base suffixes for thousands to trillions
    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};
