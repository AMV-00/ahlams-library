// Usage (PowerShell, run it yourself because it has your password):
//   $env:LIB_EMAIL="..."; $env:LIB_PASSWORD="..."; node scripts/test-voice.mjs; Remove-Item Env:LIB_PASSWORD
// Usage (bash): LIB_EMAIL=... LIB_PASSWORD=... node scripts/test-voice.mjs      ROUNDS=5 for more rounds (default 3)
// Real end-to-end check of tap-to-talk with the DEPLOYED functions, no keys printed:
//   1) cat-tts makes Arabic speech from a sample question (Orpheus, voice noura)  -> used as "your recording"
//   2) cat-voice: Whisper transcribes it and the fast model streams the reply     -> transcript, first token, total
//   3) cat-tts speaks the first chunk of the reply                                 -> time to first audio byte
// Prints an estimate of "release -> first sound" (no recorder/playback overhead; the real number is in the browser console).
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const c = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const url = c.match(/SUPABASE_URL:\s*"([^"]+)"/)[1], anon = c.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
const sb = createClient(url, anon);
const { data: s, error: ae } = await sb.auth.signInWithPassword({ email: process.env.LIB_EMAIL, password: process.env.LIB_PASSWORD });
if (ae) { console.error("login failed:", ae.message); process.exit(1); }
const H = { Authorization: "Bearer " + s.session.access_token, apikey: anon };
const ms = t => Math.round(performance.now() - t) + " ms";
const fail = (m, r, b) => { console.error("FAIL", m, r && r.status, (b || "").slice(0, 300)); process.exit(1); };

// warm-up pings (same as the page does when you press the button)
let t = performance.now();
await Promise.all(["cat-voice", "cat-tts"].map(f => fetch(`${url}/functions/v1/${f}`, { method: "POST", headers: { ...H, "x-warm": "1", "Content-Type": "application/json" }, body: "{}" })));
console.log("warm-up:", ms(t));

// 1) a sample "recording"
const QUESTION = "وش أبدأ فيه الحين؟";
t = performance.now();
let r = await fetch(`${url}/functions/v1/cat-tts`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ text: QUESTION, voice: "lulwa" }) });
if (!r.ok) fail("cat-tts (sample question)", r, await r.text());
const wav = Buffer.from(await r.arrayBuffer()); console.log(`TTS sample question: ${wav.length} bytes in ${ms(t)}`);
writeFileSync(new URL("./_question.wav", import.meta.url), wav);

// 2) + 3) the voice turn, several rounds (round 1 may include a cold start)
const ROUNDS = Math.max(1, Math.min(10, +(process.env.ROUNDS || 3)));
const rows = [];
for (let n = 1; n <= ROUNDS; n++) {
  t = performance.now();
  const fd = new FormData();
  fd.set("audio", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  fd.set("meta", JSON.stringify({ messages: [], name: "Dobby", lang: "ar" }));
  r = await fetch(`${url}/functions/v1/cat-voice`, { method: "POST", headers: H, body: fd });
  if (!r.ok) fail("cat-voice", r, await r.text());
  const hdrAt = performance.now();
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "", sttAt = 0, tokAt = 0, stt = "", reply = "", server = null, firstChunkAt = 0, firstChunk = "";
  for (;;) {
    const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l.startsWith("data:")) continue;
      const j = JSON.parse(l.slice(5));
      if (j.error) fail("stream error " + JSON.stringify(j));
      if (j.stt !== undefined) { sttAt = performance.now(); stt = j.stt; }
      if (j.t) { if (!tokAt) tokAt = performance.now(); reply += j.t; if (!firstChunkAt && (/[.!?؟،,]/.test(reply) && reply.trim().split(/\s+/).length >= 3 || reply.trim().split(/\s+/).length >= 9)) { firstChunkAt = performance.now(); firstChunk = reply; } }
      if (j.done && j.ms) server = j.ms;
    }
  }
  if (!stt) fail("Whisper returned an empty transcript");
  if (!firstChunkAt) firstChunkAt = performance.now();
  // first chunk -> TTS: time to first byte AND to the whole file (tells us whether Groq streams the audio)
  const chunk = (firstChunk || reply).trim().slice(0, 200);
  const t2 = performance.now();
  r = await fetch(`${url}/functions/v1/cat-tts`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ text: chunk, voice: "noura" }) });
  if (!r.ok) fail("cat-tts (first chunk)", r, await r.text());
  const tr = r.body.getReader(), parts = []; let ttfb = 0;
  for (;;) { const { done, value } = await tr.read(); if (done) break; if (!ttfb) ttfb = performance.now() - t2; parts.push(value); }
  const out = Buffer.concat(parts.map(x => Buffer.from(x))), tts = performance.now() - t2;
  if (n === 1) {
    writeFileSync(new URL("./_reply-first-chunk.wav", import.meta.url), out);
    console.log(`\ntranscript: «${stt}»   (you said «${QUESTION}»)\nreply: ${reply}\nfirst chunk spoken: «${chunk}» (${out.length} bytes)`);
  }
  const est = (firstChunkAt - t) + tts;
  rows.push({ round: n, headers: Math.round(hdrAt - t), transcript: Math.round(sttAt - t), whisper_server: server ? server.stt : null,
    first_token: Math.round(tokAt - t), first_chunk: Math.round(firstChunkAt - t), tts_first_byte: Math.round(ttfb), tts_total: Math.round(tts), first_sound_est: Math.round(est) });
}
console.log("\nms after the recording is sent (headers = upload + Edge Function start):");
console.table(rows);
const med = k => { const v = rows.map(x => x[k]).filter(x => typeof x === "number").sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const m = med("first_sound_est");
console.log(`median: transcript ${med("transcript")} | first token ${med("first_token")} | first chunk ${med("first_chunk")} | TTS first byte ${med("tts_first_byte")} / whole ${med("tts_total")}`);
console.log(`\n⏱ median estimate stop → first sound: ${m} ms ${m < 2000 ? "✓ under 2 s" : "✗ over 2 s"}  (browser adds ~50-150 ms for recorder + decode; exact figures: LibDobby.times() in the page console)`);
if (med("tts_total") - med("tts_first_byte") > 300) console.log("note: TTS bytes arrive progressively -> playing the WAV while it downloads would save about", med("tts_total") - med("tts_first_byte"), "ms");
console.log("saved scripts/_question.wav and scripts/_reply-first-chunk.wav so you can listen to Noura");
