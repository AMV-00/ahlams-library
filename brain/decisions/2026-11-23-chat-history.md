# Decision: Dobby chat history in Supabase `config` table
Date: 2026-11-23 | Status: active
Context: Ahlam: "مافيه سجل للمحادثات".
Decision: chats.js saves each conversation (after every finished reply, polled every 2.5 s, and on pagehide) as config row key "chat:<id>" value {title (first user message), updated, messages (last 80, 12k chars each)}. No migration needed: `config` already has RLS for authenticated only. 🕘 button lists them newest first (60), tap = continue, × = delete. "New chat" starts a new id.
Why not localStorage: she uses more than one device; Supabase keeps it everywhere. Why not a new table: migrations need DB access the deploy token doesn't have.
Revisit if: the config table gets large (move to a `chats` table via migration) or she wants search.
