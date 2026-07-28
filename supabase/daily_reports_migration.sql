-- Ekzekutoje këtë migration nëse daily_reports është krijuar më herët.
do $$
begin
  create type public.project_status as enum ('completed', 'in_progress', 'waiting', 'blocked');
exception
  when duplicate_object then null;
end $$;

alter table public.daily_reports
  add column if not exists project_name text,
  add column if not exists completed_tasks text,
  add column if not exists problems text,
  add column if not exists project_status public.project_status default 'in_progress',
  add column if not exists tomorrow_plan text;

update public.daily_reports
set
  project_name = coalesce(project_name, 'Pa specifikuar'),
  completed_tasks = coalesce(completed_tasks, content),
  tomorrow_plan = coalesce(tomorrow_plan, 'Pa specifikuar')
where project_name is null or completed_tasks is null or tomorrow_plan is null;

alter table public.daily_reports
  alter column project_name set not null,
  alter column completed_tasks set not null,
  alter column tomorrow_plan set not null;
