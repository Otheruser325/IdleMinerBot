const fs = require('fs');
const supabase = require('./utils/supabaseClient');

async function migrateData() {
    // Read the JSON file
    const data = JSON.parse(fs.readFileSync('config/user_data/firebase_data.json', 'utf8'));

    for (const userData of data) {
        const transformedData = transformUserData(userData);
        await initializeTransferredUser(transformedData);
    }
}

function transformUserData(firebaseData) {
    return {
        user_id: firebaseData.userId,
        username: firebaseData.username,
        continents: firebaseData.continents,
        current_continent: firebaseData.currentContinent,
        current_mine: firebaseData.currentMine,
        cash: firebaseData.cash,
        ice_cash: firebaseData.iceCash,
        fire_cash: firebaseData.fireCash,
        idle_cash: firebaseData.idleCash,
        idle_ice_cash: firebaseData.idleIceCash,
        idle_fire_cash: firebaseData.idleFireCash,
        super_cash: firebaseData.superCash,
        streak: firebaseData.streak,
        last_daily: firebaseData.lastDaily,
        last_idle: firebaseData.lastIdle,
        inventory: firebaseData.inventory || {},
        mines: firebaseData.mines.map(mine => ({
            prestige_count: mine.PrestigeCount,
            mine_number: mine.MineNumber,
            mine_name: mine.MineName,
            factor: mine.Factor,
            barriers: mine.barriers || [],
            elevator: mine.elevator || [],
            warehouse: mine.warehouse || [],
            managers: mine.managers || {},
            mineshafts: mine.mineshafts || []
        })),
    };
}

async function initializeTransferredUser(transformedData) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', transformedData.user_id)
        .single();

    if (!user) {
        const { error: insertError } = await supabase
            .from('users')
            .insert([{ ...transformedData }]);

        if (insertError) {
            console.error('Error initializing user:', insertError);
        }
    } else {
        console.log(`User ${transformedData.username} already exists.`);
    }
}

// Execute the migration
migrateData()
    .then(() => console.log('Migration complete'))
    .catch(error => console.error('Migration error:', error));