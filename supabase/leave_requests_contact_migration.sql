alter table public.leave_requests
  add column if not exists email text,
  add column if not exists phone text;
