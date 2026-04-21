export function calculateDailyReward(user) {
    const baseCash = 30;
    const streakBonus = 5;
    const streakMultiplier = Math.max(user.streak, 0);

    let cash = baseCash + (streakMultiplier * streakBonus);

    if (user.has_premium) {
        cash *= 3;
    }

    return cash;
}

export function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours} hours and ${minutes} minutes`;
}