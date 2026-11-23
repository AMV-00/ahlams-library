-- Ahlam's Library: give the job / opportunity cards their own types.
-- Run once in Supabase Dashboard > SQL editor (signed in as the owner). Safe to re-run.
-- Sections c-jobs and c-madinah are custom sections; their cards were saved as type 'lab',
-- so they showed "لاب / CTF". This only touches rows in those two sections.

-- 1) Look first:
select tab, type, count(*) from public.items
where tab in ('c-jobs', 'c-madinah') group by tab, type order by tab;

-- 2) Update:
update public.items set type = 'job',   updated_at = now() where tab = 'c-jobs'    and type <> 'job';
update public.items set type = 'event', updated_at = now() where tab = 'c-madinah' and type <> 'event';

-- 3) Check again (expect only job / event):
select tab, type, count(*) from public.items
where tab in ('c-jobs', 'c-madinah') group by tab, type order by tab;
