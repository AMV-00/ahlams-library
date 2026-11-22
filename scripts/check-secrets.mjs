// Pre-publish scan: fails if any tracked/to-be-published file contains a secret-looking value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const SKIP = new Set([".git", "node_modules", "data"]);
const PATTERNS = [
  [/gsk_[A-Za-z0-9]{20,}/, "Groq key"],
  [/sk-[A-Za-z0-9_-]{20,}/, "API key (sk-)"],
  [/sbp_[a-f0-9]{30,}/, "Supabase access token"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, "GitHub token"],
  [/service_role/i, "service_role mention"],
  [/GROQ_API_KEY\s*[:=]\s*["'][^"']+["']/, "hardcoded GROQ_API_KEY"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];
// JWTs: allow only an anon-role one (public by design); flag any other role.
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
let bad = 0;
(function walk(d) {
  for (const f of readdirSync(d)) {
    if (SKIP.has(f)) continue;
    const p = join(d, f), s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(f) || f === "check-secrets.mjs") continue;
    const t = readFileSync(p, "utf8");
    for (const [re, name] of PATTERNS) if (re.test(t)) { console.error(`FAIL ${p}: ${name}`); bad++; }
    for (const m of t.matchAll(JWT)) {
      let role = "?"; try { role = JSON.parse(Buffer.from(m[1], "base64url").toString()).role; } catch {}
      if (role !== "anon") { console.error(`FAIL ${p}: JWT with role=${role}`); bad++; }
    }
  }
})(".");
if (bad) { console.error(`${bad} problem(s)`); process.exit(1); }
console.log("secret scan: clean");
