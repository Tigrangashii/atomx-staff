-- Run this once in Supabase SQL Editor.
alter table public.profiles
  add column if not exists contract_date date,
  add column if not exists annual_leave_days integer not null default 20;

alter table public.profiles drop constraint if exists profiles_annual_leave_days_valid;

alter table public.profiles
  add constraint profiles_annual_leave_days_valid check (annual_leave_days >= 0 and annual_leave_days <= 365);
