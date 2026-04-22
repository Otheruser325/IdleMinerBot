import supabase from './supabaseClient.js';

/**
 * Database initialization utility for Supabase
 * Ensures required tables exist before bot operations
 */

const REQUIRED_TABLES = ['users', 'guilds'];

const USERS_SCHEMA_SYNC_SQL = `
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS continents JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS current_continent TEXT DEFAULT 'Start Continent',
    ADD COLUMN IF NOT EXISTS current_mine TEXT DEFAULT 'Coal Mine',
    ADD COLUMN IF NOT EXISTS cash NUMERIC DEFAULT 10,
    ADD COLUMN IF NOT EXISTS ice_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fire_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dawn_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS idle_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS idle_ice_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS idle_fire_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS idle_dawn_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mines JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS super_cash NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_daily BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_idle BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_monthly BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS has_premium BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS active_boosts JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.users
    ALTER COLUMN username SET DEFAULT '',
    ALTER COLUMN continents SET DEFAULT '[]'::jsonb,
    ALTER COLUMN current_continent SET DEFAULT 'Start Continent',
    ALTER COLUMN current_mine SET DEFAULT 'Coal Mine',
    ALTER COLUMN cash SET DEFAULT 10,
    ALTER COLUMN ice_cash SET DEFAULT 0,
    ALTER COLUMN fire_cash SET DEFAULT 0,
    ALTER COLUMN dawn_cash SET DEFAULT 0,
    ALTER COLUMN idle_cash SET DEFAULT 0,
    ALTER COLUMN idle_ice_cash SET DEFAULT 0,
    ALTER COLUMN idle_fire_cash SET DEFAULT 0,
    ALTER COLUMN idle_dawn_cash SET DEFAULT 0,
    ALTER COLUMN mines SET DEFAULT '[]'::jsonb,
    ALTER COLUMN super_cash SET DEFAULT 0,
    ALTER COLUMN streak SET DEFAULT 0,
    ALTER COLUMN last_daily SET DEFAULT 0,
    ALTER COLUMN last_idle SET DEFAULT 0,
    ALTER COLUMN last_monthly SET DEFAULT 0,
    ALTER COLUMN has_premium SET DEFAULT FALSE,
    ALTER COLUMN active_boosts SET DEFAULT '[]'::jsonb,
    ALTER COLUMN inventory SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_user_id ON public.users(user_id);
`;

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName) {
    try {
        // Direct query approach - most reliable for Supabase
        const { error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .limit(1);
        
        // 42P01 = table does not exist
        if (error?.code === '42P01' || error?.message?.includes('relation') || error?.message?.includes('does not exist')) {
            return false;
        }
        
        // Any other error means table exists (but we might have permission/other issues)
        return true;
    } catch (error) {
        // If error mentions relation/tables, table likely doesn't exist
        if (error?.code === '42P01' || error?.message?.includes('relation') || error?.message?.includes('does not exist')) {
            return false;
        }
        console.error(`Error checking if table ${tableName} exists:`, error);
        return false;
    }
}

/**
 * Create the exec_sql RPC function if it doesn't exist
 * This allows running SQL statements from the client
 */
async function createExecSQLFunction() {
    const createFunctionSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;
    try {
        // Try to create via raw query - this requires service role
        const { error } = await supabase.rpc('exec_sql', { sql: createFunctionSQL });
        if (error?.message?.includes('function') || error?.message?.includes('does not exist')) {
            return false; // Function doesn't exist and we can't create it
        }
        return !error;
    } catch {
        return false;
    }
}

/**
 * Create the users table
 */
async function createUsersTable() {
    const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    continents JSONB DEFAULT '[]'::jsonb,
    current_continent TEXT DEFAULT 'Start Continent',
    current_mine TEXT DEFAULT 'Coal Mine',
    cash NUMERIC DEFAULT 10,
    ice_cash NUMERIC DEFAULT 0,
    fire_cash NUMERIC DEFAULT 0,
    dawn_cash NUMERIC DEFAULT 0,
    idle_cash NUMERIC DEFAULT 0,
    idle_ice_cash NUMERIC DEFAULT 0,
    idle_fire_cash NUMERIC DEFAULT 0,
    idle_dawn_cash NUMERIC DEFAULT 0,
    mines JSONB DEFAULT '[]'::jsonb,
    super_cash NUMERIC DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_daily BIGINT DEFAULT 0,
    last_idle BIGINT DEFAULT 0,
    last_monthly BIGINT DEFAULT 0,
    has_premium BOOLEAN DEFAULT FALSE,
    active_boosts JSONB DEFAULT '[]'::jsonb,
    inventory JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_user_id ON public.users(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
`;

    try {
        // Try to execute via RPC if available
        const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
        
        if (error) {
            console.error('Failed to create users table via RPC:', error.message);
            console.log('\n=== REQUIRED SQL FOR users TABLE ===');
            console.log(createTableSQL);
            console.log('=== END SQL ===\n');
            return false;
        }
        
        console.log('✓ Users table created successfully');
        return true;
    } catch (error) {
        console.error('Error creating users table:', error);
        console.log('\n=== REQUIRED SQL FOR users TABLE ===');
        console.log(createTableSQL);
        console.log('=== END SQL ===\n');
        return false;
    }
}

async function syncUsersTableSchema() {
    try {
        const { error } = await supabase.rpc('exec_sql', { sql: USERS_SCHEMA_SYNC_SQL });

        if (error) {
            console.error('Failed to sync users table schema via RPC:', error.message);
            console.log('\n=== REQUIRED SQL FOR USERS SCHEMA SYNC ===');
            console.log(USERS_SCHEMA_SYNC_SQL);
            console.log('=== END SQL ===\n');
            return false;
        }

        console.log('✓ Users table schema synced successfully');
        return true;
    } catch (error) {
        console.error('Error syncing users table schema:', error);
        console.log('\n=== REQUIRED SQL FOR USERS SCHEMA SYNC ===');
        console.log(USERS_SCHEMA_SYNC_SQL);
        console.log('=== END SQL ===\n');
        return false;
    }
}

/**
 * Create the guilds table
 */
async function createGuildsTable() {
    const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.guilds (
    id SERIAL PRIMARY KEY,
    guild_id TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    owner_id TEXT DEFAULT '',
    members JSONB DEFAULT '[]'::jsonb,
    users JSONB DEFAULT '{}'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on guild_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_guilds_guild_id ON public.guilds(guild_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;
`;

    try {
        const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
        
        if (error) {
            console.error('Failed to create guilds table via RPC:', error.message);
            console.log('\n=== REQUIRED SQL FOR guilds TABLE ===');
            console.log(createTableSQL);
            console.log('=== END SQL ===\n');
            return false;
        }
        
        console.log('✓ Guilds table created successfully');
        return true;
    } catch (error) {
        console.error('Error creating guilds table:', error);
        console.log('\n=== REQUIRED SQL FOR guilds TABLE ===');
        console.log(createTableSQL);
        console.log('=== END SQL ===\n');
        return false;
    }
}

/**
 * Initialize database - check and create missing tables
 */
export async function initializeDatabase() {
    console.log('🔍 Checking database tables...');
    
    const results = {
        users: false,
        guilds: false,
        allReady: false
    };

    // Check users table
    const usersExists = await tableExists('users');
    if (!usersExists) {
        console.log('⚠ Users table not found. Attempting to create...');
        // Try to create exec_sql function first
        const hasExecSQL = await createExecSQLFunction();
        if (!hasExecSQL) {
            console.log('ℹ Note: exec_sql RPC not available. Will try direct creation...');
        }
        results.users = await createUsersTable();
        if (results.users) {
            results.users = await syncUsersTableSchema();
        }
    } else {
        console.log('✓ Users table exists');
        results.users = await syncUsersTableSchema();
    }

    // Check guilds table
    const guildsExists = await tableExists('guilds');
    if (!guildsExists) {
        console.log('⚠ Guilds table not found. Attempting to create...');
        results.guilds = await createGuildsTable();
    } else {
        console.log('✓ Guilds table exists');
        results.guilds = true;
    }

    results.allReady = results.users && results.guilds;

    if (results.allReady) {
        console.log('✅ Database initialization complete - all tables ready');
    } else {
        console.error('❌ Database initialization incomplete - some tables are missing');
        console.log('\n📋 MANUAL SETUP REQUIRED:');
        console.log('The bot cannot auto-create tables. Please run the SQL script manually:');
        console.log('1. Open supabase-init.sql in this project folder');
        console.log('2. Copy the SQL content');
        console.log('3. Go to https://app.supabase.com/project/_/sql');
        console.log('   (replace _ with your project ref from SUPABASE_URL)');
        console.log('4. Paste and run the SQL\n');
    }

    return results;
}

/**
 * Quick check if database is ready (for runtime guards)
 */
export async function isDatabaseReady() {
    const usersExists = await tableExists('users');
    const guildsExists = await tableExists('guilds');
    return usersExists && guildsExists;
}

/**
 * Safe wrapper for database operations - retries after init if needed
 */
export async function safeDbOperation(operation, fallback = null) {
    try {
        return await operation();
    } catch (error) {
        // If table doesn't exist, try to initialize and retry once
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
            console.log('Table missing, attempting emergency initialization...');
            await initializeDatabase();
            
            // Retry once
            try {
                return await operation();
            } catch (retryError) {
                console.error('Operation failed after initialization attempt:', retryError);
                return fallback;
            }
        }
        
        console.error('Database operation failed:', error);
        return fallback;
    }
}
