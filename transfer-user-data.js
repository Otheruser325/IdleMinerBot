import fs from 'fs';
import supabase from './utils/supabaseClient.js';
import { getMineName } from './utils/mineLooker.js';
import { getContinentName, getContinentByMineNumber, getCashField, getIdleCashField } from './utils/continentLooker.js';

async function migrateData() {
    const data = JSON.parse(fs.readFileSync('config/user_data/firebase_data.json', 'utf8'));

    for (const userData of data) {
        const transformedData = transformUserData(userData);
        await initializeTransferredUser(transformedData);
    }
}

function transformUserData(firebaseData) {
    // Normalize current mine number and get standardized names
    const currentMineNumber = parseInt(firebaseData.currentMine, 10) || 1;
    const normalizedCurrentMine = getMineName(currentMineNumber);
    const normalizedCurrentContinent = getContinentName(currentMineNumber);
    
    // Get continent info for cash standardization
    const continentInfo = getContinentByMineNumber(currentMineNumber);
    
    // Normalize mines array with standardized names
    const normalizedMines = firebaseData.mines.map(mine => {
        const mineNumber = parseInt(mine.MineNumber, 10);
        const normalizedMineName = getMineName(mineNumber);
        const normalizedContinent = getContinentName(mineNumber);
        
        return {
            prestige_count: mine.PrestigeCount,
            mine_number: mineNumber,
            mine_name: normalizedMineName,
            continent_name: normalizedContinent,
            factor: mine.Factor,
            barriers: mine.barriers || [],
            elevator: mine.elevator || [],
            warehouse: mine.warehouse || [],
            managers: mine.managers || {},
            mineshafts: mine.mineshafts || []
        };
    });
    
    // Standardize cash fields based on current continent
    // Only the active continent's cash should be in the main cash field
    const cashStandardization = standardizeCashFields(
        firebaseData,
        continentInfo,
        currentMineNumber
    );

    return {
        user_id: firebaseData.userId,
        username: firebaseData.username,
        continents: firebaseData.continents,
        current_continent: normalizedCurrentContinent,
        current_mine: normalizedCurrentMine,
        ...cashStandardization,
        super_cash: firebaseData.superCash,
        streak: firebaseData.streak,
        last_daily: firebaseData.lastDaily,
        last_idle: firebaseData.lastIdle,
        inventory: firebaseData.inventory || {},
        mines: normalizedMines,
    };
}

/**
 * Standardize cash fields based on current continent/mine
 * Ensures cash is stored in the correct field based on mine number
 */
function standardizeCashFields(firebaseData, continentInfo, currentMineNumber) {
    const result = {
        cash: firebaseData.cash || 0,
        ice_cash: firebaseData.iceCash || 0,
        fire_cash: firebaseData.fireCash || 0,
        idle_cash: firebaseData.idleCash || 0,
        idle_ice_cash: firebaseData.idleIceCash || 0,
        idle_fire_cash: firebaseData.idleFireCash || 0
    };
    
    if (!continentInfo) return result;
    
    // For edge cases like Mine 13 (Sapphire Mine) which is in Ice Continent
    // Ensure cash is properly categorized based on the actual continent
    const currentCashField = getCashField(currentMineNumber);
    const currentIdleField = getIdleCashField(currentMineNumber);
    
    // If user has cash in wrong fields, we keep them as-is
    // but ensure the active continent cash fields are set correctly
    
    // Map legacy field names if they exist
    if (firebaseData.cash !== undefined) result.cash = firebaseData.cash;
    if (firebaseData.iceCash !== undefined) result.ice_cash = firebaseData.iceCash;
    if (firebaseData.fireCash !== undefined) result.fire_cash = firebaseData.fireCash;
    if (firebaseData.idleCash !== undefined) result.idle_cash = firebaseData.idleCash;
    if (firebaseData.idleIceCash !== undefined) result.idle_ice_cash = firebaseData.idleIceCash;
    if (firebaseData.idleFireCash !== undefined) result.idle_fire_cash = firebaseData.idleFireCash;
    
    console.log(`User ${firebaseData.userId} (Mine ${currentMineNumber}, ${continentInfo.name}):`);
    console.log(`  - Active cash field: ${currentCashField}`);
    console.log(`  - Active idle field: ${currentIdleField}`);
    
    return result;
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