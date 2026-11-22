// Usage (bash): LIB_EMAIL=... LIB_PASSWORD=... node scripts/test-voice.mjs
// Checks the REAL voice path end to end and prints timings. Prints no keys.
//   1) cat (voice mode, streaming): time to first token + reply
//   2) cat-tts (Groq Orpheus Arabic): status, bytes, WAV header, latency; saves scripts/_tts-sample.wav
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const c = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const url = c.match(/SUPABASE_URL:\s*"([^"]+)"/)[1], anon = c.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
const sb = createClient(url, anon);
const { data: s, error: ae } = await sb.auth.signInWithPassword({ email: process.env.LIB_EMAIL, password: process.env.LIB_PASSWORD });
if (ae) { console.error("login failed:", ae.message); process.exit(1); }
const H = { Authorization: "Bearer " + s.session.access_token, apikey: anon, "Content-Type": "application/json" };

let t0 = Date.now(), first = null, full = "";
const r = await fetch(`${url}/functions/v1/cat`, { method: "POST", headers: H,
  body: JSON.stringify({ mode: "voice", stream: true, messages: [{ role: "user", content: "وش أبدأ فيه الحين؟" }] }) });
if (!r.ok) { console.error("CAT FAIL", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
  let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!l.startsWith("data:") || l.includes("[DONE]")) continue;
    try { const d = JSON.parse(l.slice(5)).choices[0].delta.content; if (d) { if (first === null) first = Date.now() - t0; full += d; } } catch {} } }
console.log(`CAT OK  first token ${first} ms, total ${Date.now() - t0} ms\n  reply: ${full}`);

t0 = Date.now();
const sentence = full.split(/(?<=[.!?؟])\s/)[0].slice(0, 200) || "مرحبا، أنا دوبي.";
for (const voice of ["noura"]) {
  const t = await fetch(`${url}/functions/v1/cat-tts`, { method: "POST", headers: H, body: JSON.stringify({ text: sentence, voice }) });
  if (!t.ok) { console.error("TTS FAIL", t.status, (await t.text()).slice(0, 300)); process.exit(1); }
  const b = Buffer.from(await t.arrayBuffer());
  writeFileSync(new URL("./_tts-sample.wav", import.meta.url), b);
  console.log(`TTS OK  ${voice}: ${b.length} bytes, header ${b.subarray(0, 4).toString()}/${b.subarray(8, 12).toString()}, ${Date.now() - t0} ms -> scripts/_tts-sample.wav`);
}
