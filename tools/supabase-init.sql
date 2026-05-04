-- Idle Miner Bot - Supabase Database Initialization Script
-- Run this in your Supabase SQL Editor if automatic initialization fails
-- URL: https://app.supabase.com/project/_/sql (replace _ with your project ref)

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    preferences JSONB DEFAULT '{}'::jsonb
);

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
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

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
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

UPDATE public.users
SET
    username = COALESCE(username, ''),
    continents = COALESCE(continents, '[]'::jsonb),
    current_continent = COALESCE(current_continent, 'Start Continent'),
    current_mine = COALESCE(current_mine, 'Coal Mine'),
    cash = COALESCE(cash, 10),
    ice_cash = COALESCE(ice_cash, 0),
    fire_cash = COALESCE(fire_cash, 0),
    dawn_cash = COALESCE(dawn_cash, 0),
    idle_cash = COALESCE(idle_cash, 0),
    idle_ice_cash = COALESCE(idle_ice_cash, 0),
    idle_fire_cash = COALESCE(idle_fire_cash, 0),
    idle_dawn_cash = COALESCE(idle_dawn_cash, 0),
    mines = COALESCE(mines, '[]'::jsonb),
    super_cash = COALESCE(super_cash, 0),
    streak = COALESCE(streak, 0),
    last_daily = COALESCE(last_daily, 0),
    last_idle = COALESCE(last_idle, 0),
    last_monthly = COALESCE(last_monthly, 0),
    has_premium = COALESCE(has_premium, FALSE),
    active_boosts = COALESCE(active_boosts, '[]'::jsonb),
    inventory = COALESCE(inventory, '{}'::jsonb),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW()),
    preferences = COALESCE(preferences, '{}'::jsonb);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_user_id ON public.users(user_id);

-- Create index on username for searching
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Enable RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- GUILDS TABLE
-- ============================================
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

-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Service role full access" ON public.guilds;
CREATE POLICY "Service role full access" ON public.guilds
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- OPTIONAL: Create function for auto-updating updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guilds_updated_at ON public.guilds;
CREATE TRIGGER update_guilds_updated_at
    BEFORE UPDATE ON public.guilds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Tables created successfully' as status;
SELECT COUNT(*) as users_count FROM public.users;
SELECT COUNT(*) as guilds_count FROM public.guilds;