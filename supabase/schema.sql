-- AtomX Staff database schema
-- Ekzekutoje këtë file në Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum ('owner', 'manager', 'user');
create type public.leave_type as enum ('annual', 'sick', 'unpaid', 'other');
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.report_status as enum ('submitted', 'reviewed');
create type public.project_status as enum ('completed', 'in_progress', 'waiting', 'blocked');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.company_settings (
  id integer primary key default 1,
  company_name text not null default 'AtomX Solutions',
  work_start_time time not null default '08:00',
  work_end_time time not null default '16:00',
  break_minutes integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id = 1),
  constraint company_settings_break_valid check (break_minutes >= 0 and break_minutes <= 480)
);

insert into public.company_settings (id) values (1) on conflict (id) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.user_role not null default 'user',
  department_id uuid references public.departments(id) on delete set null,
  position text,
  phone text,
  contract_date date,
  annual_leave_days integer not null default 20,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_annual_leave_days_valid check (annual_leave_days >= 0 and annual_leave_days <= 365)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.official_holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holiday_date date not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  email text,
  phone text,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  rejection_reason text,
  medical_certificate_path text,
  status public.leave_status not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_dates_valid check (end_date >= start_date),
  constraint leave_requests_no_approved_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (status = 'approved')
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null,
  project_name text not null,
  content text not null,
  completed_tasks text not null,
  problems text,
  hours_worked numeric(5,2) check (hours_worked is null or (hours_worked >= 0 and hours_worked <= 24)),
  project_status public.project_status not null default 'in_progress',
  tomorrow_plan text not null,
  status public.report_status not null default 'submitted',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null default current_date,
  check_in timestamptz,
  break_out timestamptz,
  break_in timestamptz,
  check_out timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint attendance_times_valid check (
    (check_out is null or check_in is null or check_out >= check_in)
    and (break_out is null or check_in is null or break_out >= check_in)
    and (break_in is null or break_out is null or break_in >= break_out)
    and (check_out is null or break_in is null or check_out >= break_in)
  ),
  unique (employee_id, work_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger daily_reports_set_updated_at
before update on public.daily_reports
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.leave_requests enable row level security;
alter table public.daily_reports enable row level security;
alter table public.attendance enable row level security;
alter table public.notifications enable row level security;

create policy "Authenticated users can view departments"
on public.departments for select to authenticated using (true);

create policy "Managers can manage departments"
on public.departments for all to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'))
with check ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can view their own profile"
on public.profiles for select to authenticated
using (id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'))
with check (id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Managers can insert profiles"
on public.profiles for insert to authenticated
with check ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Owners can delete profiles"
on public.profiles for delete to authenticated
using ((select public.current_user_role()) = 'owner');

create policy "Users can view own leave requests"
on public.leave_requests for select to authenticated
using (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can create own leave requests"
on public.leave_requests for insert to authenticated
with check (employee_id = auth.uid());

create policy "Users can update own pending leave requests"
on public.leave_requests for update to authenticated
using (employee_id = auth.uid() and status = 'pending' or (select public.current_user_role()) in ('owner', 'manager'))
with check (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Managers can delete leave requests"
on public.leave_requests for delete to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can view own reports"
on public.daily_reports for select to authenticated
using (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can create own reports"
on public.daily_reports for insert to authenticated
with check (employee_id = auth.uid());

create policy "Users can update own reports"
on public.daily_reports for update to authenticated
using (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'))
with check (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can view own attendance"
on public.attendance for select to authenticated
using (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can create own attendance"
on public.attendance for insert to authenticated
with check (employee_id = auth.uid());

create policy "Users can update own attendance"
on public.attendance for update to authenticated
using (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'))
with check (employee_id = auth.uid() or (select public.current_user_role()) in ('owner', 'manager'));

create policy "Users can view own notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy "Users can mark own notifications as read"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index leave_requests_employee_id_idx on public.leave_requests(employee_id);
create index daily_reports_employee_date_idx on public.daily_reports(employee_id, report_date desc);
create index attendance_employee_date_idx on public.attendance(employee_id, work_date desc);
create index notifications_user_id_idx on public.notifications(user_id, is_read);
