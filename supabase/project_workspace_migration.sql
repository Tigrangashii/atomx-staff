alter table public.projects add column if not exists detailed_description text;

create table if not exists public.project_folders (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  parent_folder_id uuid references public.project_folders(id) on delete cascade, name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(),
  constraint project_folders_name_not_empty check (length(trim(name)) > 0), constraint project_folders_unique_name unique (project_id, parent_folder_id, name)
);
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  folder_id uuid references public.project_folders(id) on delete set null, file_name text not null, storage_path text not null unique,
  mime_type text, file_size bigint, uploaded_by uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now()
);
alter table public.project_folders enable row level security; alter table public.project_files enable row level security;
drop policy if exists "Owners manage project folders" on public.project_folders;
create policy "Owners manage project folders" on public.project_folders for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "Owners manage project files" on public.project_files;
create policy "Owners manage project files" on public.project_files for all to authenticated using (public.is_owner()) with check (public.is_owner());
insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false) on conflict (id) do nothing;
drop policy if exists "Owners manage project files storage" on storage.objects;
create policy "Owners manage project files storage" on storage.objects for all to authenticated using (bucket_id = 'project-files' and public.is_owner()) with check (bucket_id = 'project-files' and public.is_owner());
