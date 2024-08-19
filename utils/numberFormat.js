module.exports = function numberFormat(num) {
    const suffixes = ['K', 'M', 'B', 'T']; // Base suffixes for thousands, millions, billions, trillions

    if (num < 1e3) return num.toFixed(3);

    // Determine the scale for base suffixes
    let tier = Math.log10(num) / 3 | 0;
    if (tier < suffixes.length) {
        const suffix = suffixes[tier];
        const scale = Math.pow(10, tier * 3);
        const scaled = num / scale;
        return scaled.toFixed(3) + suffix;
    }

    // For large numbers beyond trillion, use alphabetical suffixes
    const base = 26;
    tier = Math.log10(num) / 3 | 0;
    const alphabetSuffix = (n) => {
        let str = '';
        while (n >= 0) {
            str = String.fromCharCode((n % base) + 97) + str;
            n = Math.floor(n / base) - 1;
        }
        return str;
    };

    // Calculate the appropriate suffix
    const suffixIndex = tier - suffixes.length; // Offset by the length of base suffixes
    const suffix = alphabetSuffix(suffixIndex);
    const scale = Math.pow(10, (suffixes.length + suffixIndex) * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};
