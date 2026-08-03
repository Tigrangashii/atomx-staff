-- Managers should see all active projects in reports and filters.
-- Assigned users still see only projects assigned to them.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Authenticated users can view active projects" on public.projects;

create policy "Authenticated users can view active projects"
on public.projects for select to authenticated
using (
  (
    is_active = true
    and (select public.current_user_role()) in ('owner', 'manager')
  )
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

