-- Run this once in Supabase SQL Editor.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "Authenticated users can view active projects" on public.projects;
drop policy if exists "Owners can manage projects" on public.projects;

create policy "Authenticated users can view active projects"
on public.projects for select to authenticated
using (is_active = true or (select public.current_user_role()) = 'owner');

create policy "Owners can manage projects"
on public.projects for all to authenticated
using ((select public.current_user_role()) = 'owner')
with check ((select public.current_user_role()) = 'owner');

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();
