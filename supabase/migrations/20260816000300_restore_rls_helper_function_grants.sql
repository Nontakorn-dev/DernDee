-- RLS policies call these helpers while reading profiles/chat rows.
-- EXECUTE must stay available to signed-in users or login/profile fetch fails.

grant execute on function public.is_assigned_patient(uuid) to authenticated;
grant execute on function public.is_assigned_patient(uuid) to anon;

grant execute on function public.is_linked_doctor_patient(uuid, uuid) to authenticated;
grant execute on function public.is_linked_doctor_patient(uuid, uuid) to anon;
