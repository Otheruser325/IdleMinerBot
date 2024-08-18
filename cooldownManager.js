const cooldowns = new Map();

function setCooldown(userId, commandName, duration) {
    const key = `${userId}-${commandName}`;
    cooldowns.set(key, Date.now() + duration);
}

function isCooldownActive(userId, commandName) {
    const key = `${userId}-${commandName}`;
    if (cooldowns.has(key)) {
        const expirationTime = cooldowns.get(key);
        if (Date.now() < expirationTime) {
            return (expirationTime - Date.now()) / 1000; // return time left in seconds
        }
    }
    return 0;
}

module.exports = {
    setCooldown,
    isCooldownActive
};
