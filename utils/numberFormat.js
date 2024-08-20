module.exports = function numberFormat(num) {
    const baseSuffixes = ['K', 'M', 'B', 'T']; // Suffixes for thousands, millions, billions, trillions
    const base = 26; // Base for alphabetic suffixes

    // For numbers less than 1000, return the number as is with 3 decimal places
    if (num < 1e3) return num.toFixed(3);

    // Determine the tier and corresponding suffix
    let tier = Math.floor(Math.log10(num) / 3); // Calculate the tier index

    if (tier < baseSuffixes.length) {
        // Use base suffixes for thousands to trillions
        const suffix = baseSuffixes[tier];
        const scale = Math.pow(10, tier * 3);
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
    const suffixIndex = tier - baseSuffixes.length; // Offset by the length of base suffixes
    const suffix = alphabetSuffix(suffixIndex);
    const scale = Math.pow(10, (baseSuffixes.length + suffixIndex) * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};
