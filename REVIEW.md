# Review focus
- No secret in repo/browser: Groq key, service-role key, tokens. Run `npm run check`.
- RLS: anon has no access; sign-ups stay disabled.
- Edge Function: JWT required, key only from `Deno.env`, CORS limited to ALLOWED_ORIGINS.
- XSS: all item text goes through `esc()`; URLs through `safeUrl()`.
- Arabic/RTL layout, phone width (no horizontal scroll).
