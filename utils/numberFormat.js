module.exports = function numberFormat(num) {
    const suffixes = ['', 'K', 'M', 'B', 'T']; // Base suffixes for thousands to trillions
    const base = 26; // Base for alphabetic suffixes (a-z)

    // Handle numbers less than 1,000
    if (num < 1e3) return num.toFixed(3);

    // Determine the tier index based on the magnitude of the number
    let tier = Math.floor(Math.log10(num) / 3);

    // Alphabetical suffix handling
    if (tier >= suffixes.length) {
        const alphabetSuffix = (index) => {
            const text = 'abcdefghijklmnopqrstuvwxyz';
            let suffix = '';
            let baseOffset = index - (suffixes.length - 1);
            let prefixLevel = Math.floor(baseOffset / text.length); // Determine the letter group (a, b, c...)
            let letterIndex = baseOffset % text.length; // Determine the letter within the group

            // Construct the suffix
            suffix = String.fromCharCode(97 + prefixLevel) + text[letterIndex];
            return suffix;
        };

        // Calculate how far beyond the basic suffixes we are
        const alphabeticIndex = tier - suffixes.length + 1;
        const suffix = alphabetSuffix(alphabeticIndex);

        // Scale the number accordingly
        const scale = Math.pow(10, (suffixes.length + alphabeticIndex - 1) * 3);
        const scaled = num / scale;

        return scaled.toFixed(3) + suffix;
    }

    // Use base suffixes for numbers up to trillions
    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
};