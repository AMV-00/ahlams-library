// Usage (bash): LIB_EMAIL=... LIB_PASSWORD=... node scripts/test-cat.mjs
// Signs in, calls the deployed `cat` function, prints status + reply (never any key).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const c = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const url = c.match(/SUPABASE_URL:\s*"([^"]+)"/)[1], anon = c.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
const sb = createClient(url, anon);
const { error: ae } = await sb.auth.signInWithPassword({ email: process.env.LIB_EMAIL, password: process.env.LIB_PASSWORD });
if (ae) { console.error("login failed:", ae.message); process.exit(1); }
const { data, error } = await sb.functions.invoke("cat", { body: { messages: [{ role: "user", content: "وش أبدأ فيه الحين؟" }] } });
if (error) {
  let body = ""; try { body = JSON.stringify(await error.context.json()); } catch {}
  console.error("FAIL:", error.message, body); process.exit(1);
}
console.log("OK reply:", data.text.slice(0, 300));
