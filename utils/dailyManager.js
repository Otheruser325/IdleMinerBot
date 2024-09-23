function calculateDailyReward(user) {
    const baseCash = 30; // Base reward
    const streakBonus = 5; // Bonus per streak
    const streakMultiplier = Math.max(user.streak, 0); // Ensure streak is non-negative

    let cash = baseCash + (streakMultiplier * streakBonus);

    // Triple the reward if the user is a premium member
    if (user.has_premium) {
        cash *= 3;
    }

    return cash;
}

function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours} hours and ${minutes} minutes`;
}

module.exports = {
  calculateDailyReward,
  formatTime
};