/* Dobby file attachments (📎): PDF, text/markdown, images.
   - PDF: text is extracted IN THE BROWSER with pdf.js (loaded only on first use). Nothing is uploaded or stored.
   - Text / Markdown / CSV / JSON: read as text.
   - Image: resized to <= 1600 px JPEG and sent once to the `cat` function, which asks Groq's vision model to
     transcribe and describe it; the result is kept as the document text.
   Up to 10 files stay attached for the rest of the chat (× removes one). For each question only the most relevant
   parts (~8k chars) are sent with it, so big files never exceed Groq's request limits. */
(function () {
"use strict";
const A = () => window.LibApp, $ = id => document.getElementById(id);
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const MAX_FILE = 25 * 1024 * 1024, MAX_TEXT = 400000, CHUNK = 1400, BUDGET = 8000;
const T = {
  ar: { attach: "إرفاق ملف (PDF، صورة، نص)", reading: "أقرأ الملف…", pages: n => `${n} صفحة`, remove: "إزالة الملف", big: "الملف أكبر من 25 MB.", type: "أقدر أقرأ PDF والصور وملفات النص فقط.", fail: "ما قدرت أقرأ الملف.", empty: "ما لقيت نص في الملف (ممكن يكون PDF صور، أرسليه كصورة).", ready: (n) => `قرأت «${n}». اسأليني عنه.`, link: "أفتح الرابط…", folder: (n, k) => `المجلد «${n}» فيه ${k} ملف، أقرأ أول ${Math.min(k, 10)}…`,
        lerr: { private: "الرابط خاص. خليه «Anyone with the link» في Drive وارسليه مرة ثانية، أو نزلي الملف وارفعيه بـ 📎.", "too large": "الملف أكبر من 15 MB، نزليه وارفعيه بـ 📎.", unsupported: "نوع الملف هذا ما أقدر أقرأه من الرابط.", "empty folder": "المجلد فاضي أو خاص.", blocked: "هذا الرابط ما أقدر أفتحه.", def: "ما قدرت أفتح الرابط." }, many: "وصلتي للحد: 10 ملفات. شيلي واحد بـ × عشان تضيفين غيره." },
  en: { attach: "Attach a file (PDF, image, text)", reading: "Reading the file…", pages: n => `${n} pages`, remove: "Remove file", big: "The file is bigger than 25 MB.", type: "I can read PDF, images and text files only.", fail: "Couldn't read the file.", empty: "No text found in the file (a scanned PDF? send it as an image).", ready: (n) => `I read “${n}”. Ask me about it.`, link: "Opening the link…", folder: (n, k) => `Folder “${n}” has ${k} files, reading the first ${Math.min(k, 10)}…`,
        lerr: { private: "The link is private. Set it to “Anyone with the link” in Drive, or download the file and attach it with 📎.", "too large": "The file is over 15 MB; download it and attach it with 📎.", unsupported: "I can't read this file type from a link.", "empty folder": "The folder is empty or private.", blocked: "I can't open this link.", def: "Couldn't open the link." }, many: "Limit reached: 10 files. Remove one with × to add another." }
};
const L = () => T[A().lang()] || T.ar;
let docs = [];                 // [{ name, text, chunks: string[], info }]
const MAX_DOCS = 10;
let pdfjs = null;

function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = PDFJS + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => { pdfjs = null; rej(new Error("pdf.js failed to load")); };
    document.head.appendChild(s);
  });
  return pdfjs;
}
async function readPdf(file) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages && out.length < MAX_TEXT; i++) {
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    let line = "", lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) { out += line.trim() + "\n"; line = ""; }
      line += it.str + (it.hasEOL ? "\n" : " "); lastY = y;
    }
    out += line.trim() + `\n[صفحة ${i}]\n`;
  }
  return { text: out, info: L().pages(pdf.numPages) };
}
function toJpeg(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
    img.src = url;
  });
}
async function readImage(file) {
  const dataUrl = await toJpeg(file);
  const { data, error } = await A().sb.functions.invoke("cat", { body: { extract_image: dataUrl, lang: A().lang() } });
  if (error || !data || !data.text) {
    try { if (error && error.context && error.context.json) console.error("[attach] image error:", await error.context.json()); } catch (_) {}
    throw (error || new Error("empty"));
  }
  return { text: data.text, info: "🖼" };
}

function chunk(text) {
  const parts = [], paras = text.split(/\n{1,}/); let cur = "";
  for (const p of paras) {
    if ((cur + "\n" + p).length > CHUNK && cur) { parts.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + p;
    while (cur.length > CHUNK * 1.5) { parts.push(cur.slice(0, CHUNK)); cur = cur.slice(CHUNK); }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}
const words = s => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).map(w => w.replace(/^(ال|وال|بال|لل)/, ""));
/** The parts most related to the question across all files: the start of each file, then best keyword overlap, in file order. */
function contextFor(question) {
  if (!docs.length) return null;
  const all = docs.reduce((n, d) => n + d.text.length, 0);
  const head = d => `### ${d.name}\n`;
  if (all <= BUDGET) return { name: docs.map(d => d.name).join("، "), text: docs.map(d => head(d) + d.text).join("\n\n"), partial: false };
  const parts = []; docs.forEach((d, di) => d.chunks.forEach((c, ci) => parts.push({ di, ci, c })));
  const q = new Set(words(question)), pick = new Set(); let used = 0;
  const add = k => { if (pick.has(k) || used + parts[k].c.length > BUDGET) return; pick.add(k); used += parts[k].c.length; };
  parts.forEach((p, k) => { if (p.ci === 0 && used < BUDGET * 0.35) add(k); });                     // the start of each file
  parts.map((p, k) => { let n = 0; for (const w of words(p.c)) if (q.has(w)) n++; return { k, s: n / Math.sqrt(p.c.length / 400 + 1) }; })
    .filter(x => x.s > 0).sort((x, y) => y.s - x.s).forEach(x => add(x.k));
  for (let k = 0; k < parts.length && used < BUDGET * 0.6; k++) add(k);                               // general question: first parts
  let out = "", last = -1;
  for (const k of [...pick].sort((x, y) => x - y)) { const p = parts[k]; out += (p.di !== last ? "\n\n" + head(docs[p.di]) : "\n…\n") + p.c; last = p.di; }
  return { name: docs.map(d => d.name).join("، "), text: out.trim(), partial: true };
}

function paintChip() {
  const el = $("attChip"); if (!el) return;
  el.hidden = !docs.length; el.innerHTML = "";
  docs.forEach((d, i) => {
    const c = document.createElement("span"); c.className = "att-one";
    const s = document.createElement("span"); s.textContent = `📄 ${d.name}${d.info ? " · " + d.info : ""}`;
    const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = L().remove + ": " + d.name; x.setAttribute("aria-label", x.title);
    x.onclick = () => { docs.splice(i, 1); paintChip(); };
    c.append(s, x); el.append(c);
  });
}
/* ---------- links: the `cat-fetch` function downloads public pages / Drive files / folders; PDFs are read here with pdf.js ---------- */
const seen = new Set();
const URL_RE = /https?:\/\/[^\s<>"'()]+[^\s<>"'().,،؛!?؟]/g;
async function fetchLink(url) {
  const { data, error } = await A().sb.functions.invoke("cat-fetch", { body: { url } });
  if (error) { try { if (error.context && error.context.json) return await error.context.json(); } catch (_) {} return { error: "fetch" }; }
  return data || { error: "fetch" };
}
function addDoc(name, text, info) {
  text = String(text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.replace(/\[صفحة \d+\]/g, "").trim().length < 20) return false;
  const d = { name: String(name).slice(0, 80), text: text.slice(0, MAX_TEXT), chunks: [], info };
  d.chunks = chunk(d.text);
  docs = docs.filter(x => x.name !== d.name).concat(d).slice(-MAX_DOCS); paintChip();
  console.log(`[attach] ${d.name}: ${d.text.length} chars, ${d.chunks.length} parts`);
  return true;
}
async function readLinkResult(j) {
  if (j.kind === "text") return addDoc(j.name, j.text, "🔗");
  if (j.kind === "pdf") {
    const bin = atob(j.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const r = await readPdf(new Blob([u8], { type: "application/pdf" }));
    return addDoc(j.name, r.text, "🔗 " + r.info);
  }
  return false;
}
/** Read every new link in her message before Dobby answers. Returns quickly when there is none. */
async function fromText(text) {
  const urls = [...new Set((String(text).match(URL_RE) || []))].filter(u => !seen.has(u)).slice(0, 5);
  if (!urls.length) return;
  const app = A();
  for (const url of urls) {
    seen.add(url);
    const bubble = app.addMsg("cat", L().link + " " + url.slice(0, 60), false);
    try {
      const j = await fetchLink(url);
      if (j.error) { bubble.textContent = (L().lerr[j.error] || L().lerr.def) + " (" + url.slice(0, 50) + ")"; seen.delete(url); continue; }
      if (j.kind === "folder") {
        const files = j.files.filter(f => /\/file\/d\//.test(f.url));
        bubble.textContent = L().folder(j.name, files.length);
        const got = [];
        for (const f of files.slice(0, 10)) {
          const k = await fetchLink(f.url);
          if (!k.error && await readLinkResult({ ...k, name: f.name || k.name })) got.push(f.name || k.name);
        }
        bubble.textContent = got.length ? L().ready(got.join("، ")) : L().lerr["empty folder"];
        continue;
      }
      bubble.textContent = await readLinkResult(j) ? L().ready(j.name) : L().empty;
    } catch (e) { console.error("[attach] link", e); bubble.textContent = L().lerr.def; seen.delete(url); }
  }
}

async function onFiles(list) {
  for (const f of [...(list || [])].slice(0, MAX_DOCS)) await onFile(f);
  $("attFile").value = "";
}
async function onFile(file) {
  if (!file) return;
  const app = A();
  if (docs.length >= MAX_DOCS) { app.addMsg("cat", L().many, false); return; }
  if (file.size > MAX_FILE) { app.addMsg("cat", L().big, false); return; }
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\//.test(file.type),
        isTxt = /^text\//.test(file.type) || /\.(txt|md|csv|json|log|yaml|yml)$/i.test(file.name);
  if (!isPdf && !isImg && !isTxt) { app.addMsg("cat", L().type, false); return; }
  app.openChat(true);
  const bubble = app.addMsg("cat", L().reading, false); app.setPose("think");
  $("attBtn").disabled = true;
  try {
    const r = isPdf ? await readPdf(file) : isImg ? await readImage(file) : { text: (await file.text()).slice(0, MAX_TEXT), info: "" };
    const text = r.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.replace(/\[صفحة \d+\]/g, "").trim().length < 20) { bubble.textContent = L().empty; return; }
    const d = { name: file.name.slice(0, 80), text, chunks: chunk(text), info: r.info };
    docs = docs.filter(x => x.name !== d.name).concat(d);
    console.log(`[attach] ${file.name}: ${text.length} chars, ${d.chunks.length} parts`);
    bubble.textContent = L().ready(d.name); paintChip(); app.setPose("happy");
    $("askIn").focus();
  } catch (e) { console.error("[attach]", e); bubble.textContent = L().fail; app.setPose("happy"); }
  finally { $("attBtn").disabled = false; }
}

function init() {
  const b = $("attBtn"), f = $("attFile"); if (!b || !f) return;
  b.addEventListener("click", () => f.click());
  f.addEventListener("change", () => onFiles(f.files));
  const box = $("askForm");                                    // drag & drop or paste a file onto the composer
  box.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); box.classList.add("drop"); } });
  box.addEventListener("dragleave", () => box.classList.remove("drop"));
  box.addEventListener("drop", e => { box.classList.remove("drop"); const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) { e.preventDefault(); onFiles(fl); } });
  $("askIn").addEventListener("paste", e => { const fl = e.clipboardData && e.clipboardData.files; if (fl && fl.length) { e.preventDefault(); onFiles(fl); } });
  paint();
}
function paint() { const b = $("attBtn"); if (b) { b.title = L().attach; b.setAttribute("aria-label", L().attach); } paintChip(); }

/** For voice: the question is only known after Whisper, so the server picks the parts (up to 60k chars sent). */
function full() {
  if (!docs.length) return null;
  const text = docs.map(d => `### ${d.name}\n${d.text}`).join("\n\n");
  return { name: docs.map(d => d.name).join("، "), text: text.slice(0, 60000), partial: text.length > 60000 };
}
window.LibAttach = { contextFor, full, fromText, addFile: onFile, clear() { docs = []; seen.clear(); paintChip(); }, has: () => docs.length > 0, paint, _chunk: chunk };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
