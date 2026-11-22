# Decision: Standalone library on GitHub Pages + Supabase + Edge Function + Groq
Date: 2026-11-22 | Status: active
Context: move Ahlam's Library out of the Claude artifact (which used claude.use db/sample/tts).
Options considered: A) keep artifact B) static site + Supabase + Groq via Edge Function C) static site with Groq key in browser
Decision: B. Groq key only as Supabase secret, set by Ahlam. Library context is built server-side from the caller's JWT so RLS applies.
Why: C leaks the key; A is not standalone.
Revisit if: she wants multi-user access (RLS policies are currently "any authenticated user", safe only with sign-ups disabled).
