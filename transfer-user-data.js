import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseClient } from './supabase.js';
import { getMineName, getMineNumber } from './utils/mineLooker.js';
import {
    getContinentByMineNumber,
    getContinentName,
    normalizeOwnedContinents
} from './utils/continentLooker.js';
import { normalizeUserPreferences } from './utils/userPreferences.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'config', 'user_data', 'firebase_data.json');

function legacyValue(source, snakeCase, camelCase, fallback = undefined) {
    return source?.[snakeCase] ?? source?.[camelCase] ?? fallback;
}

function resolveMineNumber(value, fallback = 1) {
    const numericValue = Number.parseInt(value, 10);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
    return getMineNumber(value) || fallback;
}

function normalizeLegacyMine(mine = {}) {
    const mineNumber = resolveMineNumber(
        legacyValue(
            mine,
            'mine_number',
            'MineNumber',
            legacyValue(mine, 'mineNumber', 'mine_name', legacyValue(mine, 'mineName', 'mine'))
        )
    );
    return {
        prestige_count: Number(legacyValue(mine, 'prestige_count', 'PrestigeCount', 0)) || 0,
        mine_number: mineNumber,
        mine_name: getMineName(mineNumber),
        continent_name: getContinentName(mineNumber),
        factor: Number(legacyValue(mine, 'factor', 'Factor', 1)) || 1,
        barriers: legacyValue(mine, 'barriers', 'Barriers', []) || [],
        elevator: legacyValue(mine, 'elevator', 'Elevator', []) || [],
        warehouse: legacyValue(mine, 'warehouse', 'Warehouse', []) || [],
        managers: legacyValue(mine, 'managers', 'Managers', { shaft: [], elevator: [], warehouse: [] })
            || { shaft: [], elevator: [], warehouse: [] },
        mineshafts: legacyValue(mine, 'mineshafts', 'Mineshafts', []) || []
    };
}

function standardizeCashFields(firebaseData) {
    return {
        cash: Number(legacyValue(firebaseData, 'cash', 'cash', 0)) || 0,
        ice_cash: Number(legacyValue(firebaseData, 'ice_cash', 'iceCash', 0)) || 0,
        fire_cash: Number(legacyValue(firebaseData, 'fire_cash', 'fireCash', 0)) || 0,
        dawn_cash: Number(legacyValue(firebaseData, 'dawn_cash', 'dawnCash', 0)) || 0,
        idle_cash: Number(legacyValue(firebaseData, 'idle_cash', 'idleCash', 0)) || 0,
        idle_ice_cash: Number(legacyValue(firebaseData, 'idle_ice_cash', 'idleIceCash', 0)) || 0,
        idle_fire_cash: Number(legacyValue(firebaseData, 'idle_fire_cash', 'idleFireCash', 0)) || 0,
        idle_dawn_cash: Number(legacyValue(firebaseData, 'idle_dawn_cash', 'idleDawnCash', 0)) || 0
    };
}

export function transformUserData(firebaseData = {}) {
    const userId = String(legacyValue(firebaseData, 'user_id', 'userId', '') || '').trim();
    const currentMineNumber = resolveMineNumber(legacyValue(firebaseData, 'current_mine', 'currentMine', 1));
    const legacyMines = Array.isArray(firebaseData.mines)
        ? firebaseData.mines
        : Object.values(firebaseData.mines || {});
    const mines = legacyMines.length > 0
        ? legacyMines.map(normalizeLegacyMine)
        : [normalizeLegacyMine({ mine_number: currentMineNumber })];
    const currentMine = mines.find(mine => mine.mine_number === currentMineNumber) || mines[0];
    const currentContinent = getContinentByMineNumber(currentMine.mine_number)?.name || getContinentName(currentMine.mine_number);
    const hasPremium = Boolean(legacyValue(firebaseData, 'has_premium', 'hasPremium', false));

    return {
        user_id: userId,
        userId,
        username: String(legacyValue(firebaseData, 'username', 'username', '') || ''),
        created_at: legacyValue(firebaseData, 'created_at', 'createdAt', new Date().toISOString()),
        continents: normalizeOwnedContinents(legacyValue(firebaseData, 'continents', 'continents', [currentContinent])),
        current_continent: currentContinent,
        current_mine: currentMine.mine_name,
        ...standardizeCashFields(firebaseData),
        super_cash: Number(legacyValue(firebaseData, 'super_cash', 'superCash', 0)) || 0,
        streak: Number(legacyValue(firebaseData, 'streak', 'streak', 0)) || 0,
        last_daily: Number(legacyValue(firebaseData, 'last_daily', 'lastDaily', 0)) || 0,
        last_idle: Number(legacyValue(firebaseData, 'last_idle', 'lastIdle', 0)) || 0,
        last_idle_accrued_at: Number(legacyValue(firebaseData, 'last_idle_accrued_at', 'lastIdleAccruedAt', 0)) || 0,
        last_monthly: Number(legacyValue(firebaseData, 'last_monthly', 'lastMonthly', 0)) || 0,
        has_premium: hasPremium,
        active_boosts: legacyValue(firebaseData, 'active_boosts', 'activeBoosts', []) || [],
        inventory: legacyValue(firebaseData, 'inventory', 'inventory', {}) || {},
        preferences: normalizeUserPreferences(legacyValue(firebaseData, 'preferences', 'preferences', null), hasPremium),
        mines
    };
}

export async function initializeTransferredUser(supabaseOrData, maybeTransformedData) {
    const supabase = maybeTransformedData === undefined
        ? getSupabaseClient()
        : supabaseOrData;
    const transformedData = maybeTransformedData === undefined
        ? supabaseOrData
        : maybeTransformedData;

    if (!transformedData?.user_id) throw new TypeError('A transferred user must have a user ID.');

    const { data: existing, error: lookupError } = await supabase
        .from('users')
        .select('id')
        .eq('id', transformedData.user_id)
        .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
        console.log(`User ${transformedData.username || transformedData.user_id} already exists.`);
        return false;
    }

    const { error } = await supabase.from('users').insert({
        id: transformedData.user_id,
        data: transformedData,
        version: 1
    });
    if (error) throw error;
    console.log(`Transferred user ${transformedData.username || transformedData.user_id}.`);
    return true;
}

export async function migrateData(filePath = sourcePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const supabase = getSupabaseClient();
    const records = Array.isArray(data) ? data : Object.values(data || {});
    let transferred = 0;

    for (const firebaseUser of records) {
        const transformedData = transformUserData(firebaseUser);
        if (!transformedData.user_id) {
            console.warn('Skipping legacy record without a user ID.');
            continue;
        }
        if (await initializeTransferredUser(supabase, transformedData)) transferred += 1;
    }
    return transferred;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    migrateData()
        .then(count => console.log(`Migration complete (${count} users transferred).`))
        .catch(error => {
            console.error('Migration error:', error?.message || error);
            process.exitCode = 1;
        });
}