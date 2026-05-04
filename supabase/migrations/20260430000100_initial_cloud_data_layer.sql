create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'patient' check (role in ('patient', 'doctor', 'admin')),
  full_name text,
  email text,
  avatar_url text,
  phone text,
  date_of_birth date,
  gender text,
  weight_kg numeric(6, 2),
  height_cm numeric(6, 2),
  blood_type text,
  allergies text,
  medical_conditions text,
  medications text,
  emergency_contact jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{"notifications": true, "dataSharing": false, "language": "en"}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.doctor_patient_assignments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default timezone('utc', now()),
  notes text,
  unique (doctor_id, patient_id)
);

create table if not exists public.patient_presence (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  is_online boolean not null default false,
  current_session_type text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  gateway_session_id text unique,
  source text not null default 'frontend',
  session_type text not null default 'free_walk',
  start_time timestamptz not null,
  end_time timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  total_steps integer not null default 0 check (total_steps >= 0),
  avg_speed_mps numeric(8, 4),
  cadence_spm numeric(8, 2),
  avg_step_length_m numeric(8, 4),
  avg_stride_length_m numeric(8, 4),
  avg_clearance_m numeric(8, 4),
  symmetry_score numeric(8, 2),
  status text not null default 'pending' check (status in ('pending', 'approved', 'needs_attention', 'reviewed')),
  review_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gait_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  recorded_at timestamptz not null default timezone('utc', now()),
  side text check (side in ('left', 'right')),
  step_index integer,
  step_length_m numeric(8, 4),
  stride_length_m numeric(8, 4),
  step_time_s numeric(8, 4),
  swing_time_s numeric(8, 4),
  stance_time_s numeric(8, 4),
  stride_time_s numeric(8, 4),
  max_clearance_m numeric(8, 4),
  speed_mps numeric(8, 4),
  symmetry_percent numeric(8, 2),
  push_off_velocity_mps numeric(8, 4),
  touchdown_pitch_deg numeric(8, 4),
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists doctor_patient_assignments_doctor_idx on public.doctor_patient_assignments (doctor_id);
create index if not exists doctor_patient_assignments_patient_idx on public.doctor_patient_assignments (patient_id);
create index if not exists patient_presence_online_idx on public.patient_presence (is_online, updated_at desc);
create index if not exists sessions_patient_start_idx on public.sessions (patient_id, start_time desc);
create index if not exists sessions_status_idx on public.sessions (status, start_time desc);
create index if not exists gait_metrics_session_recorded_idx on public.gait_metrics (session_id, recorded_at asc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_patient_presence_updated_at on public.patient_presence;
create trigger set_patient_presence_updated_at
before update on public.patient_presence
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_user_meta_data ->> 'role', 'patient')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    role = coalesce(excluded.role, public.profiles.role),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_assigned_doctor(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.doctor_patient_assignments assignment
    where assignment.doctor_id = auth.uid()
      and assignment.patient_id = target_patient_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.doctor_patient_assignments enable row level security;
alter table public.patient_presence enable row level security;
alter table public.sessions enable row level security;
alter table public.gait_metrics enable row level security;

drop policy if exists profiles_select_self_or_assigned_doctor on public.profiles;
create policy profiles_select_self_or_assigned_doctor
on public.profiles
for select
using (id = auth.uid() or public.is_assigned_doctor(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists doctor_patient_assignments_select_related on public.doctor_patient_assignments;
create policy doctor_patient_assignments_select_related
on public.doctor_patient_assignments
for select
using (doctor_id = auth.uid() or patient_id = auth.uid());

drop policy if exists patient_presence_select_self_or_assigned_doctor on public.patient_presence;
create policy patient_presence_select_self_or_assigned_doctor
on public.patient_presence
for select
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));

drop policy if exists patient_presence_insert_self on public.patient_presence;
create policy patient_presence_insert_self
on public.patient_presence
for insert
with check (patient_id = auth.uid());

drop policy if exists patient_presence_update_self on public.patient_presence;
create policy patient_presence_update_self
on public.patient_presence
for update
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

drop policy if exists sessions_select_self_or_assigned_doctor on public.sessions;
create policy sessions_select_self_or_assigned_doctor
on public.sessions
for select
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));

drop policy if exists sessions_update_assigned_doctor on public.sessions;
create policy sessions_update_assigned_doctor
on public.sessions
for update
using (public.is_assigned_doctor(patient_id))
with check (public.is_assigned_doctor(patient_id));

drop policy if exists gait_metrics_select_self_or_assigned_doctor on public.gait_metrics;
create policy gait_metrics_select_self_or_assigned_doctor
on public.gait_metrics
for select
using (
  exists (
    select 1
    from public.sessions session_row
    where session_row.id = gait_metrics.session_id
      and (
        session_row.patient_id = auth.uid()
        or public.is_assigned_doctor(session_row.patient_id)
      )
  )
);

insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

drop policy if exists profile_images_public_read on storage.objects;
create policy profile_images_public_read
on storage.objects
for select
using (bucket_id = 'profile-images');

drop policy if exists profile_images_insert_own_folder on storage.objects;
create policy profile_images_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_images_update_own_folder on storage.objects;
create policy profile_images_update_own_folder
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_images_delete_own_folder on storage.objects;
create policy profile_images_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);