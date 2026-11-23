/* Recommendations ("لك الحين"): picks up to 4 next steps from the library, with a reason for each.
   Pure client-side, no new tables. Snoozes are saved in config key "recs" ({snooze:{id:"YYYY-MM-DD"}}).
   The same ranking lives in supabase/functions/_shared/recs.ts so Dobby recommends the same things. Keep them in sync. */
(function () {
"use strict";
const OPP_TYPES = ["job", "event"], OPP_TABS = ["c-jobs", "c-madinah"];
const isOpp = x => OPP_TYPES.includes(x.type) || OPP_TABS.includes(x.tab);
function daysLeft(iso, now) { if (!iso) return null; const d = new Date(iso + "T23:59:59"); if (isNaN(d)) return null; return Math.ceil((d - now) / 864e5) - 1; }
function ageDays(iso, now) { const d = new Date(iso || 0); return isNaN(d) ? 999 : Math.max(0, (now - d) / 864e5); }

/* returns [{item, kind, score, days, tab}] best first; kind: "deadline" | "continue" | "next" */
function rank(items, opts) {
  const now = (opts && opts.now) || new Date(), perTabMax = (opts && opts.perTab) || 2, snooze = (opts && opts.snooze) || {}, max = (opts && opts.max) || 4;
  const today = now.toISOString().slice(0, 10);
  // how much she works on each section: started counts 2, done counts 1
  const aff = {}; let tot = 0;
  for (const x of items) if (!isOpp(x) && x.status > 0) { const w = x.status === 1 ? 2 : 1; aff[x.tab] = (aff[x.tab] || 0) + w; tot += w; }
  const out = [];
  for (const x of items) {
    if (x.status === 2) continue;
    if (snooze[x.id] && snooze[x.id] > today) continue;
    const d = daysLeft(x.due, now);
    if (d !== null && d < 0) continue;                       // deadline already passed
    let kind, score;
    if (isOpp(x)) {
      if (d === null || d > 21) continue;                    // only opportunities that close soon
      kind = "deadline"; score = 100 - d * 3;
    } else if (x.status === 1) {
      kind = "continue"; score = 70 - Math.min(20, ageDays(x.updated_at, now) / 2);
    } else {
      kind = "next";
      score = 30 + (tot ? 30 * (aff[x.tab] || 0) / tot : 0)
        + (x.type === "course" || x.type === "lab" ? 5 : 0)
        + Math.max(0, 10 - ageDays(x.added, now) / 3);      // a little boost for new additions
      if (d !== null && d <= 30) { kind = "deadline"; score += 40 - d; }
    }
    out.push({ item: x, kind, score, days: d, tab: x.tab });
  }
  out.sort((a, b) => b.score - a.score);
  // variety: at most 2 from the same section, and at most 2 opportunities
  const pick = [], perTab = {}; let opp = 0;
  for (const r of out) {
    if (pick.length >= max) break;
    if ((perTab[r.tab] || 0) >= perTabMax) continue;
    if (isOpp(r.item) && opp >= 2) continue;
    pick.push(r); perTab[r.tab] = (perTab[r.tab] || 0) + 1; if (isOpp(r.item)) opp++;
  }
  // if she has something in progress, always keep one "continue"
  if (!pick.some(r => r.kind === "continue")) {
    const c = out.find(r => r.kind === "continue");
    if (c) { if (pick.length >= max) pick.pop(); pick.push(c); }
  }
  return pick;
}

const T = {
  ar: { title: "لك الحين", sub: "اقتراحات من مكتبتك حسب تقدمك والمواعيد", deadline: d => d === 0 ? "يقفل اليوم" : d === 1 ? "يقفل بكرة" : `يقفل بعد ${d} ${d <= 10 ? "أيام" : "يوم"}`,
    cont: "بديتي فيها، كمّليها", next: s => `من ${s}، المجال اللي تشتغلين عليه`, fresh: "جديدة في مكتبتك", start: "ابدئي", later: "مو الحين", open: "افتحي", ask: "اسألي دوبي",
    hide: "إخفاء", show: "اقتراحات" },
  en: { title: "For you now", sub: "Picked from your library by progress and deadlines", deadline: d => d === 0 ? "Closes today" : d === 1 ? "Closes tomorrow" : `Closes in ${d} days`,
    cont: "You started this, keep going", next: s => `From ${s}, the area you're working on`, fresh: "New in your library", start: "Start", later: "Not now", open: "Open", ask: "Ask Dobby",
    hide: "Hide", show: "Suggestions" }
};
let snooze = {}, collapsed = false;
try { collapsed = localStorage.getItem("lib-recs-off") === "1"; } catch (_) {}

/* ctx: {items, lang, tab, tabName, esc, safeUrl, TYPES, sb, onStart(item), onAsk(text)} */
let ctx = null;
function paint(c) {
  ctx = c; const el = document.getElementById("recs"); if (!el) return;
  const t = T[c.lang] || T.ar, esc = c.esc;
  const pool = c.tab === "all" ? c.items : c.items.filter(x => x.tab === c.tab);
  const picks = rank(pool, { snooze, max: c.tab === "all" ? 4 : 3, perTab: c.tab === "all" ? 2 : 3 });
  if (!picks.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  if (collapsed) {
    el.className = "recs off";
    el.innerHTML = `<button class="recs-toggle" type="button" data-recs="toggle" aria-expanded="false">✦ ${esc(t.show)} <b>${picks.length}</b></button>`;
    return;
  }
  el.className = "recs";
  const why = r => r.kind === "deadline" && r.days !== null ? t.deadline(r.days) : r.kind === "continue" ? t.cont
    : (r.item.added && (new Date() - new Date(r.item.added)) / 864e5 < 7) ? t.fresh : t.next(c.tabName(r.tab));
  el.innerHTML = `<div class="recs-h"><div><h2>✦ ${esc(t.title)}</h2><p>${esc(t.sub)}</p></div><button class="recs-toggle" type="button" data-recs="toggle" aria-expanded="true">${esc(t.hide)}</button></div>
  <ol class="recs-list">${picks.map(r => {
    const x = r.item, title = c.lang === "en" && x.title_en ? x.title_en : x.title, ty = c.TYPES[x.type] || c.TYPES.article, url = c.safeUrl(x.url);
    return `<li class="rec k-${r.kind}">
      <span class="why">${esc(why(r))}</span>
      <b class="rt">${esc(title)}</b>
      <span class="rm">${esc(ty[c.lang])}${c.tab === "all" ? " · " + esc(c.tabName(x.tab)) : ""}</span>
      <span class="ra">${x.status === 0 && r.kind !== "deadline" ? `<button type="button" class="rb main" data-recs="start" data-id="${esc(x.id)}">${esc(t.start)}</button>` : url ? `<a class="rb main" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t.open)}</a>` : ""}
      <button type="button" class="rb" data-recs="ask" data-title="${esc(title)}">${esc(t.ask)}</button>
      <button type="button" class="rb quiet" data-recs="later" data-id="${esc(x.id)}">${esc(t.later)}</button></span>
    </li>`; }).join("")}</ol>`;
}
async function load(sb) {
  try { const { data } = await sb.from("config").select("value").eq("key", "recs").maybeSingle(); snooze = (data && data.value && data.value.snooze) || {}; } catch (_) { snooze = {}; }
}
async function saveSnooze() {
  const today = new Date().toISOString().slice(0, 10);
  for (const k of Object.keys(snooze)) if (snooze[k] <= today) delete snooze[k];   // keep it small
  try { await ctx.sb.from("config").upsert({ key: "recs", value: { snooze } }); } catch (_) {}
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-recs]"); if (!b || !ctx) return;
  const a = b.dataset.recs;
  if (a === "toggle") { collapsed = !collapsed; try { localStorage.setItem("lib-recs-off", collapsed ? "1" : "0"); } catch (_) {} paint(ctx); return; }
  if (a === "later") { const d = new Date(); d.setDate(d.getDate() + 7); snooze[b.dataset.id] = d.toISOString().slice(0, 10); paint(ctx); saveSnooze(); return; }
  if (a === "start") { const it = ctx.items.find(x => x.id === b.dataset.id); if (it) ctx.onStart(it); return; }
  if (a === "ask") ctx.onAsk(b.dataset.title);
});
window.LibRecs = { rank, paint, load };
})();
