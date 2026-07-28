-- Ekzekutoje një herë në Supabase Dashboard > SQL Editor.
-- Bllokon pushimet e aprovuara që mbivendosen për të njëjtin punëtor.

create extension if not exists btree_gist;

alter table public.leave_requests
  drop constraint if exists leave_requests_no_approved_overlap;

alter table public.leave_requests
  add constraint leave_requests_no_approved_overlap
  exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status = 'approved');
