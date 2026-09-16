-- Durable registry for Discord messages with active component collectors.
-- Run after tools/supabase-init.sql if the table is not already present,
-- then reload the PostgREST schema cache.
create table if not exists public.interaction_sessions (
    id         text primary key,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

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
