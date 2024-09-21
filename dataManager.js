const supabase = require('./utils/supabaseClient');

const mineRegions = require('./config/mineRegions.json').regions;
const continentData = require('./config/continentData.json').continents;

// User-related functions

// Initialize a new user in Supabase
async function initializeUser(userId, username) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)  // Make sure to use snake_case to match your table
        .single();

    if (!user) {
        const { error: insertError } = await supabase
            .from('users')
            .insert([{
                user_id: userId,
                username: username || '',
                continents: [continentData[0]],
				current_continent: "Start Continent",
				current_mine: "Coal Mine",
				cash: 10,
				ice_cash: 10,
				fire_cash: 10,
				idle_cash: 0,
                idle_ice_cash: 0,
                idle_fire_cash: 0,
                mines: [{
                    prestige_count: 0,
                    mine_number: 1,
                    mine_name: "Coal Mine",
                    factor: 1,
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
                }],
				super_cash: 0,
                streak: 0,
                last_daily: 0,
                last_idle: 0,
                active_boosts: [],
                inventory: {}
            }]);

        if (insertError) {
            console.error('Error initializing user:', insertError);
        }
    }
}

// Get user by ID from Supabase
async function getUser(userId) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single();

    return error ? null : user;
}

// Update user data in Supabase
async function updateUser(userId, updates) {
    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('user_id', userId);

    if (error) {
        console.error('Error updating user:', error);
    }
}

// Get all users from Supabase
async function getAllUsers() {
    const { data: users, error } = await supabase
        .from('users')
        .select('*');

    return error ? [] : users;
}

// Guild-related functions

// Initialize a new guild in Supabase
async function initializeGuild(guildId, guildName, ownerId) {
    const { data: guild, error } = await supabase
        .from('guilds')
        .select('*')
        .eq('guild_id', guildId)
        .single();

    if (!guild) {
        const { error: insertError } = await supabase
            .from('guilds')
            .insert([{
                guildId,
                name: guildName || '',
                ownerId: ownerId || '',
                members: JSON.stringify([])  // Initialize as an empty array
            }]);

        if (insertError) {
            console.error('Error initializing guild:', insertError);
        }
    }
}

// Get guild by ID from Supabase
async function getGuild(guildId) {
    const guildRef = db.ref(`guilds/${guildId}`);
    const snapshot = await guildRef.once('value');
    return snapshot.exists() ? snapshot.val() : null;
}

// Update guild data in Supabase
async function updateGuild(guildId, updates) {
    const guildRef = db.ref(`guilds/${guildId}`);
    await guildRef.update(updates);
}

// Get all guilds from Supabase
async function getAllGuilds() {
    const guildsRef = db.ref('guilds');
    const snapshot = await guildsRef.once('value');
    return snapshot.exists() ? snapshot.val() : {};
}

// Guild-user related functions

// Add or update a user in a specific guild in Supabase
async function addUserToGuild(guildId, userId) {
    const { data: guild, error } = await supabase
        .from('guilds')
        .select('members')
        .eq('guild_id', guildId)
        .single();

    if (guild && !guild.members.includes(userId)) {
        const updatedMembers = [...guild.members, userId];

        const { error: updateError } = await supabase
            .from('guilds')
            .update({ members: updatedMembers })
            .eq('guild_id', guildId);

        if (updateError) {
            console.error('Error adding user to guild:', updateError);
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
