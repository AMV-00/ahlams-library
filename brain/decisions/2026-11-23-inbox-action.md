# Decision: inbox/ + GitHub Action upload
Date: 2026-11-23 | Status: active
Context: scheduled jobs/Madinah task wrote to the old artifact db; the site now reads Supabase.
Decision: tasks write inbox/*.json and push; .github/workflows/inbox.yml runs scripts/inbox-upload.mjs
with the server key from GitHub Secret SUPABASE_SECRET_KEY, then deletes the file. Dedupe (url, or tab+title)
and expiry pruning happen in the script because the task has no DB access.
Existing ids get a partial update so her status/notes survive. Stub-server test: insert, skip dup, partial update, prune OK.
Caveat: repo is public, inbox files stay in git history; job listings only, no personal notes.
Revisit if: repo goes private, or the task should read the DB directly.
