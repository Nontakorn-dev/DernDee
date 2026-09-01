create or replace function public.bangkok_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Bangkok', now()))::date;
$$;

revoke all on function public.bangkok_today() from public;
grant execute on function public.bangkok_today() to authenticated;
grant execute on function public.bangkok_today() to service_role;

create table if not exists public.trail_quest_days (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  play_date date not null,
  completed text[] not null default '{}'::text[],
  score integer not null default 0 check (score >= 0),
  last_chapter text check (
    last_chapter is null
    or last_chapter in ('dorsiflexor', 'plantarflexor', 'hip-flexor', 'combined')
  ),
  last_stage integer check (last_stage is null or last_stage >= 1),
  clears jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (patient_id, play_date)
);

comment on table public.trail_quest_days is
  'Trail Quest progress for one Asia/Bangkok calendar day. Unlocks last for that day only; a new day starts empty while previous days remain as history.';

drop trigger if exists set_trail_quest_days_updated_at on public.trail_quest_days;
create trigger set_trail_quest_days_updated_at
before update on public.trail_quest_days
for each row
execute function public.set_updated_at();

alter table public.trail_quest_days enable row level security;

revoke all on table public.trail_quest_days from anon, public;
grant select, insert, update on table public.trail_quest_days to authenticated;
grant all on table public.trail_quest_days to service_role;

grant execute on function public.is_assigned_doctor(uuid) to authenticated;

drop policy if exists trail_quest_days_select_self_or_assigned_doctor on public.trail_quest_days;
create policy trail_quest_days_select_self_or_assigned_doctor
on public.trail_quest_days
for select
to authenticated
using (
  patient_id = (select auth.uid())
  or public.is_assigned_doctor(patient_id)
);

drop policy if exists trail_quest_days_insert_self_today on public.trail_quest_days;
create policy trail_quest_days_insert_self_today
on public.trail_quest_days
for insert
to authenticated
with check (
  patient_id = (select auth.uid())
  and play_date = public.bangkok_today()
);

drop policy if exists trail_quest_days_update_self_today on public.trail_quest_days;
create policy trail_quest_days_update_self_today
on public.trail_quest_days
for update
to authenticated
using (
  patient_id = (select auth.uid())
  and play_date = public.bangkok_today()
)
with check (
  patient_id = (select auth.uid())
  and play_date = public.bangkok_today()
);
