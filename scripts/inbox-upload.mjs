// Uploads inbox/*.json into Supabase `items`, then deletes the processed files.
// Runs in GitHub Actions (see .github/workflows/inbox.yml). Locally: `npm run inbox:check` validates only.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (GitHub Secret; bypasses RLS, never in the browser or repo).
//
// File shapes accepted (see inbox/README.md):
//   { "items": [ {...}, ... ], "delete": ["id", ...], "prune_expired": ["c-jobs", "c-madinah"] }
//   [ {...}, ... ]            // just items
//   { "id": "...", ... }      // one item
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("../inbox/", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");
const FIELDS = ["title", "title_en", "tab", "type", "sub", "summary_ar", "summary_en", "url", "file_url", "status", "due", "added", "notes"];
const ID = /^[a-z0-9][a-z0-9-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(raw, where) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${where}: item must be an object`);
  const id = String(raw.id ?? raw.slug ?? "").trim().toLowerCase();
  if (!ID.test(id)) throw new Error(`${where}: bad id "${id}" (a-z, 0-9, -)`);
  const row = { id };
  for (const k of FIELDS) {
    if (!(k in raw)) continue;
    let v = raw[k];
    if (v === "" ) v = null;
    if (k === "status") {
      if (![0, 1, 2].includes(v)) throw new Error(`${where} ${id}: status must be 0, 1 or 2`);
    } else if (k === "due" || k === "added") {
      if (v !== null && !(typeof v === "string" && DATE.test(v))) throw new Error(`${where} ${id}: ${k} must be YYYY-MM-DD`);
    } else if (v !== null) {
      if (typeof v !== "string") throw new Error(`${where} ${id}: ${k} must be text`);
      v = v.trim().slice(0, 4000);
      if ((k === "url" || k === "file_url") && !/^https?:\/\//i.test(v)) throw new Error(`${where} ${id}: ${k} must start with http(s)://`);
    }
    row[k] = v;
  }
  for (const k of Object.keys(raw)) if (k !== "id" && k !== "slug" && !FIELDS.includes(k)) throw new Error(`${where} ${id}: unknown field "${k}"`);
  return row;
}

function parse(file) {
  const j = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const doc = Array.isArray(j) ? { items: j } : ("items" in j || "delete" in j || "prune_expired" in j) ? j : { items: [j] };
  const items = (doc.items || []).map((r, i) => clean(r, `${file}[${i}]`));
  const del = (doc.delete || []).map(String);
  for (const d of del) if (!ID.test(d)) throw new Error(`${file}: bad delete id "${d}"`);
  const prune = (doc.prune_expired || []).map(String);
  return { items, del, prune };
}

const files = readdirSync(DIR).filter(f => f.endsWith(".json") && !f.startsWith("_")).sort();
if (!files.length) { console.log("inbox: nothing to upload"); process.exit(0); }
const parsed = files.map(f => [f, parse(f)]); // throws (and fails the run) before touching the DB
if (DRY) { for (const [f, p] of parsed) console.log(`ok ${f}: ${p.items.length} items, ${p.del.length} deletes, prune ${p.prune.join(",") || "-"}`); process.exit(0); }

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error("missing SUPABASE_URL or SUPABASE_SECRET_KEY"); process.exit(1); }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

for (const [file, { items, del, prune }] of parsed) {
  const existing = must(await sb.from("items").select("id,title,tab,url"), "read items");
  const ids = new Set(existing.map(x => x.id));
  const urls = new Set(existing.filter(x => x.url).map(x => x.url.replace(/\/+$/, "")));
  const titles = new Set(existing.map(x => `${x.tab}|${norm(x.title)}`));
  let added = 0, updated = 0, skipped = 0, removed = 0;
  for (const row of items) {
    if (ids.has(row.id)) { // update only the fields given, so her status/notes edits survive
      const { id, ...patch } = row;
      if (Object.keys(patch).length) { must(await sb.from("items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), `update ${id}`); updated++; }
      continue;
    }
    if (!row.title) throw new Error(`${file} ${row.id}: new item needs a title`);
    const dupUrl = row.url && urls.has(row.url.replace(/\/+$/, ""));
    const dupTitle = titles.has(`${row.tab || "misc"}|${norm(row.title)}`);
    if (dupUrl || dupTitle) { console.log(`skip ${row.id}: duplicate ${dupUrl ? "url" : "title"}`); skipped++; continue; }
    must(await sb.from("items").insert({ status: 0, ...row }), `insert ${row.id}`);
    ids.add(row.id); if (row.url) urls.add(row.url.replace(/\/+$/, "")); titles.add(`${row.tab || "misc"}|${norm(row.title)}`);
    added++;
  }
  if (del.length) removed += must(await sb.from("items").delete().in("id", del).select("id"), "delete").length;
  if (prune.length) {
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    removed += must(await sb.from("items").delete().in("tab", prune).eq("status", 0).lt("due", cutoff).select("id"), "prune").length;
  }
  unlinkSync(join(DIR, file));
  console.log(`${file}: +${added} new, ${updated} updated, ${skipped} duplicates skipped, ${removed} removed`);
}
