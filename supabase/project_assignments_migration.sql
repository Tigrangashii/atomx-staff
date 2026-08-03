create table if not exists public.project_assignments (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_assignments enable row level security;

create index if not exists project_assignments_user_id_idx
on public.project_assignments(user_id);

create index if not exists project_assignments_project_id_idx
on public.project_assignments(project_id);

drop policy if exists "Owners manage project assignments" on public.project_assignments;
create policy "Owners manage project assignments"
on public.project_assignments for all to authenticated
using ((select public.current_user_role()) = 'owner')
with check ((select public.current_user_role()) = 'owner');

drop policy if exists "Users can view own project assignments" on public.project_assignments;
create policy "Users can view own project assignments"
on public.project_assignments for select to authenticated
using (user_id = auth.uid() or (select public.current_user_role()) = 'owner');

drop policy if exists "Authenticated users can view active projects" on public.projects;
create policy "Authenticated users can view active projects"
on public.projects for select to authenticated
using (
  (select public.current_user_role()) = 'owner'
  or (
    is_active = true
    and exists (
      select 1
      from public.project_assignments pa
      where pa.project_id = projects.id
        and pa.user_id = auth.uid()
    )
  )
);

drop policy if exists "Owners manage project folders" on public.project_folders;
drop policy if exists "Owners and assigned users can access project folders" on public.project_folders;
drop policy if exists "Owners can manage project folders" on public.project_folders;
create policy "Owners can manage project folders"
on public.project_folders for all to authenticated
using ((select public.current_user_role()) = 'owner')
with check ((select public.current_user_role()) = 'owner');

drop policy if exists "Assigned users can view project folders" on public.project_folders;
create policy "Assigned users can view project folders"
on public.project_folders for select to authenticated
using (
  exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_folders.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Assigned users can create project folders" on public.project_folders;
create policy "Assigned users can create project folders"
on public.project_folders for insert to authenticated
with check (
  exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_folders.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Assigned users can delete own project folders" on public.project_folders;
create policy "Assigned users can delete own project folders"
on public.project_folders for delete to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_folders.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Owners manage project files" on public.project_files;
drop policy if exists "Owners and assigned users can access project files" on public.project_files;
drop policy if exists "Owners can manage project files" on public.project_files;
create policy "Owners can manage project files"
on public.project_files for all to authenticated
using ((select public.current_user_role()) = 'owner')
with check ((select public.current_user_role()) = 'owner');

drop policy if exists "Assigned users can view project files" on public.project_files;
create policy "Assigned users can view project files"
on public.project_files for select to authenticated
using (
  exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_files.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Assigned users can create project files" on public.project_files;
create policy "Assigned users can create project files"
on public.project_files for insert to authenticated
with check (
  exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_files.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Assigned users can delete own project files" on public.project_files;
create policy "Assigned users can delete own project files"
on public.project_files for delete to authenticated
using (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = project_files.project_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists "Owners manage project files storage" on storage.objects;
drop policy if exists "Assigned users can read project files storage" on storage.objects;
drop policy if exists "Assigned users can upload project files storage" on storage.objects;
drop policy if exists "Assigned users can delete own project files storage" on storage.objects;

create policy "Owners manage project files storage"
on storage.objects for all to authenticated
using (bucket_id = 'project-files' and (select public.current_user_role()) = 'owner')
with check (bucket_id = 'project-files' and (select public.current_user_role()) = 'owner');

create policy "Assigned users can read project files storage"
on storage.objects for select to authenticated
using (
  bucket_id = 'project-files'
  and exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = split_part(storage.objects.name, '/', 1)::uuid
      and pa.user_id = auth.uid()
  )
);

create policy "Assigned users can upload project files storage"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'project-files'
  and exists (
    select 1
    from public.project_assignments pa
    where pa.project_id = split_part(storage.objects.name, '/', 1)::uuid
      and pa.user_id = auth.uid()
  )
);

create policy "Assigned users can delete own project files storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'project-files'
  and exists (
    select 1
    from public.project_files pf
    join public.project_assignments pa on pa.project_id = pf.project_id
    where pf.storage_path = storage.objects.name
      and pf.uploaded_by = auth.uid()
      and pa.user_id = auth.uid()
  )
);
