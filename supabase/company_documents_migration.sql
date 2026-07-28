-- Run this once in Supabase SQL Editor.
create table if not exists public.company_documents (
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

alter table public.company_documents enable row level security;

drop policy if exists "Authenticated users can view company documents" on public.company_documents;
drop policy if exists "Managers can upload company documents" on public.company_documents;
drop policy if exists "Managers can update company documents" on public.company_documents;
drop policy if exists "Managers can delete company documents" on public.company_documents;

create policy "Authenticated users can view company documents"
on public.company_documents for select to authenticated
using (true);

create policy "Managers can upload company documents"
on public.company_documents for insert to authenticated
with check ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Managers can update company documents"
on public.company_documents for update to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'))
with check ((select public.current_user_role()) in ('owner', 'manager'));

create policy "Managers can delete company documents"
on public.company_documents for delete to authenticated
using ((select public.current_user_role()) in ('owner', 'manager'));

insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can read company documents" on storage.objects;
drop policy if exists "Managers can upload company documents" on storage.objects;
drop policy if exists "Managers can delete company documents" on storage.objects;

create policy "Authenticated users can read company documents"
on storage.objects for select to authenticated
using (bucket_id = 'company-documents');

create policy "Managers can upload company documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-documents'
  and (select public.current_user_role()) in ('owner', 'manager')
);

create policy "Managers can delete company documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'company-documents'
  and (select public.current_user_role()) in ('owner', 'manager')
);
