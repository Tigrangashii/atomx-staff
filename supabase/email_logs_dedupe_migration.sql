-- Run once in Supabase SQL Editor.
-- Prevents the same leave email from being sent more than once.

alter table public.email_logs
  add column if not exists dedupe_key text;

alter table public.email_logs
  drop constraint if exists email_logs_status_check;

alter table public.email_logs
  add constraint email_logs_status_check
  check (status in ('pending', 'sent', 'failed'));

create unique index if not exists email_logs_dedupe_key_uidx
  on public.email_logs(dedupe_key)
  where dedupe_key is not null;
