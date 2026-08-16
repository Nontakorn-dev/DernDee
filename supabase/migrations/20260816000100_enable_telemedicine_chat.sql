create or replace function public.is_assigned_patient(target_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.doctor_patient_assignments assignment
    where assignment.patient_id = auth.uid()
      and assignment.doctor_id = target_doctor_id
  );
$$;

create or replace function public.is_linked_doctor_patient(target_doctor_id uuid, target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.doctor_patient_assignments assignment
    where assignment.doctor_id = target_doctor_id
      and assignment.patient_id = target_patient_id
      and (assignment.doctor_id = auth.uid() or assignment.patient_id = auth.uid())
  );
$$;

drop policy if exists profiles_select_self_or_assigned_doctor on public.profiles;
create policy profiles_select_self_or_assigned_pair
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_assigned_doctor(id)
  or public.is_assigned_patient(id)
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  last_message_text text,
  last_message_sender_id uuid references public.profiles (id) on delete set null,
  doctor_last_read_at timestamptz,
  patient_last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (doctor_id, patient_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('patient', 'doctor')),
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 4000),
  message_type text not null default 'text' check (message_type in ('text', 'analysis')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists chat_threads_doctor_last_message_idx
  on public.chat_threads (doctor_id, last_message_at desc nulls last);
create index if not exists chat_threads_patient_last_message_idx
  on public.chat_threads (patient_id, last_message_at desc nulls last);
create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at asc);

drop trigger if exists set_chat_threads_updated_at on public.chat_threads;
create trigger set_chat_threads_updated_at
before update on public.chat_threads
for each row
execute function public.set_updated_at();

create or replace function public.touch_chat_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads
  set
    last_message_at = new.created_at,
    last_message_text = left(new.body, 280),
    last_message_sender_id = new.sender_id
  where id = new.thread_id;

  return new;
end;
$$;

drop trigger if exists touch_chat_thread_on_message on public.chat_messages;
create trigger touch_chat_thread_on_message
after insert on public.chat_messages
for each row
execute function public.touch_chat_thread_on_message();

create or replace function public.mark_chat_thread_read(target_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_row public.chat_threads;
begin
  select *
  into thread_row
  from public.chat_threads
  where id = target_thread_id;

  if not found then
    return;
  end if;

  if not public.is_linked_doctor_patient(thread_row.doctor_id, thread_row.patient_id) then
    raise exception 'not allowed to mark this conversation as read';
  end if;

  if auth.uid() = thread_row.doctor_id then
    update public.chat_threads
    set doctor_last_read_at = timezone('utc', now())
    where id = target_thread_id;
  elsif auth.uid() = thread_row.patient_id then
    update public.chat_threads
    set patient_last_read_at = timezone('utc', now())
    where id = target_thread_id;
  end if;
end;
$$;

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_threads_select_linked on public.chat_threads;
create policy chat_threads_select_linked
on public.chat_threads
for select
using (public.is_linked_doctor_patient(doctor_id, patient_id));

drop policy if exists chat_threads_insert_linked on public.chat_threads;
create policy chat_threads_insert_linked
on public.chat_threads
for insert
with check (
  public.is_linked_doctor_patient(doctor_id, patient_id)
  and (doctor_id = auth.uid() or patient_id = auth.uid())
);

drop policy if exists chat_messages_select_linked on public.chat_messages;
create policy chat_messages_select_linked
on public.chat_messages
for select
using (
  exists (
    select 1
    from public.chat_threads thread_row
    where thread_row.id = chat_messages.thread_id
      and public.is_linked_doctor_patient(thread_row.doctor_id, thread_row.patient_id)
  )
);

drop policy if exists chat_messages_insert_linked_sender on public.chat_messages;
create policy chat_messages_insert_linked_sender
on public.chat_messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_threads thread_row
    where thread_row.id = chat_messages.thread_id
      and public.is_linked_doctor_patient(thread_row.doctor_id, thread_row.patient_id)
      and (
        (sender_role = 'doctor' and sender_id = thread_row.doctor_id)
        or (sender_role = 'patient' and sender_id = thread_row.patient_id)
      )
  )
);

grant execute on function public.is_assigned_patient(uuid) to authenticated;
grant execute on function public.is_linked_doctor_patient(uuid, uuid) to authenticated;
grant execute on function public.mark_chat_thread_read(uuid) to authenticated;
grant select, insert on public.chat_threads to authenticated;
grant select, insert on public.chat_messages to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_threads'
  ) then
    alter publication supabase_realtime add table public.chat_threads;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
