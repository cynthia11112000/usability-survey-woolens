create extension if not exists pgcrypto;

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  participant_id text,
  session_date text,
  researcher_name text,
  payload jsonb not null
);

alter table public.survey_responses enable row level security;

drop policy if exists "Public can read survey responses" on public.survey_responses;
create policy "Public can read survey responses"
on public.survey_responses
for select
to anon
using (true);

drop policy if exists "Public can insert survey responses" on public.survey_responses;
create policy "Public can insert survey responses"
on public.survey_responses
for insert
to anon
with check (true);

drop policy if exists "Public can update survey responses" on public.survey_responses;
create policy "Public can update survey responses"
on public.survey_responses
for update
to anon
using (true)
with check (true);

drop policy if exists "Public can delete survey responses" on public.survey_responses;
create policy "Public can delete survey responses"
on public.survey_responses
for delete
to anon
using (true);