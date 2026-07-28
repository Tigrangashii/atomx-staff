-- Ekzekutoje një herë në Supabase SQL Editor.
create table if not exists public.official_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.official_holidays enable row level security;

create policy "Authenticated users can view official holidays"
  on public.official_holidays for select to authenticated using (true);

create policy "Owners and managers can add official holidays"
  on public.official_holidays for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('owner', 'manager')));

create policy "Owners and managers can update official holidays"
  on public.official_holidays for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('owner', 'manager')));

create policy "Owners and managers can delete official holidays"
  on public.official_holidays for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('owner', 'manager')));
