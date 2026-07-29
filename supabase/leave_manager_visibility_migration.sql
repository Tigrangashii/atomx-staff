-- Managerët duhet t’i shohin edhe kërkesat e owner-it dhe managerëve tjerë.
drop policy if exists "Role based leave request access" on public.leave_requests;
create policy "Role based leave request access"
on public.leave_requests for select to authenticated
using (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);

drop policy if exists "Role based leave request updates" on public.leave_requests;
create policy "Role based leave request updates"
on public.leave_requests for update to authenticated
using (
  (employee_id = auth.uid() and status = 'pending')
  or (select public.current_user_role()) in ('owner', 'manager')
)
with check (
  employee_id = auth.uid()
  or (select public.current_user_role()) in ('owner', 'manager')
);
