-- Idle Miner Bot - document-oriented Supabase schema
-- This follows the durable document/version layout used by VivacityAPI.
-- Run in the Supabase SQL editor, then reload PostgREST:
-- NOTIFY pgrst, 'reload schema';
--
-- The bot connects with the service-role key, which bypasses RLS. If these
-- tables are ever exposed to an untrusted client, RLS (enabled below) plus the
-- revoked anon/authenticated grants keep the rows private.

-- Migrate the original Idle Miner relational tables before creating the
-- VivacityAPI-compatible document tables. The legacy rows are renamed rather
-- than dropped, and their complete row values are retained in `data`, so this
-- is safe to re-run and does not discard gameplay data.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'user_id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'data'
    ) then
        if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'users_legacy_idle_miner') then
            raise exception 'Legacy users table is present but users_legacy_idle_miner already exists; review the previous migration before retrying.';
        end if;
        alter table public.users rename to users_legacy_idle_miner;
    end if;

end $$;

create table if not exists public.users (
    id         text primary key,
    data       jsonb not null default '{}'::jsonb,
    version    bigint not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.interaction_sessions (
    id         text primary key,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- If this project was previously using Idle Miner's relational schema, the
-- rename above leaves a readable backup. Re-home those rows in the document
-- tables without deleting the original backup tables. This keeps the player
-- data while changing only the storage envelope used by the bot.
do $$
begin
    if to_regclass('public.users_legacy_idle_miner') is not null then
        insert into public.users (id, data, version)
        select legacy.user_id::text,
               to_jsonb(legacy) - 'id',
               0
        from public.users_legacy_idle_miner as legacy
        where legacy.user_id is not null
        on conflict (id) do nothing;
    end if;
end $$;

-- Safe to re-run on document-schema installations created before versioning.
-- These statements intentionally preserve the JSON documents.
alter table public.users add column if not exists version bigint;
alter table public.users alter column version set default 0;
update public.users set version = 0 where version is null;
alter table public.users alter column version set not null;
alter table public.users add column if not exists updated_at timestamptz;
alter table public.users alter column updated_at set default now();
update public.users set updated_at = now() where updated_at is null;
alter table public.users alter column updated_at set not null;


alter table public.interaction_sessions add column if not exists updated_at timestamptz;
alter table public.interaction_sessions alter column updated_at set default now();
update public.interaction_sessions set updated_at = now() where updated_at is null;
alter table public.interaction_sessions alter column updated_at set not null;

create or replace function public.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

do $$
begin
    if not exists (select 1 from pg_trigger where tgname = 'users_touch_updated_at') then
        create trigger users_touch_updated_at before update on public.users
        for each row execute function public.touch_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'interaction_sessions_touch_updated_at') then
        create trigger interaction_sessions_touch_updated_at before update on public.interaction_sessions
        for each row execute function public.touch_updated_at();
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Access control
--
-- The bot connects with the service-role key and therefore bypasses RLS, which
-- is what it needs to own the players table. Enabling RLS with no policy denies
-- the `anon` and `authenticated` roles outright, so if this project is ever
-- reached with the public anon key (a mobile client, a leaked key, a mis-set
-- environment variable) the rows stay unreadable and unwritable instead of
-- exposing every player's balance and premium flag.
--
-- Do not add permissive policies here. If a client-side reader is ever needed,
-- add a policy that exposes only the columns it requires.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.interaction_sessions enable row level security;

-- Belt-and-braces: revoke the table grants from the API-facing roles as well, so
-- even a future policy change cannot accidentally widen access. Guarded because
-- `anon`/`authenticated`/`service_role` exist on Supabase but not on a plain
-- PostgreSQL instance.
do $$
declare
    role_name text;
begin
    foreach role_name in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = role_name) then
            execute format('revoke all on table public.users from %I', role_name);
            execute format('revoke all on table public.interaction_sessions from %I', role_name);
        end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
        grant all on table public.users to service_role;
        grant all on table public.interaction_sessions to service_role;
    end if;
end $$;
