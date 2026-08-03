-- Permissions for owner, manager and user.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Users can view own leave requests" on public.leave_requests;
drop policy if exists "Users can view own reports" on public.daily_reports;
drop policy if exists "Users can view own attendance" on public.attendance;
drop policy if exists "Users can update own pending leave requests" on public.leave_requests;
drop policy if exists "Users can update own reports" on public.daily_reports;
drop policy if exists "Users can update own attendance" on public.attendance;

create policy "Role based leave request access"
on public.leave_requests for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) = 'owner'
  or (
    (select public.current_user_role()) = 'manager'
    and exists (select 1 from public.profiles p where p.id = employee_id and p.role = 'user')
  )
);

create policy "Role based report access"
on public.daily_reports for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

create policy "Role based attendance access"
on public.attendance for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

create policy "Role based leave request updates"
on public.leave_requests for update to authenticated
using (
  (employee_id = auth.uid() and status = 'pending')
  or (select public.current_user_role()) = 'owner'
  or (
    (select public.current_user_role()) = 'manager'
    and exists (select 1 from public.profiles p where p.id = employee_id and p.role = 'user')
  )
)
with check (
  employee_id = auth.uid()
  or (select public.current_user_role()) = 'owner'
  or (
    (select public.current_user_role()) = 'manager'
    and exists (select 1 from public.profiles p where p.id = employee_id and p.role = 'user')
  )
);

create policy "Role based report updates"
on public.daily_reports for update to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
)
with check (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

create policy "Role based attendance updates"
on public.attendance for update to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
)
with check (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);
