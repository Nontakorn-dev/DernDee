insert into public.profiles (
  id,
  email,
  full_name,
  avatar_url,
  role,
  created_at,
  updated_at
)
select
  auth_user.id,
  auth_user.email,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', split_part(auth_user.email, '@', 1)),
  coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', auth_user.raw_user_meta_data ->> 'picture'),
  coalesce(auth_user.raw_user_meta_data ->> 'role', 'patient'),
  coalesce(auth_user.created_at, timezone('utc', now())),
  timezone('utc', now())
from auth.users auth_user
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  role = coalesce(excluded.role, public.profiles.role),
  updated_at = timezone('utc', now());

drop policy if exists doctor_patient_assignments_insert_doctor on public.doctor_patient_assignments;
create policy doctor_patient_assignments_insert_doctor
on public.doctor_patient_assignments
for insert
with check (doctor_id = auth.uid());