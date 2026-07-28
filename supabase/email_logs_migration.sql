-- Run once in Supabase SQL Editor.
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  email_type text not null,
  recipient text not null,
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_leave_request_id_idx
  on public.email_logs(leave_request_id);

alter table public.email_logs enable row level security;

create policy "Owners and managers can view email logs"
on public.email_logs for select to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'));
