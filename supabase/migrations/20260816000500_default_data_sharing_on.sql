alter table public.profiles
  alter column preferences set default '{"notifications": true, "dataSharing": true, "language": "en"}'::jsonb;

update public.profiles
set
  preferences = coalesce(preferences, '{}'::jsonb) || '{"dataSharing": true}'::jsonb,
  updated_at = timezone('utc', now())
where coalesce(preferences ->> 'dataSharing', 'false') <> 'true';
