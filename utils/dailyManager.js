function calculateDailyReward(user) {
    const baseCash = 30; // Base reward
    const streakBonus = 5; // Bonus per streak
    const streakMultiplier = Math.max(user.streak, 0); // Ensure streak is non-negative
    return baseCash + (streakMultiplier * streakBonus);
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
