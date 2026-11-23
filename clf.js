/* 📘 AWS CLF-C02 study mode for Dobby.
   - Panel (chip "📘 مذاكرة AWS" in the chat): her study plan in her order (basics → exam prep → review/practice) with her links,
     exam date countdown, score per exam domain, and tracked exam-style quizzes.
   - Quiz: `cat` with {quiz:{domain,avoid,multi}} returns one JSON question; the card here checks the answer and saves the result.
   - Progress lives in Supabase `config` key "clf" (RLS = only her): {done:{step:true}, stats:{d1:{ok,n}}, recent:[...], exam}.
   - While study mode is on (panel used, or her message mentions AWS/CLF), chat requests send study:"clf" + a progress line,
     so Dobby answers as a CLF-C02 coach with notes from supabase/functions/_shared/clf.ts. */
(function () {
"use strict";
const A = () => window.LibApp, $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DOM = {
  d1: { ar: "مفاهيم السحابة", en: "Cloud Concepts", w: 24 },
  d2: { ar: "الأمان والامتثال", en: "Security & Compliance", w: 30 },
  d3: { ar: "التقنيات والخدمات", en: "Technology & Services", w: 34 },
  d4: { ar: "الفوترة والتسعير والدعم", en: "Billing, Pricing & Support", w: 12 },
};
// Her plan and links (from her message, 2026-11-23). read: Dobby can open it (public, under 15 MB).
const PLAN = [
  { ar: "١. الأساسيات من الصفر", en: "1. Basics from scratch", steps: [
    { id: "b1", ar: "كورسات البداية في Skill Builder", en: "Skill Builder: Get started courses", url: "https://skillbuilder.aws/category/getstarted" },
    { id: "b2", ar: "دليل الطالب: Cloud Practitioner Essentials", en: "Student guide: Cloud Practitioner Essentials", url: "https://drive.google.com/file/d/1aF3H5XtfMDWpjoUdfTAjrU7b2ckolj9A/view", big: true },
    { id: "b3", ar: "سلايدات Essentials (عربي وإنجليزي)", en: "Essentials slides (Arabic + English)", url: "https://drive.google.com/drive/folders/18w-5Y9Vuun2pAMfVk5dlWUNw1ZOiXeXL", read: true },
  ] },
  { ar: "٢. التحضير للشهادة", en: "2. Exam prep", steps: [
    { id: "e1", ar: "صفحة الشهادة الرسمية", en: "Official certification page", url: "https://aws.amazon.com/ar/certification/certified-cloud-practitioner/", read: true },
    { id: "e2", ar: "دليل الاختبار", en: "Exam guide", url: "https://drive.google.com/drive/folders/1Dkx4INYFFN9FopuN39FGrfZsjHroG6GB", read: true },
    { id: "e3", ar: "المسار الرسمي CLF-C02 في Skill Builder", en: "Official CLF-C02 prep path (Skill Builder)", url: "https://skillbuilder.aws/category/exam-prep/cloud-practitioner-foundational-CLF-C02" },
    { id: "e4", ar: "المحتوى العربي (اختياري)", en: "Arabic content (optional)", url: "https://skillbuilder.aws/search?searchText=CLF-C02&page=1&languageCode=ar-SA" },
    { id: "e5", ar: "سلايدات Stéphane Maarek", en: "Stéphane Maarek slides", url: "https://drive.google.com/file/d/1KdH9XsEMG_lztX8NlsZwe-PswRfB8k4i/view", read: true },
    { id: "e6", ar: "خطة الاستعداد من AWS Skills Centers", en: "AWS Skills Centers prep plan", url: "https://drive.google.com/drive/folders/1hMmzEh8uEGEZjquXeh-3grmO6CBRw-AZ", read: true },
  ] },
  { ar: "٣. المراجعة والاختبارات التجريبية", en: "3. Review & practice tests", steps: [
    { id: "r1", ar: "اختبارات دوبي: ٨٠٪ أو أكثر في كل نطاق", en: "Dobby quizzes: 80%+ in every domain", auto: true },
    { id: "r2", ar: "التجميعات", en: "Question compilations", url: "https://drive.google.com/drive/folders/1qDZxbYbXruwyWIwD10UFKL1ol8iM1cz2", read: true },
    { id: "r3", ar: "محاكي الاختبار FuExHub", en: "FuExHub exam simulator", url: "https://futureclouds.github.io/FuExHub/" },
    { id: "r4", ar: "احجزي الاختبار", en: "Book the exam", url: "https://aws.amazon.com/ar/certification/certified-cloud-practitioner/" },
  ] },
];
const T = {
  ar: { chip: "📘 مذاكرة AWS", title: "مذاكرة AWS Cloud Practitioner (CLF-C02)", back: "رجوع للمحادثة", exam: "موعد اختبارك",
    left: d => d < 0 ? "عدى الموعد" : d === 0 ? "اختبارك اليوم! بالتوفيق 🤍" : d === 1 ? "باقي يوم" : d === 2 ? "باقي يومين" : d <= 10 ? `باقي ${d} أيام` : `باقي ${d} يوم`,
    scores: "مستواك في نطاقات الاختبار", noQ: "ما جاوبتي أسئلة لسه", qs: n => n === 1 ? "سؤال واحد" : n === 2 ? "سؤالين" : n <= 10 ? `${n} أسئلة` : `${n} سؤال`,
    quizMe: "اختبريني", any: "🎯 سؤال (يركز على الأضعف)", plan: "خطتك", readW: "📖 مع دوبي", big: "كبير على دوبي", ready: p => `جاهزيتك التقريبية: ${p}٪ (النجاح يحتاج تقريباً ٧٠٪)`,
    myPlan: "🗓️ سوي لي جدول مذاكرة", explain: "💬 اشرحي لي نطاق", loading: "أجهز لك سؤال…", err: "ما قدرت أجيب سؤال الحين، جربي بعد شوي.",
    check: "تأكيد الإجابة", right: "✅ صح!", wrong: "❌ غلط", correct: "الصح:", next: "سؤال ثاني", pick2: "اختاري اثنين",
    readAsk: (t, u) => `اقرأ «${t}» ولخص لي أهم النقاط اللي تهمني لاختبار CLF-C02: ${u}`,
    planAsk: (d) => `سوي لي جدول مذاكرة لشهادة CLF-C02 حسب ترتيبي (الأساسيات، ثم التحضير، ثم المراجعة والاختبارات التجريبية)${d ? ` وموعد اختباري ${d}` : " (ما حددت موعد، اقترحي مدة مناسبة)"}، وركزي على النطاقات اللي مستواي فيها أضعف.`,
    domAsk: n => `اشرحي لي نطاق «${n}» في اختبار CLF-C02 بشكل مبسط: أهم الخدمات والمفاهيم والكلمات المفتاحية في الأسئلة.`,
    hist: (d, q, o) => `📘 سؤال CLF-C02 (${d}):\n${q}\n${o}`, ans: (a, ok, c) => `جاوبت: ${a}. ${ok ? "صح" : "غلط"}. الصح: ${c}` },
  en: { chip: "📘 AWS study", title: "AWS Cloud Practitioner (CLF-C02) study", back: "Back to chat", exam: "Your exam date",
    left: d => d < 0 ? "Date passed" : d === 0 ? "Exam today! Good luck" : d === 1 ? "1 day left" : `${d} days left`,
    scores: "Your level per exam domain", noQ: "No questions answered yet", qs: n => n === 1 ? "1 question" : `${n} questions`,
    quizMe: "Quiz me", any: "🎯 Question (focus on weakest)", plan: "Your plan", readW: "📖 With Dobby", big: "Too big for Dobby", ready: p => `Approx. readiness: ${p}% (passing is about 70%)`,
    myPlan: "🗓️ Make me a study schedule", explain: "💬 Explain a domain", loading: "Preparing a question…", err: "Couldn't get a question right now, try again shortly.",
    check: "Check answer", right: "✅ Correct!", wrong: "❌ Wrong", correct: "Correct:", next: "Next question", pick2: "Pick two",
    readAsk: (t, u) => `Read "${t}" and summarize the key points for the CLF-C02 exam: ${u}`,
    planAsk: (d) => `Make me a CLF-C02 study schedule in my order (basics, exam prep, review and practice tests)${d ? ` with my exam on ${d}` : " (no exam date yet, suggest a duration)"}, focusing on my weakest domains.`,
    domAsk: n => `Explain the "${n}" domain of CLF-C02 simply: key services, concepts and question keywords.`,
    hist: (d, q, o) => `📘 CLF-C02 question (${d}):\n${q}\n${o}`, ans: (a, ok, c) => `My answer: ${a}. ${ok ? "Correct" : "Wrong"}. Correct: ${c}` },
};
const L = () => T[A().lang()] || T.ar;
const LET = "ABCDE";
let st = { done: {}, stats: {}, recent: [], exam: "" }, loaded = null, on = false, busyQ = false;

function load() {
  if (!loaded) loaded = (async () => {
    const { data, error } = await A().sb.from("config").select("value").eq("key", "clf").maybeSingle();
    if (error) { loaded = null; throw error; }
    if (data && data.value) st = Object.assign({ done: {}, stats: {}, recent: [], exam: "" }, data.value);
  })();
  return loaded;
}
async function save() {
  st.recent = st.recent.slice(-40);
  const { error } = await A().sb.from("config").upsert({ key: "clf", value: st });
  if (error) console.error("[clf] save failed:", error.message);
}
const acc = d => { const s = st.stats[d]; return s && s.n ? Math.round(s.ok / s.n * 100) : null; };
function daysTo(iso) { if (!iso) return null; const d = new Date(iso + "T23:59:59"); return isNaN(d) ? null : Math.ceil((d - new Date()) / 864e5) - 1; }
function readiness() {
  let w = 0, s = 0, n = 0;
  for (const d in DOM) { const a = acc(d); if (a === null) continue; w += DOM[d].w; s += DOM[d].w * a; n += st.stats[d].n; }
  return n >= 8 && w ? Math.round(s / w) : null;
}
/** Short English line about her progress, sent with study chats. */
function progress() {
  const done = PLAN.flatMap(p => p.steps).filter(x => st.done[x.id]).map(x => x.en);
  const dom = Object.keys(DOM).map(d => `${DOM[d].en} ${acc(d) === null ? "no quiz yet" : acc(d) + "% of " + st.stats[d].n}`).join("; ");
  const dd = daysTo(st.exam), wrong = st.recent.filter(r => !r.ok).slice(-4).map(r => r.t).filter(Boolean);
  return `Exam date: ${st.exam ? st.exam + ` (${dd} days left)` : "not set"}. Steps done: ${done.join(", ") || "none"}. Quiz accuracy: ${dom}.${wrong.length ? " Recently missed topics: " + wrong.join(", ") + "." : ""}`;
}
const STUDY_RE = /\b(aws|clf|c02|cloud practitioner|ec2|s3|iam|vpc|lambda)\b|سحاب|شهادة\s*aws|الشهادة|كلاود/i;
function study(text) { if (!on && STUDY_RE.test(text || "")) { on = true; load().catch(() => {}); } return on; }

/* ---- panel ---- */
function weakest() {
  // weighted by exam weight and how weak she is (unknown domains count as 50%)
  const ds = Object.keys(DOM), score = d => DOM[d].w * (1.15 - ((acc(d) ?? 50) / 100)) * (st.stats[d] && st.stats[d].n >= 3 ? 1 : 1.4);
  let r = Math.random() * ds.reduce((a, d) => a + score(d), 0);
  for (const d of ds) { r -= score(d); if (r <= 0) return d; }
  return "d3";
}
function paintPanel() {
  const l = L(), lang = A().lang(), box = $("clfBox"), dd = daysTo(st.exam), rd = readiness();
  const autoOk = Object.keys(DOM).every(d => (acc(d) ?? 0) >= 80 && st.stats[d].n >= 5);
  box.innerHTML = `<div class="clf-h"><b>${esc(l.title)}</b><button type="button" class="linkbtn" data-clf="back">${esc(l.back)}</button></div>
    <label class="clf-exam">${esc(l.exam)} <input type="date" id="clfExam" value="${esc(st.exam)}">${dd !== null ? `<span class="clf-left">${esc(l.left(dd))}</span>` : ""}</label>
    <div class="clf-sec"><h3>${esc(l.scores)}</h3>${rd !== null ? `<p class="clf-ready">${esc(l.ready(rd))}</p>` : ""}
    ${Object.entries(DOM).map(([d, x]) => { const a = acc(d), n = st.stats[d] ? st.stats[d].n : 0;
      return `<div class="clf-dom"><div class="clf-dn"><span>${esc(x[lang] || x.ar)} <small>${x.w}٪</small></span><small>${a === null ? esc(l.noQ) : `${a}٪ · ${esc(l.qs(n))}`}</small>
        <div class="bar"><i class="${a === null ? "" : a >= 80 ? "good" : a >= 60 ? "mid" : "low"}" style="width:${a ?? 0}%"></i></div></div>
        <button type="button" class="clf-q" data-clf="quiz" data-d="${d}">${esc(l.quizMe)}</button></div>`; }).join("")}
    <div class="clf-acts"><button type="button" class="save" data-clf="quiz">${esc(l.any)}</button>
    <button type="button" class="ghost" data-clf="plan">${esc(l.myPlan)}</button></div></div>
    <div class="clf-sec"><h3>${esc(l.plan)}</h3>${PLAN.map(p => `<h4>${esc(p[lang] || p.ar)}</h4><ul class="clf-steps">${p.steps.map(s => {
      const done = s.auto ? autoOk : !!st.done[s.id], name = s[lang] || s.ar;
      return `<li class="${done ? "done" : ""}"><label><input type="checkbox" data-step="${s.id}"${done ? " checked" : ""}${s.auto ? " disabled" : ""}>
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>` : `<span>${esc(name)}</span>`}</label>
        ${s.read ? `<button type="button" class="clf-read" data-clf="read" data-s="${s.id}">${esc(l.readW)}</button>` : s.big ? `<small class="clf-big">${esc(l.big)}</small>` : ""}</li>`; }).join("")}</ul>`).join("")}</div>`;
}
function show() {
  if (window.LibChats) LibChats.hideList();
  on = true; $("msgs").hidden = true; $("clfBox").hidden = false; $("clfBox").innerHTML = `<p class="cl-empty">…</p>`;
  load().then(paintPanel, () => { $("clfBox").innerHTML = `<p class="cl-empty">${esc(L().err)}</p>`; });
}
function hide() { const b = $("clfBox"); if (b && !b.hidden) { b.hidden = true; $("msgs").hidden = false; $("msgs").scrollTop = 1e9; } }

/* ---- quiz card ---- */
function shuffle(q) {
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { ...q, options: idx.map(i => q.options[i]), answer: q.answer.map(a => idx.indexOf(a)).sort() };
}
async function quiz(domain) {
  const app = A(); if (busyQ || app.busy()) return;
  hide(); on = true; busyQ = true; app.setBusy(true); app.setPose("think");
  const d = DOM[domain] ? domain : weakest(), l = L();
  const wrap = document.createElement("div"); wrap.className = "m cat-m quiz"; wrap.innerHTML = `<div class="body">${esc(l.loading)}</div>`;
  $("msgs").appendChild(wrap); $("msgs").scrollTop = 1e9;
  try {
    await load().catch(() => {});
    const multi = Math.random() < 0.2;
    const { data, error } = await app.sb.functions.invoke("cat", { body: { quiz: { domain: d, multi, avoid: st.recent.slice(-8).map(r => r.q || r.t).filter(Boolean) } } });
    if (error || !data || !data.quiz) throw (error || new Error("no quiz"));
    card(wrap, shuffle(data.quiz));
    app.setPose("explain", 3000);
  } catch (e) {
    console.error("[clf] quiz", e); wrap.querySelector(".body").textContent = l.err; app.setPose("happy");
  } finally { busyQ = false; app.setBusy(false); }
}
function card(wrap, q) {
  const app = A(), l = L(), lang = A().lang(), dn = DOM[q.domain][lang] || DOM[q.domain].ar, need = q.answer.length;
  const opts = q.options.map((o, i) => `${LET[i]}) ${o}`).join("\n");
  app.history().push({ role: "assistant", content: l.hist(DOM[q.domain].en, q.question, opts) });
  wrap.innerHTML = `<div class="body"><div class="qz-tag">📘 ${esc(dn)}${q.topic ? ` · ${esc(q.topic)}` : ""}</div>
    <p class="qz-q" dir="ltr">${esc(q.question)}</p>${q.question_ar ? `<p class="qz-ar">${esc(q.question_ar)}</p>` : ""}
    ${need > 1 ? `<p class="qz-hint">${esc(l.pick2)}</p>` : ""}
    <div class="qz-opts" role="group">${q.options.map((o, i) => `<button type="button" class="qz-o" data-i="${i}" dir="ltr" aria-pressed="false"><b>${LET[i]}</b><span>${esc(o)}</span></button>`).join("")}</div>
    ${need > 1 ? `<button type="button" class="save qz-check" disabled>${esc(l.check)}</button>` : ""}<div class="qz-res" hidden></div></div>`;
  const btns = [...wrap.querySelectorAll(".qz-o")], check = wrap.querySelector(".qz-check");
  let picked = [], done = false;
  const finish = () => {
    done = true; btns.forEach(b => b.disabled = true); if (check) check.hidden = true;
    const ok = picked.length === need && picked.every(i => q.answer.includes(i));
    btns.forEach((b, i) => { if (q.answer.includes(i)) b.classList.add("ok"); else if (picked.includes(i)) b.classList.add("bad"); });
    const s = st.stats[q.domain] || (st.stats[q.domain] = { ok: 0, n: 0 }); s.n++; if (ok) s.ok++;
    st.recent.push({ d: q.domain, t: q.topic, q: q.question.slice(0, 140), ok, at: new Date().toISOString() }); save();
    const corr = q.answer.map(i => `${LET[i]}) ${q.options[i]}`).join(" + ");
    app.history().push({ role: "user", content: l.ans(picked.map(i => LET[i]).join(" + "), ok, corr) });
    app.history().push({ role: "assistant", content: q.explain });
    const res = wrap.querySelector(".qz-res"); res.hidden = false;
    res.innerHTML = `<p class="qz-v ${ok ? "good" : "low"}">${esc(ok ? l.right : l.wrong)}${ok ? "" : ` <span>${esc(l.correct)} ${esc(q.answer.map(i => LET[i]).join(" + "))}</span>`}</p>
      <div class="qz-ex md">${window.LibMd ? LibMd.render(q.explain) : esc(q.explain)}</div>
      <div class="qz-next"><button type="button" class="save" data-clf="quiz" data-d="${q.domain}">${esc(l.next)}</button><button type="button" class="ghost" data-clf="quiz">${esc(l.any)}</button></div>`;
    app.setPose(ok ? "celebrate" : "explain", 2500); $("msgs").scrollTop = 1e9;
  };
  btns.forEach(b => b.onclick = () => {
    if (done) return; const i = +b.dataset.i;
    if (need === 1) { picked = [i]; b.setAttribute("aria-pressed", "true"); finish(); return; }
    picked = picked.includes(i) ? picked.filter(x => x !== i) : picked.concat(i).slice(-need);
    btns.forEach((x, k) => x.setAttribute("aria-pressed", picked.includes(k)));
    check.disabled = picked.length !== need;
  });
  if (check) check.onclick = () => { if (picked.length === need) finish(); };
  $("msgs").scrollTop = 1e9;
}

/* ---- wiring ---- */
function ask(text) { hide(); const app = A(); if (app.ask) app.ask(text); }
function paint() {
  const q = $("quick"); if (!q || q.querySelector(".clf-chip")) return;
  const b = document.createElement("button"); b.type = "button"; b.className = "clf-chip"; b.textContent = L().chip;
  q.prepend(b);
  if (!$("clfBox").hidden) load().then(paintPanel, () => {});
}
function init() {
  if (!$("clfBox")) return;
  $("quick").addEventListener("click", e => { if (e.target.closest(".clf-chip")) { e.stopPropagation(); $("clfBox").hidden ? show() : hide(); } }, true);
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-clf]"); if (!b || !$("chat").contains(b)) return;
    const k = b.dataset.clf, l = L();
    if (k === "back") hide();
    else if (k === "quiz") quiz(b.dataset.d);
    else if (k === "plan") ask(l.planAsk(st.exam));
    else if (k === "read") { const s = PLAN.flatMap(p => p.steps).find(x => x.id === b.dataset.s); if (s) ask(l.readAsk(s[A().lang()] || s.ar, s.url)); }
  });
  $("clfBox").addEventListener("change", e => {
    const t = e.target;
    if (t.id === "clfExam") { st.exam = /^\d{4}-\d{2}-\d{2}$/.test(t.value) ? t.value : ""; save(); paintPanel(); }
    else if (t.dataset && t.dataset.step) { if (t.checked) st.done[t.dataset.step] = true; else delete st.done[t.dataset.step]; save(); t.closest("li").classList.toggle("done", t.checked); }
  });
}
window.LibClf = { study, progress, paint, hide, quiz, reset() { on = false; hide(); }, _state: () => st };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
