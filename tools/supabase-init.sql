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
    ice_cash NUMERIC DEFAULT 10,
    fire_cash NUMERIC DEFAULT 10,
    idle_cash NUMERIC DEFAULT 0,
    idle_ice_cash NUMERIC DEFAULT 0,
    idle_fire_cash NUMERIC DEFAULT 0,
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
