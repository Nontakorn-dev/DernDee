drop policy if exists sessions_insert_self on public.sessions;
create policy sessions_insert_self
on public.sessions
for insert
with check (patient_id = auth.uid());

drop policy if exists gait_metrics_insert_self_session on public.gait_metrics;
create policy gait_metrics_insert_self_session
on public.gait_metrics
for insert
with check (
  exists (
    select 1
    from public.sessions session_row
    where session_row.id = gait_metrics.session_id
      and session_row.patient_id = auth.uid()
  )
);