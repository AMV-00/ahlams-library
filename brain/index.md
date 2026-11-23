# Brain index (Ahlam's Library)
- [Architecture decision](decisions/2026-11-22-supabase-groq-architecture.md)
- [Seed not committed](decisions/2026-11-22-seed-not-committed.md)
- [Stubbed e2e result](results/2026-11-22-e2e-stubbed-supabase.md)
- [Lesson: precedence bug](lessons/artifact-grid-precedence-bug.md)
Open: real Supabase/Groq end-to-end not yet run (needs Ahlam's project + secret).
- [Lesson: Groq model deprecation](lessons/groq-model-deprecation.md)
- [Research: Groq Arabic TTS (not applied, pending Ahlam)](research/groq-tts-arabic.md)
Open: real call to `cat` after the model fix must be confirmed with scripts/test-cat.mjs.
- 2026-11-22: cat replies render Markdown via md.js (own escaped renderer, no deps); voice.clean strips markdown/tables/HTML. e2e 22/22 incl. XSS payload neutralised (stubbed Supabase).
- [Decision: voice conversation](decisions/2026-11-22-voice-conversation.md)  (e2e 34/34 stubbed; real mic/Groq TTS NOT yet tried; use scripts/test-voice.mjs)
- [Decision: readable theme + light mode](decisions/2026-11-22-readable-theme.md) (npm run contrast must pass before publishing CSS changes)
- [Lesson: wake word variants + live transcript](lessons/wake-word-asr-variants.md) (real recognition still unverified; ask Ahlam for [dobby] console lines)
- [Decision: push-to-talk (supersedes wake word)](decisions/2026-11-22-push-to-talk.md) — e2e 29/29 stubbed; real latency/accuracy not yet measured (scripts/test-voice.mjs)
- [Decision: job / event card types](decisions/2026-11-23-job-event-types.md) (SQL for existing rows: supabase/sql/2026-11-23-job-event-types.sql, run by Ahlam)
- [Decision: tap-to-talk + 1.5 s silence stop](decisions/2026-11-23-tap-to-talk.md) — stubbed e2e OK; real latency: run `npm run test-voice`, or LibDobby.times() in the page console
- [Decision: inbox/ + Action upload](decisions/2026-11-23-inbox-action.md) (real run waits for SUPABASE_SECRET_KEY secret)
- [Decision: Dobby panel redesign](decisions/2026-11-23-dobby-panel.md) — side panel / full screen; voice logic untouched
- [Decision: recommendations «لك الحين»](decisions/2026-11-23-recommendations.md) — recs.js + _shared/recs.ts (keep in sync); stubbed e2e OK
