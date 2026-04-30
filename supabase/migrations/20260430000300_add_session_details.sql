alter table public.sessions
add column if not exists details jsonb not null default '{}'::jsonb;