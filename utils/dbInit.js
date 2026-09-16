'use strict';

import { getSupabaseClient } from '../supabase.js';

const DB_CHECK_TIMEOUT_MS = 8_000;

export const REQUIRED_TABLES = [
    { name: 'users', columns: 'id,data,version' },
    { name: 'interaction_sessions', columns: 'id,data' }
];

export const OPTIONAL_TABLES = [];

export function isMissingTableError(error) {
    return ['42P01', 'PGRST204', 'PGRST205'].includes(error?.code)
        || /relation|does not exist|schema cache/i.test(String(error?.message || ''));
}

async function withTimeout(request, message) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve(request),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), DB_CHECK_TIMEOUT_MS);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function checkTable({ name, columns }) {
    try {
        const client = getSupabaseClient();
        const { error: existsError } = await withTimeout(
            client
                .from(name)
                .select('*', { count: 'exact', head: true })
                .limit(1),
            `Database table check timed out for ${name}.`
        );
        if (existsError) return { name, ok: false, error: existsError };

        const { error: columnsError } = await withTimeout(
            client.from(name).select(columns).limit(1),
            `Database column check timed out for ${name}.`
        );
        return { name, ok: !columnsError, error: columnsError || null };
    } catch (error) {
        return { name, ok: false, error };
    }
}

function printManualSql() {
    console.log('\nDatabase setup is required. Run tools/supabase-init.sql in Supabase, then reload the PostgREST schema cache:');
    console.log("NOTIFY pgrst, 'reload schema';\n");
}

export async function initializeDatabase() {
    const results = Object.fromEntries([
        ...REQUIRED_TABLES,
        ...OPTIONAL_TABLES
    ].map(({ name }) => [name, false]));

    // Run checks concurrently so an unavailable Supabase endpoint cannot hold
    // bot startup open once per table. Each request is still bounded above.
    const [requiredResults, optionalResults] = await Promise.all([
        Promise.all(REQUIRED_TABLES.map(checkTable)),
        Promise.all(OPTIONAL_TABLES.map(checkTable))
    ]);

    let allReady = true;
    for (const [index, table] of REQUIRED_TABLES.entries()) {
        const result = requiredResults[index];
        if (!result.ok) {
            allReady = false;
            console.warn(`Database table is missing or incompatible: ${table.name} (${result.error?.message || result.error || 'unknown error'})`);
        } else {
            results[table.name] = true;
        }
    }

    for (const [index, table] of OPTIONAL_TABLES.entries()) {
        const result = optionalResults[index];
        results[table.name] = result.ok;
        if (!result.ok && !isMissingTableError(result.error)) {
            console.warn(`Optional database table is unavailable: ${table.name} (${result.error?.message || result.error || 'unknown error'})`);
        }
    }

    results.allReady = allReady;
    if (allReady) {
        console.log('Database initialization check passed - all required tables are ready.');
    } else {
        console.warn('Database initialization check failed - some required tables are missing or incompatible.');
        printManualSql();
    }
    return results;
}

export async function isDatabaseReady() {
    return (await initializeDatabase()).allReady;
}

export async function safeDbOperation(operation, fallback = null) {
    try {
        return await operation();
    } catch (error) {
        console.error('Database operation failed:', error?.message || error);
        return fallback;
    }
}
