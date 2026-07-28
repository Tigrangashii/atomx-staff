-- Run this once in Supabase SQL Editor.
alter table public.leave_requests
  add column if not exists rejection_reason text;
