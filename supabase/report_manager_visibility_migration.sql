-- Managers should see reports from owners, managers, and users.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Role based report access" on public.daily_reports;
drop policy if exists "Users can view own reports" on public.daily_reports;

create policy "Role based report access"
on public.daily_reports for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

