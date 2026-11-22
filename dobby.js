/* Dobby voice conversation: wake word (fuzzy) -> capture -> streamed fast reply -> Groq Orpheus TTS (browser voice fallback).
   Uses the browser's SpeechRecognition (ar-SA). Needs HTTPS + mic permission. Everything is logged to the console with "[dobby]". */
(function () {
"use strict";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_MS = 1500, NO_QUESTION_MS = 8000, FOLLOW_MS = 8000, FIRST_PRESS_MS = 12000;
const A = () => window.LibApp;
const $ = id => document.getElementById(id);
const log = (...a) => console.log("[dobby]", ...a);
const warn = (...a) => console.warn("[dobby]", ...a);
const err = (...a) => console.error("[dobby]", ...a);

/* ---------- text helpers ---------- */
const strip = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]/gu, "");
const collapse = s => s.replace(/(.)\1+/g, "$1");
const norm = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const isClear = t => { const n = norm(t); return n.split(" ").filter(Boolean).length >= 2 || n.length >= 6; };

/* ---------- fuzzy wake word ----------
   Arabic: starts with د/ذ and its consonant skeleton is "دب"  (دوبي دوبى دبي دوبيي دابي ذوبي دوبه دوب ديب…)
   Latin : d + vowels + b(+) + vowels   (dobby doby dobi dubi dubai…)
   Custom name set in settings: edit distance <= 1.  Also joins split tokens ("دو بي") and strips a glued "يا". */
function isWakeWord(raw) {
  let w = collapse(strip(raw)); if (w.length < 3 || w.length > 9) return false;
  w = w.replace(/^يا(?=[دذ])/, "");
  if (/^[a-z]+$/.test(w)) { if (w.length >= 4 && /^d[aeiou]+[bp][aeiouy]*$/.test(w) && !/^(dope|dupe|dopa)$/.test(w)) return true; }
  else if (/^[دذ]/.test(w)) { if (w.replace(/[اويىه]/g, "").replace(/ذ/g, "د") === "دب") return true; }
  const n = collapse(strip((A() && A().name()) || ""));
  if (n && !/^(دوبي|dobby)$/i.test(n)) { if (n.length >= 4 ? lev(w, n) <= 1 : w === n) return true; }
  return false;
}
function tokens(text) { const out = [], re = /[^\s،,.!?؟;:"«»()]+/gu; let m; while ((m = re.exec(text))) out.push({ w: m[0], e: m.index + m[0].length }); return out; }
function afterWake(text) {
  const t = tokens(text), rest = e => text.slice(e).replace(/^[\s،,.!؟?]+/, "");
  for (let i = 0; i < t.length; i++) {
    if (isWakeWord(t[i].w)) return rest(t[i].e);
    if (i + 1 < t.length && t[i].w.length <= 3 && t[i + 1].w.length <= 3 && isWakeWord(t[i].w + t[i + 1].w)) return rest(t[i + 1].e);
  }
  return null;
}

/* ---------- state ---------- */
let on = false, rec = null, state = "off";          // off | waiting | capturing | thinking | speaking
let followFrom = 0, followUntil = 0, consumed = 0, captured = "", capStart = 0, silenceT = null, restartT = null, netErrors = 0, heardT = null;
let ctrl = null, spokenText = "";
const audio = new Audio();
const player = { gen: 0, q: [], running: false, done: null, cancel: null };

/* ---------- status UI ---------- */
const MSG = {
  ar: { waiting: "أسمعك… قولي «دوبي»", follow: "أسمعك… قولي «دوبي» أو اسألي مباشرة", capturing: "أسمعك…", thinking: "أفكر…", speaking: "أتكلم… قاطعيني بصوتك",
        denied: "ما قدرت أستخدم المايك. اسمحي للموقع من إعدادات المتصفح.", bg: "وقفت الاستماع لأن الصفحة صارت بالخلفية.", unsupported: "المتصفح ما يدعم الاستماع.", net: "ما قدرت أوصل لخدمة التعرف على الصوت (network). تأكدي من الإنترنت ثم اضغطي 🎙 مرة ثانية.",
        mic: "المايك شغّال ✓", nomatch: "ما فهمت الكلام" },
  en: { waiting: "Listening… say \"Dobby\"", follow: "Listening… say \"Dobby\" or just ask", capturing: "Hearing you…", thinking: "Thinking…", speaking: "Speaking… talk to interrupt",
        denied: "Couldn't use the microphone. Allow it in the browser's site settings.", bg: "Stopped listening: the page went to the background.", unsupported: "This browser can't do speech recognition.", net: "Couldn't reach the speech-recognition service (network). Check your connection, then press 🎙 again.",
        mic: "Microphone is on ✓", nomatch: "Didn't catch that" }
};
const L = () => MSG[A().lang()] || MSG.ar;
function setHeard(text, keepMs) {
  const el = $("vheard"); if (!el) return;
  clearTimeout(heardT);
  const t = String(text || "").trim(), shown = t ? (t.includes("✓") || keepMs ? t : "🎧 " + t.slice(-110)) : "";
  el.textContent = shown; el.hidden = !t;
  if (keepMs) heardT = setTimeout(() => { if (el.textContent === shown) { el.textContent = ""; el.hidden = true; } }, keepMs);
}
function show(s, text) {
  state = s;
  const el = $("vstatus"); if (!el) return;
  el.hidden = s === "off" && !text; el.dataset.s = s;
  $("vtext").textContent = text != null ? text : (s === "waiting" ? (Date.now() < followUntil ? L().follow : L().waiting) : L()[s] || "");
  if (s === "off") setHeard("");
  $("listenBtn").setAttribute("aria-pressed", on);
  $("cat").classList.toggle("ear", on); $("cat").classList.toggle("hot", s === "capturing");
}
function refreshStatus() { if (on) show(state); }

/* ---------- recognition ---------- */
function startRec() {
  if (!on) return;
  rec = new SR(); rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  consumed = 0;
  rec.onstart = () => log("recognition started (ar-SA, continuous)");
  rec.onaudiostart = () => { log("audio capture started (microphone is live)"); if (!$("vheard").textContent) setHeard(L().mic); };
  rec.onsoundstart = () => log("sound detected");
  rec.onspeechstart = () => log("speech detected");
  rec.onspeechend = () => log("speech ended");
  rec.onnomatch = () => { warn("no match"); setHeard(L().nomatch, 3000); };
  rec.onresult = onResult;
  rec.onerror = e => {
    err("recognition error:", e.error, e.message || ""); if (e.error !== "no-speech" && e.error !== "aborted") setHeard((A().lang() === "ar" ? "خطأ: " : "Error: ") + e.error, 8000);
    if (e.error === "not-allowed" || e.error === "service-not-allowed") stopAll(L().denied);
    else if (e.error === "audio-capture") stopAll(L().denied);
    else if (e.error === "network") { if (++netErrors >= 3) stopAll(L().net); }
  };
  rec.onend = () => { log("recognition ended" + (on ? ", restarting" : "")); if (on) { clearTimeout(restartT); restartT = setTimeout(startRec, 250); } };
  try { rec.start(); } catch (e) { err("rec.start failed:", e); restartT = setTimeout(startRec, 500); }
}
function sessionText() { // text of the results not yet consumed
  const r = rec && rec.__results ? rec.__results : [];
  return Array.from(r).slice(consumed).map(x => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
}
function onResult(e) {
  rec.__results = e.results;
  const last = e.results[e.results.length - 1], text = sessionText(), final = !!last.isFinal;
  netErrors = 0;
  log(final ? "heard (final):" : "heard (interim):", JSON.stringify(text), "| state:", state);
  setHeard(text);                                    // live: exactly what the browser wrote
  if (state === "waiting") {
    const rest = afterWake(text), inWindow = Date.now() >= followFrom && Date.now() < followUntil;
    if (rest !== null) { log("wake word matched; question so far:", JSON.stringify(rest)); beginCapture(rest); }
    else if (inWindow && isClear(text) && !norm(spokenText).includes(norm(text))) { log("no wake word, but a clear sentence inside the listening window -> treating it as the question"); beginCapture(text); }
    else if (final) consumed = e.results.length;
  } else if (state === "capturing") {
    const rest = afterWake(text);
    captured = (rest !== null ? rest : text).trim(); show("capturing"); armSilence();
  } else if (state === "thinking" || state === "speaking") {
    const rest = afterWake(text), heard = norm(text), words = heard.split(" ").filter(Boolean);
    const echo = heard && norm(spokenText).includes(heard);   // our own voice coming back through the speakers
    if (rest !== null || (!echo && (words.length >= 2 || heard.length >= 6))) { log("barge-in:", JSON.stringify(text)); bargeIn(rest !== null ? rest : text); }
    else if (final) consumed = e.results.length;
  }
}
function beginCapture(initial) {
  captured = (initial || "").trim(); capStart = Date.now(); show("capturing"); A().openChat(true); armSilence();
}
function armSilence() { clearTimeout(silenceT); silenceT = setTimeout(onSilence, SILENCE_MS); }
function onSilence() {
  if (state !== "capturing") return;
  if (norm(captured).length >= 2) { const q = captured; captured = ""; log("silence 1.5 s -> sending:", JSON.stringify(q)); send(q); }
  else if (Date.now() - capStart > NO_QUESTION_MS) { log("heard the name but no question within 8 s"); show("waiting"); }
  else silenceT = setTimeout(onSilence, 500);
}
function resetRec() { try { rec && (rec.onend = null, rec.abort()); } catch (e) {} clearTimeout(restartT); if (on) startRec(); }

/* ---------- playback ---------- */
const arabicish = t => (t.match(/[؀-ۿ]/g) || []).length >= (t.match(/[A-Za-z]/g) || []).length;
let ttsBrokenUntil = 0;
async function fetchWav(text) {
  const app = A(), tok = await app.token();
  const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat-tts`, {
    method: "POST", signal: ctrl && ctrl.signal,
    headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 200), voice: app.ttsVoice() })
  });
  if (!r.ok) { let b = ""; try { b = (await r.text()).slice(0, 200); } catch (e) {} throw new Error("tts " + r.status + " " + b); }
  return URL.createObjectURL(await r.blob());
}
function playUrl(url) {
  return new Promise(res => {
    const fin = () => { audio.onended = audio.onerror = null; player.cancel = null; URL.revokeObjectURL(url); res(); };
    player.cancel = fin; audio.onended = audio.onerror = fin; audio.src = url;
    const p = audio.play(); if (p && p.catch) p.catch(e => { warn("audio.play blocked:", e && e.message); fin(); });
  });
}
function enqueue(sentence) {
  const text = window.LibVoice.clean(sentence);
  if (!text || !/[\p{L}\p{N}]/u.test(text) || /[|]|-{3,}/.test(sentence)) return;      // never speak table fragments
  const gen = player.gen, useGroq = Date.now() > ttsBrokenUntil && arabicish(text);
  const item = { text, gen, wav: useGroq ? fetchWav(text).catch(e => { if (gen === player.gen) { ttsBrokenUntil = Date.now() + 300000; warn("Groq TTS failed, using the browser voice for 5 min:", e.message); } return null; }) : Promise.resolve(null) };
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
    if (url) await playUrl(url); else await window.LibVoice.speakOne(it.text);
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

/** Read a WRITTEN reply aloud: short spoken version (no tables / code), through the same Groq voice. */
function say(markdown) {
  const text = window.LibVoice.shortSpoken(markdown); if (!text) return;
  ctrl = new AbortController(); stopPlayback(); spokenText = text;
  for (const s of window.LibVoice.split(text)) enqueue(s);
}

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
  if (app.busy()) { warn("busy, ignoring:", question); return; }
  app.setBusy(true); stopPlayback(); spokenText = "";
  show("thinking"); resetRec(); consumed = 0;
  app.addMsg("me", question); app.setPose("think");
  const bubble = app.addMsg("cat", "…", false);
  ctrl = new AbortController(); const myCtrl = ctrl;
  let full = "", pending = "", first = true, tFirst = null; const t0 = Date.now();
  try {
    const tok = await app.token();
    const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat`, {
      method: "POST", signal: myCtrl.signal,
      headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: app.history(), name: app.name(), mode: "voice", stream: true })
    });
    if (!r.ok) { let b = ""; try { b = await r.text(); } catch (e) {} err("cat (voice) failed:", r.status, b.slice(0, 300)); throw new Error("http " + r.status); }
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
        if (tFirst === null) { tFirst = Date.now() - t0; log("first token after", tFirst, "ms"); }
        full += delta; pending += delta; bubble.textContent = full; $("msgs").scrollTop = 1e9;
        const [sents, rest] = takeSentences(pending, first); pending = rest;
        for (const s of sents) { first = false; spokenText += " " + s; enqueue(s); }
      }
    }
    if (pending.trim()) { spokenText += " " + pending; enqueue(pending); pending = ""; }
    if (!full.trim()) throw new Error("empty reply");
    app.setReply(bubble, full); app.history().push({ role: "assistant", content: full });   // (addMsg already logged the question)
    await whenIdle();
  } catch (e) {
    if (myCtrl.signal.aborted) {                 // interrupted by the user: keep what we have in the log
      if (full.trim()) { app.setReply(bubble, full); app.history().push({ role: "assistant", content: full }); }
      else { bubble.closest(".m").remove(); app.history().pop(); }
    } else { err("voice turn failed:", e); bubble.textContent = A().C().err; app.history().pop(); }
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
  if (!SR) { err("SpeechRecognition is not available in this browser"); show("off", MSG.ar.unsupported); return; }
  on = true; netErrors = 0; unlockAudio();
  followFrom = Date.now(); followUntil = followFrom + FIRST_PRESS_MS;     // first 12 s: a clear sentence counts as a question even without "دوبي"
  log("listening ON. Say «دوبي», or just ask within the next", FIRST_PRESS_MS / 1000, "s");
  show("waiting"); startRec();
}
function stopAll(msg) {
  log("listening OFF" + (msg ? " — " + msg : ""));
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

window.LibDobby = { start, stop: () => stopAll(), say, refreshStatus, isOn: () => on, state: () => state, _afterWake: afterWake, _isWake: isWakeWord, _take: takeSentences, _clear: isClear };
})();
