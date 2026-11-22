// Usage (PowerShell):
//   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_ANON_KEY="..."
//   $env:LIB_EMAIL="you@..."; $env:LIB_PASSWORD="..."; node scripts/seed.mjs
// Signs in as you (RLS applies) and upserts data/seed.json. No service-role key needed.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_ANON_KEY, LIB_EMAIL, LIB_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !LIB_EMAIL || !LIB_PASSWORD) { console.error("missing env vars"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { error: ae } = await sb.auth.signInWithPassword({ email: LIB_EMAIL, password: LIB_PASSWORD });
if (ae) { console.error("login failed:", ae.message); process.exit(1); }
const seed = JSON.parse(readFileSync(new URL("../data/seed.json", import.meta.url)));
const rows = seed.items.map(({ slug, ...r }) => ({ id: slug, ...r }));
const { error: ie } = await sb.from("items").upsert(rows);
if (ie) { console.error("items:", ie.message); process.exit(1); }
const cfg = Object.entries(seed.config).map(([key, value]) => ({ key, value }));
const { error: ce } = await sb.from("config").upsert(cfg);
if (ce) { console.error("config:", ce.message); process.exit(1); }
const { count } = await sb.from("items").select("*", { count: "exact", head: true });
console.log(`seeded ${rows.length} items, ${cfg.length} config rows; table now has ${count} items`);
