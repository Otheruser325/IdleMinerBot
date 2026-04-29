function normalizeAmountToken(token) {
    return String(token || '').trim().toUpperCase();
}

export function parsePurchaseAmount(token, options = {}) {
    const {
        defaultAmount = 1,
        allowedAmounts = [1, 10, 50],
        allowMax = true
    } = options;

    if (token === undefined || token === null || token === '') {
        return {
            ok: true,
            isMax: false,
            amount: defaultAmount,
            label: `x${defaultAmount}`
        };
    }

    const normalized = normalizeAmountToken(token);
    if (allowMax && (normalized === 'MAX' || normalized === '-1')) {
        return {
            ok: true,
            isMax: true,
            amount: Infinity,
            label: normalized === '-1' ? 'MAX (-1)' : 'MAX'
        };
    }

    const numericAmount = parseInt(normalized, 10);
    if (!Number.isInteger(numericAmount) || !allowedAmounts.includes(numericAmount)) {
        return {
            ok: false,
            message: `Please provide a valid buy amount: ${allowedAmounts.join(', ')}${allowMax ? ', -1 (MAX), or MAX' : ''}.`
        };
    }

    return {
        ok: true,
        isMax: false,
        amount: numericAmount,
        label: `x${numericAmount}`
    };
}

export default {
    parsePurchaseAmount
};
