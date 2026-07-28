-- Konfigurimi global i orarit për të gjithë punëtorët.
-- Ekzekutoje një herë në Supabase SQL Editor.

create table if not exists public.company_settings (
  id integer primary key default 1,
  company_name text not null default 'AtomX Solutions',
  work_start_time time not null default '08:00',
  work_end_time time not null default '16:00',
  break_minutes integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1),
  constraint company_settings_break_valid check (break_minutes >= 0 and break_minutes <= 480)
);

alter table public.company_settings drop constraint if exists company_settings_tolerance_valid;
alter table public.company_settings drop column if exists late_tolerance_minutes;

insert into public.company_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.company_settings enable row level security;

drop policy if exists "Authenticated users can view company settings" on public.company_settings;
drop policy if exists "Managers can insert company settings" on public.company_settings;
drop policy if exists "Managers can update company settings" on public.company_settings;

create policy "Authenticated users can view company settings"
on public.company_settings for select to authenticated
using (true);

create policy "Managers can insert company settings"
on public.company_settings for insert to authenticated
with check ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Managers can update company settings"
on public.company_settings for update to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'))
with check ((select public.current_user_role()) in ('owner', 'manager'));

create or replace function public.company_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_settings_set_updated_at on public.company_settings;
create trigger company_settings_set_updated_at
before update on public.company_settings
for each row execute procedure public.company_settings_set_updated_at();
