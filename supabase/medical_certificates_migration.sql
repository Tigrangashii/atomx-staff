-- Vërtetimet e pushimit mjekësor ruhen në bucket privat dhe lidhen me ID-në e kërkesës.
alter table public.leave_requests
  add column if not exists medical_certificate_path text;

insert into storage.buckets (id, name, public)
values ('medical-certificates', 'medical-certificates', false)
on conflict (id) do nothing;

drop policy if exists "Users can view medical certificates" on storage.objects;
create policy "Users can view medical certificates"
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-certificates'
  and (
    (storage.foldername(name))[1] in (
      select lr.id::text
      from public.leave_requests lr
      where lr.employee_id = auth.uid()
    )
    or (select public.current_user_role()) in ('owner', 'manager')
  )
);
