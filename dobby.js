/* Dobby voice conversation: wake word -> capture -> streamed fast reply -> Groq Orpheus TTS (browser voice fallback).
   Uses the browser's SpeechRecognition (ar-SA). Needs HTTPS + mic permission. */
(function () {
"use strict";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_MS = 1500, NO_QUESTION_MS = 8000, FOLLOW_MS = 8000;
const D = "[\\u064B-\\u0652]*";                                   // optional Arabic diacritics
const DEFAULT_WAKE = `(?:\\u062F${D}[\\u0648\\u0624]${D}\\u0628${D}\\u0651?[\\u064A\\u0649\\u0626]${D}|\\u0630${D}[\\u0648\\u0624]${D}\\u0628${D}[\\u064A\\u0649]${D}|\\u062F\\u0627\\u0628${D}[\\u064A\\u0649]|dobb?y|dobi)`;
const SEP = "[\\s\\u060C,.!\\u061F?]";
const A = () => window.LibApp;
const $ = id => document.getElementById(id);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

let on = false, rec = null, state = "off";          // off | waiting | capturing | thinking | speaking
let followFrom = 0, consumed = 0, captured = "", capStart = 0, silenceT = null, restartT = null, followUntil = 0, netErrors = 0;
let ctrl = null, spokenText = "";
const audio = new Audio();
const player = { gen: 0, q: [], running: false, done: null };

/* ---------- status UI ---------- */
const MSG = {
  ar: { waiting: "أسمعك… قولي «دوبي»", follow: "أسمعك…", capturing: "أسمعك: ", thinking: "أفكر…", speaking: "أتكلم… قاطعيني بصوتك",
        denied: "ما قدرت أستخدم المايك. اسمحي للموقع من إعدادات المتصفح.", bg: "وقفت الاستماع لأن الصفحة صارت بالخلفية.", unsupported: "المتصفح ما يدعم الاستماع.", net: "الاستماع تقطّع. اضغطي 🎙 مرة ثانية." },
  en: { waiting: "Listening… say \"Dobby\"", follow: "Listening…", capturing: "Hearing: ", thinking: "Thinking…", speaking: "Speaking… talk to interrupt",
        denied: "Couldn't use the microphone. Allow it in the browser's site settings.", bg: "Stopped listening: the page went to the background.", unsupported: "This browser can't do speech recognition.", net: "Listening dropped. Press 🎙 again." }
};
const L = () => MSG[A().lang()] || MSG.ar;
function show(s, text) {
  state = s;
  const el = $("vstatus"); if (!el) return;
  el.hidden = s === "off" && !text; el.dataset.s = s;
  $("vtext").textContent = text != null ? text : (s === "waiting" ? (Date.now() < followUntil ? L().follow : L().waiting) : s === "capturing" ? L().capturing + captured : L()[s] || "");
  $("listenBtn").setAttribute("aria-pressed", on);
  $("cat").classList.toggle("ear", on); $("cat").classList.toggle("hot", s === "capturing");
}
function refreshStatus() { if (on) show(state); }

/* ---------- wake word ---------- */
function wakeRegex() {
  const n = (A().name() || "").trim(), custom = n && !/^(دوبي|dobby)$/i.test(n) ? `|${escRe(n)}` : "";
  return new RegExp(`(?:^|${SEP})(?:\\u064A\\u0627\\s*)?(?:${DEFAULT_WAKE}${custom})(?=$|${SEP})`, "i");
}
function afterWake(text) { const m = wakeRegex().exec(text); return m ? text.slice(m.index + m[0].length).replace(/^[\s،,.!؟?]+/, "") : null; }

/* ---------- recognition ---------- */
function startRec() {
  if (!on) return;
  rec = new SR(); rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  consumed = 0;
  rec.onresult = onResult;
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { stopAll(L().denied); }
    else if (e.error === "audio-capture") { stopAll(L().denied); }
    else if (e.error === "network") { if (++netErrors >= 3) stopAll(L().net); }
  };
  rec.onend = () => { if (on) { clearTimeout(restartT); restartT = setTimeout(startRec, 250); } };
  try { rec.start(); } catch (e) { restartT = setTimeout(startRec, 500); }
}
function sessionText() { // text of the results not yet consumed
  const r = rec && rec.__results ? rec.__results : [];
  return Array.from(r).slice(consumed).map(x => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
}
function onResult(e) {
  rec.__results = e.results;
  const last = e.results[e.results.length - 1], text = sessionText(), final = !!last.isFinal;
  netErrors = 0;
  if (state === "waiting") {
    const rest = afterWake(text);
    if (rest !== null) beginCapture(rest);
    else if (Date.now() >= followFrom && Date.now() < followUntil && norm(text).length >= 2 && !norm(spokenText).includes(norm(text))) beginCapture(text);
    else if (final) consumed = e.results.length;
  } else if (state === "capturing") {
    const rest = afterWake(text);
    captured = (rest !== null ? rest : text).trim(); show("capturing"); armSilence();
  } else if (state === "thinking" || state === "speaking") {
    const rest = afterWake(text), words = norm(text).split(" ").filter(Boolean);
    const heard = norm(text), echo = heard && norm(spokenText).includes(heard);   // our own voice coming back through the speakers
    if (rest !== null || (!echo && (words.length >= 2 || heard.length >= 6))) { bargeIn(rest !== null ? rest : text); }
    else if (final) consumed = e.results.length;
  }
}
function beginCapture(initial) {
  captured = (initial || "").trim(); capStart = Date.now(); show("capturing"); A().openChat(true); armSilence();
}
function armSilence() { clearTimeout(silenceT); silenceT = setTimeout(onSilence, SILENCE_MS); }
function onSilence() {
  if (state !== "capturing") return;
  if (norm(captured).length >= 2) { const q = captured; captured = ""; send(q); }
  else if (Date.now() - capStart > NO_QUESTION_MS) { show("waiting"); }
  else silenceT = setTimeout(onSilence, 500);
}
function resetRec() { try { rec && (rec.onend = null, rec.abort()); } catch (e) {} clearTimeout(restartT); if (on) startRec(); }

/* ---------- playback ---------- */
const arabicish = t => (t.match(/[؀-ۿ]/g) || []).length >= (t.match(/[A-Za-z]/g) || []).length;
let ttsBrokenUntil = 0;
async function fetchWav(text, gen) {
  const app = A(), tok = await app.token();
  const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat-tts`, {
    method: "POST", signal: ctrl && ctrl.signal,
    headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 200), voice: app.ttsVoice() })
  });
  if (!r.ok) throw new Error("tts " + r.status);
  return URL.createObjectURL(await r.blob());
}
function playUrl(url, gen) {
  return new Promise(res => {
    const fin = () => { audio.onended = audio.onerror = null; player.cancel = null; URL.revokeObjectURL(url); res(); };
    player.cancel = fin; audio.onended = audio.onerror = fin; audio.src = url;
    const p = audio.play(); if (p && p.catch) p.catch(fin);
  });
}
function enqueue(sentence) {
  const text = window.LibVoice.clean(sentence); if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
  const gen = player.gen, useGroq = Date.now() > ttsBrokenUntil && arabicish(text);
  const item = { text, gen, wav: useGroq ? fetchWav(text, gen).catch(err => { if (gen === player.gen) { ttsBrokenUntil = Date.now() + 300000; console.warn("Groq TTS failed, using browser voice:", err.message); } return null; }) : Promise.resolve(null) };
  player.q.push(item); pump();
}
async function pump() {
  if (player.running) return; player.running = true;
  while (player.q.length) {
    const it = player.q.shift();
    if (it.gen !== player.gen) continue;
    if (state === "thinking") show("speaking");
    const url = await it.wav;
    if (it.gen !== player.gen) { if (url) URL.revokeObjectURL(url); continue; }
    if (url) await playUrl(url, it.gen); else await window.LibVoice.speakOne(it.text);
  }
  player.running = false;
  if (player.done) { const d = player.done; player.done = null; d(); }
}
function stopPlayback() {
  player.gen++; player.q = [];
  try { audio.pause(); } catch (e) {}
  if (player.cancel) player.cancel();
  window.LibVoice.stop();
}
function whenIdle() { return new Promise(res => { if (!player.running && !player.q.length) res(); else player.done = res; }); }

/* ---------- ask + stream ---------- */
function takeSentences(buf, first) {
  const out = [];
  for (;;) {
    let cut = -1;
    const m = /[!?؟…\n]|\.(?=\s)/.exec(buf); if (m) cut = m.index + 1;
    if (first) {                                   // let the very first chunk start early at a comma (>= 25 chars)
      const rc = /[،,]/g; let c;
      while ((c = rc.exec(buf))) if (c.index + 1 >= 25) { if (cut < 0 || c.index + 1 < cut) cut = c.index + 1; break; }
    }
    if (cut < 0) {
      if (buf.length > 190) { let i = Math.max(buf.lastIndexOf("،", 190), buf.lastIndexOf(",", 190), buf.lastIndexOf(" ", 190)); if (i < 40) i = 190; cut = i + 1; }
      else break;
    }
    out.push(buf.slice(0, cut)); buf = buf.slice(cut); first = false;
  }
  return [out, buf];
}
async function send(question) {
  const app = A();
  if (app.busy()) return;
  app.setBusy(true); stopPlayback(); spokenText = "";
  show("thinking"); resetRec(); consumed = 0;
  app.addMsg("me", question); app.setPose("think");
  const bubble = app.addMsg("cat", "…", false);
  ctrl = new AbortController(); const myCtrl = ctrl;
  let full = "", pending = "", first = true, ok = false;
  try {
    const tok = await app.token();
    const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat`, {
      method: "POST", signal: myCtrl.signal,
      headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: app.history(), name: app.name(), mode: "voice", stream: true })
    });
    if (!r.ok) { let b = ""; try { b = await r.text(); } catch (e) {} console.error("cat voice error", r.status, b.slice(0, 300)); throw new Error("http " + r.status); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let sse = "";
    app.setPose("explain");
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      sse += dec.decode(value, { stream: true });
      let nl; while ((nl = sse.indexOf("\n")) >= 0) {
        const line = sse.slice(0, nl).trim(); sse = sse.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim(); if (payload === "[DONE]") continue;
        let j; try { j = JSON.parse(payload); } catch (e) { continue; }
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (!delta) continue;
        full += delta; pending += delta; bubble.textContent = full; $("msgs").scrollTop = 1e9;
        const [sents, rest] = takeSentences(pending, first); pending = rest;
        for (const s of sents) { first = false; spokenText += " " + s; enqueue(s); }
      }
    }
    if (pending.trim()) { spokenText += " " + pending; enqueue(pending); pending = ""; }
    ok = full.trim().length > 0; if (!ok) throw new Error("empty");
    app.setReply(bubble, full); app.history().push({ role: "assistant", content: full });   // (addMsg already logged the question)
    await whenIdle();
  } catch (e) {
    if (myCtrl.signal.aborted) {                 // interrupted by the user: keep what we have in the log
      if (full.trim()) { app.setReply(bubble, full); app.history().push({ role: "assistant", content: full }); }
      else { bubble.closest(".m").remove(); app.history().pop(); }
    } else { console.error(e); bubble.textContent = A().C().err; app.history().pop(); }
  } finally {
    app.setBusy(false); app.setPose("happy");
    if (on && state !== "capturing") { followFrom = Date.now() + 700; followUntil = followFrom + FOLLOW_MS; show("waiting"); }
  }
}
function bargeIn(text) {
  if (ctrl) ctrl.abort(); stopPlayback(); spokenText = "";
  const rest = afterWake(text); beginCapture(rest !== null ? rest : text);
}

/* ---------- on / off ---------- */
function unlockAudio() { try { audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; const p = audio.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function start() {
  if (!SR) { show("off", MSG.ar.unsupported); return; }
  on = true; netErrors = 0; followUntil = 0; unlockAudio(); show("waiting"); startRec();
}
function stopAll(msg) {
  on = false; clearTimeout(silenceT); clearTimeout(restartT);
  try { rec && (rec.onend = null, rec.abort()); } catch (e) {}
  if (ctrl) ctrl.abort(); stopPlayback(); captured = "";
  show("off", msg || null); if (!msg) $("vstatus").hidden = true;
  $("cat").classList.remove("ear", "hot"); $("listenBtn").setAttribute("aria-pressed", "false");
  if (msg) setTimeout(() => { if (!on) $("vstatus").hidden = true; }, 6000);
}
document.addEventListener("click", e => { if (e.target.closest("#listenBtn")) { on ? stopAll() : start(); } });
document.addEventListener("visibilitychange", () => { if (document.hidden && on) stopAll(L().bg); });
addEventListener("pagehide", () => { if (on) stopAll(); });

window.LibDobby = { start, stop: () => stopAll(), refreshStatus, isOn: () => on, state: () => state, _afterWake: afterWake, _take: takeSentences };
})();
