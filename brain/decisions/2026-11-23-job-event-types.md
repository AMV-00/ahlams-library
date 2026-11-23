# Decision: job / event card types
Date 2026-11-23. Cards in custom sections c-jobs and c-madinah were stored as type `lab`, so they showed "لاب / CTF".
Added types `job` (وظيفة) and `event` (فعالية) to TYPES in app.js. Existing rows are fixed by
supabase/sql/2026-11-23-job-event-types.sql, which Ahlam runs herself in the SQL editor
(c-jobs -> job, c-madinah -> event). Future inbox/ imports should write `job` or `event` directly.
Check: stubbed Playwright render shows وظيفة / فعالية / Job / Event; lab cards unchanged.
