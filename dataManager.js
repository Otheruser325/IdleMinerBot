const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');
const mineRegions = require('./config/mineRegions.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://idleminerapi-default-rtdb.firebaseio.com/'
});

const db = admin.database(); // Use .database() for Realtime Database

// User-related functions

// Initialize a new user in Realtime Database
async function initializeUser(userId, username) {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
        await userRef.set({
            username: username || '',
			userId: userId || '',
            cash: 10,
            iceCash: 10,
            fireCash: 10,
            superCash: 0,
            currentMine: 'Coal Mine',
            streak: 0,
            lastDaily: 0,
            mines: [
                {
                    PrestigeCount: 0,
                    MineNumber: 1,
                    MineName: "Coal Mine",
                    Factor: 1,
                    mineshafts: [],
                    elevator: [],
                    warehouse: [],
                    managers: {
                        shaft: [],
                        elevator: [],
                        warehouse: []
                    },
                    barriers: mineRegions.map((region, index) => ({
                        ...region,
                        unlocked: index === 0
                    }))
                }
            ],
            activeBoosts: [],
            idleCash: 0,
            idleIceCash: 0,
            idleFireCash: 0,
            inventory: {}
        });
    }
}

// Get user by ID from Realtime Database
async function getUser(userId) {
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    return snapshot.exists() ? snapshot.val() : null;
}

// Update user data in Realtime Database
async function updateUser(userId, updates) {
    const userRef = db.ref(`users/${userId}`);
    await userRef.update(updates);
}

// Get all users from Realtime Database
async function getAllUsers() {
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    return snapshot.exists() ? snapshot.val() : {};
}

// Guild-related functions

// Initialize a new guild in Realtime Database
async function initializeGuild(guildId, guildName, ownerId) {
    const guildRef = db.ref(`guilds/${guildId}`);
    const snapshot = await guildRef.once('value');

    if (!snapshot.exists()) {
        await guildRef.set({
            name: guildName || '',
            ownerId: ownerId || '',
            members: [] // Ensure members is initialized as an empty array
        });
    }
}

// Get guild by ID from Realtime Database
async function getGuild(guildId) {
    const guildRef = db.ref(`guilds/${guildId}`);
    const snapshot = await guildRef.once('value');
    return snapshot.exists() ? snapshot.val() : null;
}

// Update guild data in Realtime Database
async function updateGuild(guildId, updates) {
    const guildRef = db.ref(`guilds/${guildId}`);
    await guildRef.update(updates);
}

// Get all guilds from Realtime Database
async function getAllGuilds() {
    const guildsRef = db.ref('guilds');
    const snapshot = await guildsRef.once('value');
    return snapshot.exists() ? snapshot.val() : {};
}

// Guild-user related functions

// Add or update a user in a specific guild in Realtime Database
async function addUserToGuild(guildId, userId) {
    const guildRef = db.ref(`guilds/${guildId}`);
    const snapshot = await guildRef.once('value');

    if (snapshot.exists()) {
        const guildData = snapshot.val();
        if (!guildData.members.includes(userId)) {
            guildData.members.push(userId);
            await guildRef.update({ members: guildData.members });
        }
    }
}

// Get a user from a specific guild from Realtime Database
const getUserInGuild = async (guildId, userId) => {
    try {
        const guild = await db.ref(`guilds/${guildId}`).once('value');
        if (!guild.exists()) return null;

        const guildData = guild.val();
        if (!guildData || !guildData.users) return null;

        const userData = guildData.users[userId];
        return userData ? { ...userData, userId } : null;
    } catch (error) {
        console.error(`Error fetching user ${userId} in guild ${guildId}:`, error);
        return null;
    }
};

// Get users in a specific guild from Realtime Database
async function getUsersInGuild(guildId) {
    const guild = await getGuild(guildId);
    if (guild && guild.members) {
        const userPromises = guild.members.map(userId => getUser(userId));
        const users = await Promise.all(userPromises);
        return users.filter(user => user); // Filter out null users
    } else {
        return [];
    }
}

// Get all users in a specific guild (alternative implementation)
async function getAllUsersInGuild(guildId) {
    return getUsersInGuild(guildId);
}

module.exports = {
    initializeUser,
    getUser,
    updateUser,
    getAllUsers,
    initializeGuild,
    getGuild,
    updateGuild,
    getAllGuilds,
    addUserToGuild,
    getUserInGuild,
    getUsersInGuild,
    getAllUsersInGuild
};
