-- Durable registry for Discord messages with active component collectors.
-- Run after tools/supabase-init.sql if the table is not already present,
-- then reload the PostgREST schema cache.
create table if not exists public.interaction_sessions (
    id         text primary key,
    data       jsonb not null default '{}'::jsonb,
    version    bigint not null default 0,
    updated_at timestamptz not null default now()
);

-- Premium checkout records are stored in this table and fulfilled with a
-- version-guarded compare-and-swap, so the row needs the same version column
-- the users table uses. Safe to re-run on older installations.
alter table public.interaction_sessions add column if not exists version bigint;
alter table public.interaction_sessions alter column version set default 0;
update public.interaction_sessions set version = 0 where version is null;
alter table public.interaction_sessions alter column version set not null;

alter table public.interaction_sessions add column if not exists updated_at timestamptz;
alter table public.interaction_sessions alter column updated_at set default now();
update public.interaction_sessions set updated_at = now() where updated_at is null;
alter table public.interaction_sessions alter column updated_at set not null;

create or replace function public.touch_interaction_sessions_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

do $$
begin
    if not exists (select 1 from pg_trigger where tgname = 'interaction_sessions_touch_updated_at') then
        create trigger interaction_sessions_touch_updated_at before update on public.interaction_sessions
        for each row execute function public.touch_interaction_sessions_updated_at();
    end if;
end $$;

-- Deny the API-facing roles by default; the bot uses the service-role key.
alter table public.interaction_sessions enable row level security;

do $$
declare
    role_name text;
begin
    foreach role_name in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = role_name) then
            execute format('revoke all on table public.interaction_sessions from %I', role_name);
        end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
        grant all on table public.interaction_sessions to service_role;
    end if;
end $$;
