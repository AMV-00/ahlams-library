# Lesson: hardcoded Groq model was shut down; assistant failed silently
What happened: cat replied "couldn't answer" for everyone. Root cause: llama-3.3-70b-versatile shut down 2026-08-16 (Groq deprecations page, checked 2026-11-22); Groq's recommended replacement is openai/gpt-oss-120b. No Llama chat model remains on the models list.
Rule from now on: model comes from env GROQ_MODEL (default openai/gpt-oss-120b); function logs Groq status+message on failure; check console.groq.com/docs/deprecations before assuming a model name.
Where enforced: supabase/functions/cat/index.ts; scripts/test-cat.mjs for a real end-to-end call.
