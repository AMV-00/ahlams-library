/* Voice for the cat: pick the best browser voice per language and speak short sentences back to back. */
(function () {
"use strict";
const ok = "speechSynthesis" in window;
let voices = [], gen = 0;

function load() { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } }
if (ok) { load(); speechSynthesis.addEventListener("voiceschanged", load); }

function score(v, l) {
  const lg = (v.lang || "").toLowerCase().replace("_", "-"), n = v.name || "";
  if (!lg.startsWith(l)) return -1;
  let s = 0;
  if (/online \(natural\)|natural/i.test(n)) s += 100;     // Microsoft neural voices (Edge)
  else if (!v.localService) s += 40;                       // cloud voices (Google etc.)
  if (l === "ar") { if (lg === "ar-sa") s += 20; if (/hamed|zariyah/i.test(n)) s += 15; }
  if (l === "en") { if (lg === "en-us") s += 10; if (/aria|jenny|guy|ava|andrew|emma/i.test(n)) s += 5; }
  return s;
}
function pick(l) {
  let best = null, bs = -1;
  for (const v of voices) { const s = score(v, l); if (s > bs) { bs = s; best = v; } }
  return best;
}
function clean(t) {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")                                                         // raw HTML tags
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "") // table separator rows
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, r) => r.split("|").map(x => x.trim()).filter(Boolean).join("\u060C ") + ".") // table rows
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")                                            // links -> their text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "").replace(/^[ \t]*(?:[-*+\u2022]|\d+[.)])[ \t]+/gm, "") // headings, bullets, numbers
    .replace(/^[ \t]*>[ \t]?/gm, "").replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, "")
    .replace(/[*_~`#|]/g, "")
    .replace(/https?:\/\/\S+/g, " ").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/([^.!?\u061F\u2026:,\u060C\s])[ \t]*\n+/g, "$1. ")                          // line break = sentence pause
    .replace(/\s+/g, " ").trim();
}
function split(t) {
  const out = [];
  for (const s of t.split(/(?<=[.!?؟…:])\s+/)) {
    let rest = s.trim();
    while (rest.length > 160) {
      let i = rest.lastIndexOf("،", 160);
      if (i < 40) i = rest.lastIndexOf(",", 160);
      if (i < 40) i = rest.lastIndexOf(" ", 160);
      if (i < 40) i = 160;
      out.push(rest.slice(0, i + 1).trim()); rest = rest.slice(i + 1).trim();
    }
    if (rest) out.push(rest);
  }
  const keep = out.filter(x => /[\p{L}\p{N}]/u.test(x)), merged = [];
  for (const x of keep) {
    if (merged.length && merged[merged.length - 1].length < 14) merged[merged.length - 1] += " " + x;
    else merged.push(x);
  }
  return merged;
}
function speak(raw) {
  if (!ok) return;
  const text = clean(String(raw || "")); if (!text) return;
  const ar = (text.match(/[؀-ۿ]/g) || []).length, la = (text.match(/[A-Za-z]/g) || []).length;
  const l = ar >= la ? "ar" : "en", v = pick(l), id = ++gen, parts = split(text);
  speechSynthesis.cancel();
  (function next(i) {
    if (id !== gen || i >= parts.length) return;
    const u = new SpeechSynthesisUtterance(parts[i]);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = l === "ar" ? "ar-SA" : "en-US";
    u.onend = () => next(i + 1); u.onerror = () => {};
    speechSynthesis.speak(u);
  })(0);
}
function stop() { gen++; if (ok) try { speechSynthesis.cancel(); } catch (e) {} }

window.LibVoice = { speak, stop, pick, split, clean, setVoices(v) { voices = v; } };
})();
