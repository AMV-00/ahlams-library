# Ahlam's Library

Static site (GitHub Pages) + Supabase (Postgres, Auth, Edge Function). The assistant ("القطوة") calls Groq (Llama) through the Edge Function `cat`; the Groq key exists only as a Supabase secret.

## Setup (once)
1. Create a Supabase project. Dashboard > Authentication: **create your user by hand** (Add user), then turn **off** "Allow new users to sign up".
2. `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` (applies `supabase/migrations/0001_init.sql`: tables + RLS).
3. Put the project URL and **anon** key in `config.js` (both are public by design).
4. Set the Groq key yourself, never in a file: `npx supabase secrets set GROQ_API_KEY=<your key>`
5. Optional: `npx supabase secrets set ALLOWED_ORIGINS=https://amv-00.github.io` (default already allows it plus localhost:8080).
6. `npx supabase functions deploy cat`
7. Seed: `npm i`, set env `SUPABASE_URL SUPABASE_ANON_KEY LIB_EMAIL LIB_PASSWORD`, then `npm run seed`.
8. Before every publish: `npm run check` (secret scan must say "clean").
9. Push to `AMV-00/ahlams-library`, enable Pages (branch `main`, root).

## Notes
- `data/seed.json` is git-ignored: it holds your personal study data and Pages repos are public.
- RLS: no anon access; any authenticated user has full access, which is safe only while sign-ups are disabled (step 1).
- Voice uses the browser's speech synthesis (the Claude artifact's TTS isn't available outside Claude).
