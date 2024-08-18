const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the path to the SQLite database in the config directory
const dbPath = path.join(__dirname, 'config', 'botData.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Initialize the tables if they don't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            vCoins INTEGER DEFAULT 500,
            bankBalance INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            lastDaily INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS guilds (
            id TEXT PRIMARY KEY,
            name TEXT,
            ownerId TEXT
        )
    `);
});

// User-related functions

// Initialize a user in the database
async function initializeUser(userId, username) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO users (id, username) VALUES (?, ?)`;
        db.run(query, [userId, username], (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

// Get user by ID
async function getUser(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE id = ?`;
        db.get(query, [userId], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

// Update user data
async function updateUser(userId, updates) {
    const { streak, lastDaily, vCoins } = updates;
    return new Promise((resolve, reject) => {
        const query = `UPDATE users SET streak = ?, lastDaily = ?, vCoins = ? WHERE id = ?`;
        db.run(query, [streak, lastDaily, vCoins, userId], (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

// Get all users
async function getAllUsers() {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users`;
        db.all(query, [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}

// Guild-related functions

// Initialize a guild in the database
async function initializeGuild(guildId, guildName, ownerId) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO guilds (id, name, ownerId) VALUES (?, ?, ?)`;
        db.run(query, [guildId, guildName, ownerId], (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

// Get guild by ID
async function getGuild(guildId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM guilds WHERE id = ?`;
        db.get(query, [guildId], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

// Update guild data
async function updateGuild(guildId, updates) {
    const { name, ownerId } = updates;
    return new Promise((resolve, reject) => {
        const query = `UPDATE guilds SET name = ?, ownerId = ? WHERE id = ?`;
        db.run(query, [name, ownerId, guildId], (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

// Get all guilds
async function getAllGuilds() {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM guilds`;
        db.all(query, [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
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
};
