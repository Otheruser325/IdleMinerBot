function calculateDailyReward(user) {
    const baseCoins = 1000;
    const streakMultiplier = 0.1 * Math.max(user.streak - 1, 0);
    return Math.floor(baseCoins * (1 + streakMultiplier));
}

function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours} hours and ${minutes} minutes`;
}

module.exports = {
  calculateDailyReward,
  formatTime
}
