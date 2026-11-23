/* Dobby tap-to-talk.
   Tap 🎙 (or Space when you are not typing) and talk. Tap again to send, or just stop talking: 1.5 s of silence sends it.
   The audio goes to the `cat-voice` Edge Function
   (Groq Whisper -> fast model, streamed) -> the reply is spoken sentence by sentence with Groq Orpheus (Noura) through ONE Web Audio queue.
   Pressing again while Dobby talks stops it. If Groq TTS is slower than 2.5 s, that sentence is spoken with the browser's natural voice.
   Everything is logged to the console with "[dobby]", including stop -> first sound; LibDobby.times() shows the last 20 turns. */
(function () {
"use strict";
const A = () => window.LibApp;
const $ = id => document.getElementById(id);
const log = (...a) => console.log("[dobby]", ...a);
const warn = (...a) => console.warn("[dobby]", ...a);
const err = (...a) => console.error("[dobby]", ...a);
const now = () => performance.now();

const SILENCE_MS = 1500, NO_SPEECH_MS = 7000, VAD_CALIB_MS = 300, VAD_MIN_TH = 0.012, VAD_MAX_TH = 0.08;
const MIN_REC_MS = 350, MAX_REC_MS = 30000, MIC_WARM_MS = 60000, TTS_TIMEOUT_MS = 2500, TTS_PARALLEL = 3, WARM_EVERY_MS = 20000;

/* ---------- status UI ---------- */
const MSG = {
  ar: { rec: "أسمعك… (اضغطي 🎙 قبل ما تتكلمين لإنهاء المحادثة)", mic: "جاري تشغيل المايك…", thinking: "أفكر…", speaking: "أتكلم… اضغطي لقاطعني", hint: "اضغطي 🎙 (أو المسطرة) وتكلمي، وأرسل لما تسكتين",
        denied: "ما قدرت أستخدم المايك. اسمحي للموقع من إعدادات المتصفح.", nospeech: "ما سمعت شي، جربي مرة ثانية.", unclear: "ما فهمت عليك، عيديها بصوت أوضح.", ended: "خلصنا 👋 اضغطي 🎙 متى ما بغيتي نكمل", err: "صار خطأ في الصوت. جربي مرة ثانية.", unsupported: "المتصفح ما يدعم تسجيل الصوت." },
  en: { rec: "Listening… (tap 🎙 before speaking to end the chat)", mic: "Starting the microphone…", thinking: "Thinking…", speaking: "Speaking… press to interrupt", hint: "Tap 🎙 (or Space) and talk; I send when you pause",
        denied: "Couldn't use the microphone. Allow it in the browser's site settings.", nospeech: "I didn't hear anything, try again.", unclear: "I didn't catch that, say it again a bit clearer.", ended: "Done 👋 tap 🎙 whenever you want to continue", err: "Voice error. Try again.", unsupported: "This browser can't record audio." }
};
const L = () => MSG[A().lang()] || MSG.ar;
let state = "idle";                                  // idle | mic | recording | thinking | speaking
let hintT = null;
function show(s, text) {
  state = s;
  const el = $("vstatus"); if (!el) return;
  clearTimeout(hintT);
  el.hidden = s === "idle" && !text; el.dataset.s = s === "mic" ? "thinking" : s;
  $("vtext").textContent = text != null ? text : (L()[s === "recording" ? "rec" : s] || "");
  if (s !== "recording" && s !== "thinking" && s !== "speaking" && s !== "mic") setHeard("");
  $("listenBtn").setAttribute("aria-pressed", s === "recording");
  $("cat").classList.toggle("ear", s === "recording"); $("cat").classList.toggle("hot", s === "recording");
}
function flash(text, ms = 4000) { show("idle", text); hintT = setTimeout(() => { if (state === "idle") { $("vstatus").hidden = true; setHeard(""); } }, ms); }
function setHeard(text) { const el = $("vheard"); if (!el) return; const t = String(text || "").trim(); el.textContent = t ? "🎧 " + t.slice(-110) : ""; el.hidden = !t; }
function refreshStatus() { if (state !== "idle") show(state); }

/* ---------- mic + recorder ---------- */
let mic = null, micIdleT = null, mr = null, chunks = [], recStart = 0, autoStopT = null, pressed = false, pressSource = "", tRelease = 0, cancelled = false;
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
async function getMic() {
  clearTimeout(micIdleT);
  if (mic && mic.active) return mic;
  mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  return mic;
}
function micIdleLater() { clearTimeout(micIdleT); micIdleT = setTimeout(() => { if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; log("microphone released"); }, MIC_WARM_MS); }

/* ---------- pre-warm the Edge Functions (no Groq cost) ---------- */
let lastWarm = -Infinity;
async function prewarm() {
  if (now() - lastWarm < WARM_EVERY_MS) return; lastWarm = now();
  try {
    const app = A(), tok = await app.token(); if (!tok) return;
    const h = { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "x-warm": "1", "Content-Type": "application/json" };
    for (const f of ["cat-voice", "cat-tts"]) fetch(`${app.cfg.SUPABASE_URL}/functions/v1/${f}`, { method: "POST", headers: h, body: "{}" }).catch(() => {});
  } catch (e) { /* best effort */ }
}

/* ---------- Web Audio: one gapless queue + prefetch ---------- */
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
function audioCtx() { if (!ctx) ctx = new AC({ latencyHint: "interactive" }); if (ctx.state === "suspended") ctx.resume(); return ctx; }
const P = { gen: 0, items: [], running: false, lastEnd: 0, sources: new Set(), fetches: new Set(), inflight: 0, slots: [], slow: 0, brokenUntil: 0, marks: null };
const arabicish = t => (t.match(/[؀-ۿ]/g) || []).length >= (t.match(/[A-Za-z]/g) || []).length;

function trimSilence(buf) {
  try {
    const d = buf.getChannelData(0), th = 0.012, pad = Math.round(buf.sampleRate * 0.012); let s = 0, e = d.length - 1;
    while (s < e && Math.abs(d[s]) < th) s++; while (e > s && Math.abs(d[e]) < th) e--;
    s = Math.max(0, s - pad); e = Math.min(d.length - 1, e + pad);
    if (e - s + 1 >= d.length - 8) return buf;
    const out = audioCtx().createBuffer(buf.numberOfChannels, e - s + 1, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(s, e + 1), c);
    return out;
  } catch (e) { return buf; }
}
const takeSlot = () => P.inflight < TTS_PARALLEL ? (P.inflight++, Promise.resolve()) : new Promise(r => P.slots.push(r));
const freeSlot = () => { const n = P.slots.shift(); if (n) n(); else P.inflight--; };

function ttsBuffer(item) {          // -> Promise<AudioBuffer|null>; starts immediately (prefetch), at most TTS_PARALLEL in flight
  return (async () => {
    await takeSlot();
    if (item.gen !== P.gen) { freeSlot(); return null; }
    const ac = new AbortController(); P.fetches.add(ac); item.ac = ac; item.t0 = now();
    try {
      const app = A(), tok = await app.token();
      const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat-tts`, {
        method: "POST", signal: ac.signal,
        headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text.slice(0, 200), voice: app.ttsVoice() })
      });
      if (!r.ok) { let b = ""; try { b = (await r.text()).slice(0, 200); } catch (e) {} throw new Error("tts " + r.status + " " + b); }
      const bytes = await r.arrayBuffer();
      if (P.marks && !P.marks.ttsBytes) P.marks.ttsBytes = now();
      return trimSilence(await audioCtx().decodeAudioData(bytes));
    } catch (e) {
      if (item.gen === P.gen && !ac.signal.aborted) warn("Groq TTS failed for a sentence:", e.message);
      return null;
    } finally { P.fetches.delete(ac); freeSlot(); }
  })();
}
function enqueue(sentence) {
  const text = window.LibVoice.clean(sentence);
  if (!text || !/[\p{L}\p{N}]/u.test(text) || /[|]|-{3,}/.test(sentence)) return;          // never speak table fragments
  const item = { text, gen: P.gen, born: now(), t0: 0, ac: null, buf: null };
  if (arabicish(text) && Date.now() > P.brokenUntil) item.buf = ttsBuffer(item);
  P.items.push(item); runLoop();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitBuf(item) {      // Groq buffer, or null if it is slower than 2.5 s (then the browser voice speaks it)
  const left = Math.max(0, TTS_TIMEOUT_MS - (now() - (item.t0 || item.born)));
  const t = await Promise.race([item.buf, sleep(left).then(() => "timeout")]);
  if (t === "timeout") {
    warn(`Groq TTS slower than ${TTS_TIMEOUT_MS} ms -> browser voice for this sentence`);
    if (item.ac) item.ac.abort();
    if (++P.slow >= 2) { P.brokenUntil = Date.now() + 60000; warn("two slow sentences in a row: browser voice for the next 60 s"); }
    return null;
  }
  if (t) P.slow = 0;
  return t;
}
function schedule(buf) {
  const c = audioCtx(), src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
  const start = Math.max(c.currentTime + 0.03, P.lastEnd);               // back to back: next clip starts exactly when the previous ends
  src.start(start); P.lastEnd = start + buf.duration; P.sources.add(src); src.onended = () => P.sources.delete(src);
  if (P.marks && !P.marks.sound) { P.marks.sound = now() + (start - c.currentTime) * 1000; reportTimes(); }
  if (state === "thinking") show("speaking");
}
const scheduledEnd = () => (P.lastEnd - audioCtx().currentTime) * 1000;
async function runLoop() {
  if (P.running) return; P.running = true;
  while (P.items.length) {
    const it = P.items.shift(); if (it.gen !== P.gen) continue;
    const buf = it.buf ? await waitBuf(it) : null;
    if (it.gen !== P.gen) continue;
    if (buf) schedule(buf);
    else {                                                                 // browser voice: wait for queued Groq clips to finish first
      while (it.gen === P.gen && scheduledEnd() > 20) await sleep(Math.min(60, scheduledEnd()));
      if (it.gen !== P.gen) continue;
      if (state === "thinking") show("speaking");
      if (P.marks && !P.marks.sound) { P.marks.sound = now(); reportTimes(); }
      await window.LibVoice.speakOne(it.text);
    }
  }
  P.running = false;
}
function stopPlayback() {
  P.gen++; P.items = []; P.lastEnd = 0;
  for (const s of P.sources) { try { s.onended = null; s.stop(); } catch (e) {} } P.sources.clear();
  for (const a of P.fetches) { try { a.abort(); } catch (e) {} } P.fetches.clear();
  window.LibVoice.stop();
}
async function whenIdle() { for (;;) { if (!P.running && !P.items.length && (!ctx || scheduledEnd() <= 10)) return; await sleep(40); } }

const TIMES_KEY = "dobby-times";
function saveTimes(row) {
  try { const a = JSON.parse(localStorage.getItem(TIMES_KEY) || "[]"); a.push(row); localStorage.setItem(TIMES_KEY, JSON.stringify(a.slice(-20))); } catch (e) {}
}
/** Last 20 voice turns (ms after the recording stopped). In the console: LibDobby.times() */
function times() {
  let a = []; try { a = JSON.parse(localStorage.getItem(TIMES_KEY) || "[]"); } catch (e) {}
  if (a.length) {
    console.table(a);
    const med = k => { const v = a.map(x => x[k]).filter(x => typeof x === "number").sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : "—"; };
    console.log(`[dobby] median of ${a.length}: stop → first sound ${med("sound")} ms | transcript ${med("stt")} | first token ${med("token")} | first TTS audio ${med("ttsBytes")}`);
  } else console.log("[dobby] no voice turns measured yet");
  return a;
}
function reportTimes() {
  const m = P.marks; if (!m || !m.sound || m.reported) return; m.reported = true;
  const d = k => m[k] ? Math.round(m[k] - m.release) : "—", total = Math.round(m.sound - m.release);
  saveTimes({ at: new Date().toISOString().slice(0, 19), sound: total, stt: d("stt"), token: d("token"), ttsReq: d("ttsReq"), ttsBytes: d("ttsBytes"),
    fromSpeechEnd: Math.round(m.sound - m.speechEnd), serverStt: m.server && m.server.stt, serverToken: m.server && m.server.first_token });
  const el = $("vheard"); if (el && el.textContent) { el.textContent += ` · ⏱ ${(total / 1000).toFixed(1)}s`; }
  console.log(`[dobby] ⏱ stop → first sound: ${total} ms ${total < 2000 ? "✓ (<2 s)" : "✗ (>2 s)"} (from the end of your speech: ${Math.round(m.sound - m.speechEnd)} ms)`,
    `\n   transcript received: ${d("stt")} ms | first model token: ${d("token")} ms | first TTS request: ${d("ttsReq")} ms | first TTS audio: ${d("ttsBytes")} ms`,
    m.server ? `\n   server: stt ${m.server.stt} ms, first token ${m.server.first_token} ms after stt` : "");
}

/** Read a WRITTEN reply aloud: short spoken version (no tables / code), same Groq voice and queue. */
function say(markdown) {
  const text = window.LibVoice.shortSpoken(markdown); if (!text) return;
  audioCtx(); stopPlayback(); P.marks = null;
  for (const s of window.LibVoice.split(text)) enqueue(s);
}

/* ---------- reply streaming ---------- */
function takeSentences(buf, first) {
  const out = [];
  for (;;) {
    let cut = -1;
    const m = /[!?؟…\n]|\.(?=\s)/.exec(buf); if (m) cut = m.index + 1;
    if (first) {                                   // the very first chunk starts early: at the first comma/stop after >= 3 words, or after 9 words
      const words = s => s.trim().split(/\s+/).filter(Boolean).length;
      const rc = /[،,.!?؟]/g; let c;
      while ((c = rc.exec(buf))) if (words(buf.slice(0, c.index)) >= 3) { if (cut < 0 || c.index + 1 < cut) cut = c.index + 1; break; }
      if (cut < 0) { const w = /\S+\s+/g; let n = 0, mm, end = -1; while ((mm = w.exec(buf))) { if (++n >= 9) { end = mm.index + mm[0].length; break; } } if (end > 0) cut = end; }
    }
    if (cut < 0) {
      if (buf.length > 190) { let i = Math.max(buf.lastIndexOf("،", 190), buf.lastIndexOf(",", 190), buf.lastIndexOf(" ", 190)); if (i < 40) i = 190; cut = i + 1; }
      else break;
    }
    out.push(buf.slice(0, cut)); buf = buf.slice(cut); first = false;
  }
  return [out, buf];
}

let ctrl = null;
const NAME_LABEL = /^\s*(?:dobby|doby|دوبي)\s*[:：]\s*/i;
/** Short soft "ding" when the mic is really recording, so she knows when to start talking. */
function beep() {
  try {
    const c = audioCtx(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.16);
  } catch (e) {}
}
async function send(blob, speechEnd) {
  const app = A();
  if (app.busy()) { warn("busy, ignoring this recording"); show("idle"); return; }
  app.setBusy(true); stopPlayback();
  const marks = P.marks = { release: tRelease, speechEnd: speechEnd || tRelease, sent: now() };
  show("thinking");
  const meBubble = app.addMsg("me", "🎙 …", false);                 // not in history until we know the transcript
  app.setPose("think");
  const bubble = app.addMsg("cat", "…", false);
  ctrl = new AbortController(); const myCtrl = ctrl;
  let full = "", pending = "", first = true, userPushed = false, stt = null, named = false;
  try {
    const tok = await app.token();
    const fd = new FormData();
    fd.set("audio", blob, "speech." + (blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "mp4" : "webm"));
    fd.set("meta", JSON.stringify({ messages: app.history().slice(-18), name: app.name(), lang: app.lang(), doc: window.LibAttach ? LibAttach.full() : null }));   // the server picks the parts that match the transcript
    const r = await fetch(`${app.cfg.SUPABASE_URL}/functions/v1/cat-voice`, { method: "POST", signal: myCtrl.signal, headers: { Authorization: "Bearer " + tok, apikey: app.cfg.SUPABASE_ANON_KEY }, body: fd });
    if (!r.ok) { let b = ""; try { b = await r.text(); } catch (e) {} err("cat-voice failed:", r.status, b.slice(0, 300)); throw new Error("http " + r.status); }
    log(`recording ${(blob.size / 1024).toFixed(1)} KB sent, response headers after ${Math.round(now() - tRelease)} ms`);
    const reader = r.body.getReader(), dec = new TextDecoder(); let sse = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      sse += dec.decode(value, { stream: true });
      let nl; while ((nl = sse.indexOf("\n")) >= 0) {
        const line = sse.slice(0, nl).trim(); sse = sse.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        let j; try { j = JSON.parse(line.slice(5)); } catch (e) { continue; }
        if (j.error) { err("cat-voice stream error:", j); throw new Error(j.error); }
        if (j.stt !== undefined) {
          marks.stt = now(); marks.server = j.ms; stt = String(j.stt || "").trim(); log("transcript:", JSON.stringify(stt), "(whisper", j.ms && j.ms.stt, "ms on the server)");
          if (!stt) {
            if (j.unclear) warn("unclear transcript, not answered:", JSON.stringify(j.heard), "logprob", j.ms && j.ms.logprob);
            meBubble.closest(".m").remove(); bubble.closest(".m").remove(); app.setBusy(false); app.setPose("happy");
            flash(j.unclear ? L().unclear + (j.heard ? " (سمعت: " + String(j.heard).slice(0, 40) + ")" : "") : L().nospeech, 6000);
            setTimeout(() => listenAgain(myCtrl), 900); return;
          }
          meBubble.textContent = stt; meBubble.dataset.raw = stt; setHeard(stt);
          app.history().push({ role: "user", content: stt }); userPushed = true;
        }
        if (j.t) {
          if (!marks.token) { marks.token = now(); log("first model token", Math.round(marks.token - tRelease), "ms after release"); }
          full += j.t; pending += j.t;
          if (!named) {                                    // the model sometimes starts with "Dobby:": never show or speak it
            if (full.length < 12 && !/[:：]/.test(full)) continue;
            full = pending = full.replace(NAME_LABEL, ""); named = true;
          }
          bubble.textContent = full; $("msgs").scrollTop = 1e9;
          const [sents, rest] = takeSentences(pending, first); pending = rest;
          for (const s of sents) { if (first && !marks.ttsReq) marks.ttsReq = now(); first = false; enqueue(s); }
        }
        if (j.done && j.ms) marks.server = { ...(marks.server || {}), ...j.ms };
      }
    }
    if (!named) { full = full.replace(NAME_LABEL, ""); pending = full; named = true; }
    if (pending.trim()) { if (!marks.ttsReq) marks.ttsReq = now(); enqueue(pending); pending = ""; }
    if (!full.trim()) throw new Error("empty reply");
    app.setReply(bubble, full); app.history().push({ role: "assistant", content: full });
    await whenIdle();
  } catch (e) {
    if (myCtrl.signal.aborted) {                       // she pressed again while it was talking
      if (full.trim()) { app.setReply(bubble, full); app.history().push({ role: "assistant", content: full }); }
      else { bubble.closest(".m").remove(); if (!stt) meBubble.closest(".m").remove(); if (userPushed) app.history().pop(); }
    } else { failed = true; err("voice turn failed:", e); bubble.textContent = A().C().err; if (userPushed) app.history().pop(); flash(L().err); }
  } finally {
    app.setBusy(false); app.setPose("happy");
    if (state === "thinking" || state === "speaking") show("idle");
    listenAgain(myCtrl);
  }
}
/* Conversation mode (like a phone call): after Dobby finishes, the mic opens again by itself (with the ding).
   It ends when she taps 🎙 before speaking, says nothing for 7 s, closes the chat, or leaves the page. */
let convo = false, failed = false;
function listenAgain(myCtrl) {
  if (!convo || failed || (myCtrl && myCtrl.signal.aborted) || document.hidden || ($("chat") && $("chat").hidden)) { if (failed) convo = false; failed = false; return; }
  setTimeout(() => { if (convo && state === "idle" && !pressed && !A().busy()) startRec("auto"); }, 350);
}
function endConvo(why, text) { if (convo) log("conversation ended:", why); convo = false; if (text) flash(text, 5000); }

/* ---------- tap to talk: tap starts, tap stops, or 1.5 s of silence stops ---------- */
// Voice activity detection on the mic: RMS level every 50 ms against a threshold calibrated from the first 300 ms (room noise).
const vad = { timer: null, src: null, an: null, floor: 0, calib: [], th: 0.02, voiced: 0, heard: false, lastVoice: 0, speechEnd: 0 };
function vadStart(stream) {
  vadStop();
  try {
    const c = audioCtx(); vad.src = c.createMediaStreamSource(stream); vad.an = c.createAnalyser(); vad.an.fftSize = 1024;
    vad.src.connect(vad.an);                                          // not connected to the speakers
  } catch (e) { warn("VAD unavailable, tap again to send:", e && e.message); return; }
  const data = new Float32Array(vad.an.fftSize);
  Object.assign(vad, { calib: [], th: VAD_MIN_TH, voiced: 0, heard: false, lastVoice: 0, speechEnd: 0 });
  vad.timer = setInterval(() => {
    if (state !== "recording") return;
    vad.an.getFloatTimeDomainData(data);
    let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i];
    const rms = Math.sqrt(s / data.length), t = now(), el = t - recStart;
    if (el < VAD_CALIB_MS) { vad.calib.push(rms); if (rms < VAD_MIN_TH * 1.5) return; }      // room noise; loud start = she already talks
    else if (vad.calib.length) {
      const quiet = vad.calib.filter(x => x < VAD_MIN_TH * 1.5).sort((a, b) => a - b);   // ignore frames where she already talks
      const floor = quiet.length >= 3 ? quiet[Math.floor(quiet.length / 2)] : 0;
      vad.th = Math.min(VAD_MAX_TH, Math.max(VAD_MIN_TH, floor * 3)); vad.calib = []; log(`VAD threshold ${vad.th.toFixed(3)} (room noise ${floor.toFixed(3)})`);
    }
    if (el < 220) return;                                                                      // the start "ding" itself is not speech
    if (rms >= vad.th) { if (++vad.voiced >= 2) { if (!vad.heard) log(`speech detected after ${Math.round(el)} ms`); vad.heard = true; vad.lastVoice = t; } }
    else vad.voiced = 0;
    if (vad.heard && t - vad.lastVoice >= SILENCE_MS) { vad.speechEnd = vad.lastVoice; log(`${SILENCE_MS} ms of silence -> sending`); stopRec("silence"); }
    else if (!vad.heard && el >= NO_SPEECH_MS) {
      const auto = pressSource === "auto"; warn(`no speech in ${NO_SPEECH_MS / 1000} s, recording discarded`); cancelRecording("no speech");
      endConvo("no speech", auto ? L().ended : L().nospeech);
    }
  }, 50);
}
function vadStop() {
  clearInterval(vad.timer); vad.timer = null;
  try { if (vad.src) vad.src.disconnect(); } catch (e) {}
  vad.src = vad.an = null;
}

async function startRec(source) {
  if (pressed || state === "recording" || state === "mic") return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { err("MediaRecorder/getUserMedia not available"); flash(L().unsupported); return; }
  pressed = true; pressSource = source; cancelled = false;
  if (source !== "auto") { convo = true; failed = false; }
  if (ctrl) ctrl.abort();                              // talking over Dobby: stop him at once
  stopPlayback(); P.marks = null;
  audioCtx(); prewarm(); A().token().catch(() => {}); A().openChat(true);
  show("mic");
  let stream;
  try { stream = await getMic(); }
  catch (e) { err("getUserMedia failed:", e && e.name, e && e.message); pressed = false; flash(L().denied, 7000); return; }
  if (!pressed || cancelled) { pressed = false; micIdleLater(); show("idle"); $("vstatus").hidden = true; return; }   // tapped again before the mic was ready
  chunks = [];
  try { mr = new MediaRecorder(stream, { ...(pickMime() ? { mimeType: pickMime() } : {}), audioBitsPerSecond: 64000 }); }
  catch (e) { err("MediaRecorder failed:", e); pressed = false; flash(L().err); return; }
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.start(); recStart = now(); show("recording"); vadStart(stream); beep();
  log(`recording started (${source}, ${mr.mimeType})`);
  clearTimeout(autoStopT); autoStopT = setTimeout(() => { if (pressed) { warn("30 s limit reached"); stopRec("limit"); } }, MAX_REC_MS);
}
function stopRec(source) {
  if (!pressed) return;
  pressed = false; clearTimeout(autoStopT); vadStop(); tRelease = now();
  const speechEnd = vad.speechEnd || tRelease; vad.speechEnd = 0;
  if (!mr || mr.state !== "recording") { if (state === "mic") { cancelled = true; show("idle"); $("vstatus").hidden = true; } return; }
  const rec = mr, dur = tRelease - recStart;
  rec.onstop = () => {
    micIdleLater();
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    if (cancelled) { log("recording discarded"); show("idle"); return; }
    if (dur < MIN_REC_MS || blob.size < 600) { log(`too short (${Math.round(dur)} ms), ignored`); flash(L().hint); return; }
    log(`stopped (${source}) after ${Math.round(dur)} ms`);
    send(blob, speechEnd);
  };
  show("thinking"); rec.stop();
}
function cancelRecording(why) {
  if (!pressed && state !== "recording") return;
  warn("recording cancelled:", why); cancelled = true; pressed = false; clearTimeout(autoStopT); vadStop();
  try { if (mr && mr.state === "recording") mr.stop(); } catch (e) {}
  micIdleLater(); show("idle"); $("vstatus").hidden = true;
}
/** One tap: idle/speaking -> start listening; listening -> send now; mic still starting -> cancel. */
function toggle(source) {
  if (state === "recording" && !vad.heard) { cancelRecording("tapped before speaking"); endConvo("tapped before speaking", L().ended); }
  else if (state === "recording") stopRec(source);
  else if (state === "mic" && pressed) cancelRecording("tapped again before the mic was ready");
  else startRec(source);
}

document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#listenBtn"); if (!b) return;
  e.preventDefault(); toggle(e.detail === 0 ? "keyboard" : "button");
});
document.addEventListener("contextmenu", e => { if (e.target.closest && e.target.closest("#listenBtn")) e.preventDefault(); });

const editable = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
function spaceOk(e) {
  if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (editable(e.target) || editable(document.activeElement)) return false;                 // typing: Space is a space
  const a = e.target.closest ? e.target.closest("button, a, summary, [role=button]") : null;
  if (a) return false;                                                                       // focused button: Space clicks it (🎙 included -> click handler)
  if ($("app").hidden) return false;                                                        // signed out
  return true;
}
document.addEventListener("keydown", e => { if (!spaceOk(e)) return; e.preventDefault(); if (!e.repeat) toggle("space"); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { endConvo("page hidden"); cancelRecording("page in the background"); stopPlayback(); } });
addEventListener("pagehide", () => { cancelRecording("page hidden"); stopPlayback(); });

function stopAll() { endConvo("stopped"); cancelRecording("stopped"); if (ctrl) ctrl.abort(); stopPlayback(); if (mic) { mic.getTracks().forEach(t => t.stop()); mic = null; } show("idle"); $("vstatus").hidden = true; }

window.LibDobby = { stop: stopAll, say, refreshStatus, times, toggle, state: () => state, isOn: () => state === "recording", _take: takeSentences, _P: P };
})();
