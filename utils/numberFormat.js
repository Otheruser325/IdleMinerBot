export default function numberFormat(num) {
    const suffixes = ['K', 'M', 'B', 'T'];
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';

    if (num < 1000) return num.toFixed(3);

    let tier = Math.floor(Math.log10(num) / 3) - 1;

    const generateAlphabetSuffix = (tier) => {
        tier -= 4;

        let prefixIndex = Math.floor(tier / alphabet.length);
        let secondLetterIndex = tier % alphabet.length;

        const prefix = alphabet[prefixIndex];
        const suffix = prefix + alphabet[secondLetterIndex];

        return suffix;
    };

    if (tier >= suffixes.length) {
        const suffix = generateAlphabetSuffix(tier);

        const scale = Math.pow(10, (tier + 1) * 3);
        const scaled = num / scale;

        return scaled.toFixed(3) + suffix;
    }

    const suffix = suffixes[tier];
    const scale = Math.pow(10, (tier + 1) * 3);
    const scaled = num / scale;

    return scaled.toFixed(3) + suffix;
}