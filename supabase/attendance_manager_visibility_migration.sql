-- Allow managers to see attendance records for owners, managers, and users.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Role based attendance access" on public.attendance;
drop policy if exists "Users can view own attendance" on public.attendance;

create policy "Role based attendance access"
on public.attendance for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

