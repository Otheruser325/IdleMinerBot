import supabase from './utils/supabaseClient.js';
import { isDatabaseReady, safeDbOperation } from './utils/dbInit.js';

import mineRegionsJson from './config/mineRegions.json' with { type: 'json' };
import continentDataJson from './config/continentData.json' with { type: 'json' };
import { normalizeOwnedContinents } from './utils/continentLooker.js';

const mineRegions = mineRegionsJson.regions;
const continentData = continentDataJson.continents;
const userLocks = new Map();

function runSerialized(map, key, operation) {
    const previous = map.get(key) || Promise.resolve();
    const current = previous
        .catch(() => undefined)
        .then(operation);
    const tracked = current.finally(() => {
        if (map.get(key) === tracked) {
            map.delete(key);
        }
    });

    map.set(key, tracked);
    return current;
}

// Database operation wrapper for safe execution
async function dbSafe(operation, fallback = null, errorContext = '') {
    try {
        return await operation();
    } catch (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
            console.error(`Database table missing during ${errorContext}:`, error.message);
            return fallback;
        }
        console.error(`Database error during ${errorContext}:`, error);
        return fallback;
    }
}

async function withUserLock(userId, operation) {
    if (!userId) {
        throw new Error('withUserLock requires a valid user ID.');
    }

    return runSerialized(userLocks, userId, operation);
}

// User-related functions

// Initialize a new user in Supabase
async function initializeUser(userId, username) {
    return dbSafe(async () => {
        if (typeof userId !== 'string') {
            console.error('Invalid user ID format:', userId);
            return;
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user:', error);
            return;
        }

        if (!user) {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{
                    user_id: userId,
                    username: username || '',
                    continents: normalizeOwnedContinents([continentData[0].ContinentName]),
                    current_continent: "Start Continent",
                    current_mine: "Coal Mine",
                    cash: 10,
                    ice_cash: 0,
                    fire_cash: 0,
                    dawn_cash: 0,
                    idle_cash: 0,
                    idle_ice_cash: 0,
                    idle_fire_cash: 0,
                    idle_dawn_cash: 0,
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
                    last_monthly: 0,
                    has_premium: false,
                    active_boosts: [],
                    inventory: {}
                }]);

            if (insertError) {
                console.error('Error initializing user:', insertError);
            } else {
                console.log('User initialized:', userId);
            }
        } else {
            console.log('User already exists:', userId);
        }
    }, null, 'initializeUser');
}

// Get user by ID from Supabase
async function getUser(userId) {
    return dbSafe(async () => {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user:', error);
        }
        return error ? null : user;
    }, null, 'getUser');
}

// Update user data in Supabase
async function updateUser(userId, updates) {
    return dbSafe(async () => {
        if (!userId) {
            throw new Error('updateUser requires a valid user ID.');
        }

        if (!updates || Object.keys(updates).length === 0) {
            return null;
        }

        const payload = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('users')
            .update(payload)
            .eq('user_id', userId)
            .select()
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(`No user record was updated for user_id=${userId}`);
        }

        return data;
    }, null, 'updateUser');
}

async function mutateUser(userId, mutator, errorContext = 'mutateUser') {
    return withUserLock(userId, async () => {
        const user = await getUser(userId);
        if (!user) {
            return null;
        }

        const result = await mutator(user);
        if (result === false) {
            return user;
        }

        const updates = result && typeof result === 'object' && !Array.isArray(result)
            ? result
            : user;

        return updateUser(userId, updates).catch(error => {
            console.error(`Error during ${errorContext}:`, error);
            throw error;
        });
    });
}

// Get all users from Supabase
async function getAllUsers() {
    return dbSafe(async () => {
        const { data: users, error } = await supabase.from('users').select('*');
        if (error) {
            console.error('Error fetching users:', error);
            return [];
        }
        return users || [];
    }, [], 'getAllUsers');
}

// Guild-related functions

// Initialize a new guild in Supabase
async function initializeGuild(guildId, guildName, ownerId) {
    return dbSafe(async () => {
        const { data: guild, error } = await supabase
            .from('guilds')
            .select('*')
            .eq('guild_id', guildId)
            .single();

        if (!guild) {
            const { error: insertError } = await supabase
                .from('guilds')
                .insert([{
                    guild_id: guildId,
                    name: guildName || '',
                    owner_id: ownerId || '',
                    members: []  // Initialize as an empty array
                }]);

            if (insertError) {
                console.error('Error initializing guild:', insertError);
            }
        }
    }, null, 'initializeGuild');
}

// Get guild by ID from Supabase
async function getGuild(guildId) {
    return dbSafe(async () => {
        const { data, error } = await supabase
            .from('guilds')
            .select('*')
            .eq('guild_id', guildId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching guild ${guildId}:`, error);
        }
        return data || null;
    }, null, 'getGuild');
}

// Update guild data in Supabase
async function updateGuild(guildId, updates) {
    return dbSafe(async () => {
        const { data, error } = await supabase
            .from('guilds')
            .update(updates)
            .eq('guild_id', guildId);

        if (error) {
            console.error(`Error updating guild ${guildId}:`, error);
        }
        return data;
    }, null, 'updateGuild');
}

// Get all guilds from Supabase
async function getAllGuilds() {
    return dbSafe(async () => {
        const { data, error } = await supabase
            .from('guilds')
            .select('*');

        if (error) {
            console.error('Error fetching all guilds:', error);
            return [];
        }
        return data || [];
    }, [], 'getAllGuilds');
}

// Guild-user related functions

// Add or update a user in a specific guild in Supabase
async function addUserToGuild(guildId, userId) {
    return dbSafe(async () => {
        const { data: guild, error } = await supabase
            .from('guilds')
            .select('members')
            .eq('guild_id', guildId)
            .single();

        if (guild && guild.members && !guild.members.includes(userId)) {
            const updatedMembers = [...guild.members, userId];

            const { error: updateError } = await supabase
                .from('guilds')
                .update({ members: updatedMembers })
                .eq('guild_id', guildId);

            if (updateError) {
                console.error('Error adding user to guild:', updateError);
            }
        }
    }, null, 'addUserToGuild');
}

// Get a user from a specific guild from Supabase
const getUserInGuild = async (guildId, userId) => {
    return dbSafe(async () => {
        const { data: guild, error: guildError } = await supabase
            .from('guilds')
            .select('users')
            .eq('guild_id', guildId)
            .single();

        if (guildError && guildError.code !== 'PGRST116') {
            console.error(`Error fetching guild ${guildId}:`, guildError);
        }

        if (!guild || !guild.users) return null;

        const userData = guild.users[userId];
        return userData ? { ...userData, userId } : null;
    }, null, 'getUserInGuild');
};

// Get users in a specific guild from Supabase
async function getUsersInGuild(guildId) {
    return dbSafe(async () => {
        const guild = await getGuild(guildId);
        if (guild && guild.members && Array.isArray(guild.members)) {
            const userPromises = guild.members.map(userId => getUser(userId));
            const users = await Promise.all(userPromises);
            return users.filter(user => user); // Filter out null users
        }
        return [];
    }, [], 'getUsersInGuild');
}

// Get all users in a specific guild (alternative implementation)
async function getAllUsersInGuild(guildId) {
    return getUsersInGuild(guildId);
}

export {
    initializeUser,
    getUser,
    updateUser,
    mutateUser,
    withUserLock,
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
