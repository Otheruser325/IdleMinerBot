const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.firestore();

// User-related functions

// Initialize a new user in Firestore
async function initializeUser(userId, username) {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        await userRef.set({
            username: username || '',
            vCoins: 500,
            bankBalance: 0,
            streak: 0,
            lastDaily: 0,
            location: 'Town.1',
            exp: 0,
            inventory: {},
            properties: [],
            hp: 100,
            maxHp: 100,
            stamina: 50,
            maxStamina: 50,
            equippedLeft: null,
            equippedRight: null,
            isArrested: false
        });
    }
}

// Get user by ID from Firestore
async function getUser(userId) {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
        return userDoc.data();
    } else {
        return null;
    }
}

// Update user data in Firestore
async function updateUser(userId, updates) {
    const userRef = db.collection('users').doc(userId);
    // Ensure no undefined values are included in the update
    const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    await userRef.update(sanitizedUpdates);
}

// Get all users from Firestore
async function getAllUsers() {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => doc.data());
}

// Guild-related functions

// Initialize a new guild in Firestore
async function initializeGuild(guildId, guildName, ownerId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const guildDoc = await guildRef.get();

    if (!guildDoc.exists) {
        await guildRef.set({
            name: guildName || '',
            ownerId: ownerId || '',
            members: []
        });
    }
}

// Get guild by ID from Firestore
async function getGuild(guildId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const guildDoc = await guildRef.get();

    if (guildDoc.exists) {
        return guildDoc.data();
    } else {
        return null;
    }
}

// Update guild data in Firestore
async function updateGuild(guildId, updates) {
    const guildRef = db.collection('guilds').doc(guildId);
    // Ensure no undefined values are included in the update
    const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    await guildRef.update(sanitizedUpdates);
}

// Get all guilds from Firestore
async function getAllGuilds() {
    const snapshot = await db.collection('guilds').get();
    return snapshot.docs.map(doc => doc.data());
}

// Guild-user related functions

// Add or update a user in a specific guild in Firestore
async function addUserToGuild(guildId, userId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const guildDoc = await guildRef.get();

    if (guildDoc.exists) {
        const guildData = guildDoc.data();
        if (!guildData.members.includes(userId)) {
            guildData.members.push(userId);
            await guildRef.update({ members: guildData.members });
        }
    } else {
        console.warn(`Guild ${guildId} not found in Firestore.`);
    }
}

// Get a user from a specific guild from Firestore
async function getUserInGuild(guildId, userId) {
    const guildRef = db.collection('guilds').doc(guildId);
    const guildDoc = await guildRef.get();

    if (guildDoc.exists) {
        const guildData = guildDoc.data();

        console.log('Guild Data:', guildData);  // Debugging line
        console.log('Guild Members:', guildData.members);  // Debugging line

        if (guildData.members && guildData.members.includes(userId)) {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                return userDoc.data();
            } else {
                console.log(`User document not found for userId: ${userId}`);  // Debugging line
                return null; // User not found
            }
        } else {
            console.log(`User ${userId} is not a member of guild ${guildId}`); // Debugging line
            return null; // User not a member of the guild
        }
    } else {
        console.warn(`Guild ${guildId} not found in Firestore.`);
        return null;
    }
}

// Get users in a specific guild from Firestore
async function getUsersInGuild(guildId) {
    const guild = await getGuild(guildId);

    if (guild) {
        const userRefs = guild.members.map(userId => db.collection('users').doc(userId));
        const usersSnapshot = await Promise.all(userRefs.map(ref => ref.get()));

        return usersSnapshot.map(userDoc => userDoc.exists ? userDoc.data() : null).filter(Boolean);
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
