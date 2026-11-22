-- Ahlam's Library schema. Run via `supabase db push` or paste in the SQL editor.
create table if not exists public.items (
  id         text primary key,             -- slug, e.g. "job-sevens-mad" or generated
  title      text not null,
  title_en   text,
  tab        text not null default 'misc',
  type       text not null default 'article',
  sub        text,
  summary_ar text,
  summary_en text,
  url        text,
  file_url   text,
  status     smallint not null default 0 check (status in (0,1,2)),
  due        date,
  added      date default current_date,
  notes      text,
  updated_at timestamptz not null default now()
);

create table if not exists public.config (
  key   text primary key,                  -- 'sections', 'assistant'
  value jsonb not null default '{}'::jsonb
);

alter table public.items  enable row level security;
alter table public.config enable row level security;

-- No anon access at all. Only signed-in users; public sign-ups must be DISABLED
-- (Dashboard > Authentication > Providers > Email > turn off "Allow new users to sign up"),
-- so the single account you created by hand is the only one that can ever sign in.
drop policy if exists items_owner  on public.items;
drop policy if exists config_owner on public.config;
create policy items_owner  on public.items  for all to authenticated using (true) with check (true);
create policy config_owner on public.config for all to authenticated using (true) with check (true);

revoke all on public.items, public.config from anon;
