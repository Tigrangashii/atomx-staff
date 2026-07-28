-- Run this once in Supabase SQL Editor.
alter table public.attendance
  add column if not exists break_out timestamptz,
  add column if not exists break_in timestamptz;

alter table public.attendance drop constraint if exists attendance_times_valid;

alter table public.attendance
  add constraint attendance_times_valid check (
    (check_out is null or check_in is null or check_out >= check_in)
    and (break_out is null or check_in is null or break_out >= check_in)
    and (break_in is null or break_out is null or break_in >= break_out)
    and (check_out is null or break_in is null or check_out >= break_in)
  );
