// Same ranking as recs.js in the site (keep them in sync), so Dobby recommends what the "لك الحين" box shows.
type Item = { id?: string; tab: string; type?: string; title: string; status: number; due?: string | null; added?: string | null; updated_at?: string | null };
const OPP_TYPES = ["job", "event"], OPP_TABS = ["c-jobs", "c-madinah"];
const isOpp = (x: Item) => OPP_TYPES.includes(x.type ?? "") || OPP_TABS.includes(x.tab);
function daysLeft(iso: string | null | undefined, now: Date) { if (!iso) return null; const d = new Date(iso + "T23:59:59"); if (isNaN(+d)) return null; return Math.ceil((+d - +now) / 864e5) - 1; }
function ageDays(iso: string | null | undefined, now: Date) { const d = new Date(iso || 0); return isNaN(+d) ? 999 : Math.max(0, (+now - +d) / 864e5); }

export function rank(items: Item[], max = 5, now = new Date()) {
  const aff: Record<string, number> = {}; let tot = 0;
  for (const x of items) if (!isOpp(x) && x.status > 0) { const w = x.status === 1 ? 2 : 1; aff[x.tab] = (aff[x.tab] || 0) + w; tot += w; }
  const out: { item: Item; kind: string; score: number; days: number | null }[] = [];
  for (const x of items) {
    if (x.status === 2) continue;
    const d = daysLeft(x.due, now);
    if (d !== null && d < 0) continue;
    let kind: string, score: number;
    if (isOpp(x)) { if (d === null || d > 21) continue; kind = "deadline"; score = 100 - d * 3; }
    else if (x.status === 1) { kind = "continue"; score = 70 - Math.min(20, ageDays(x.updated_at, now) / 2); }
    else {
      kind = "next";
      score = 30 + (tot ? 30 * (aff[x.tab] || 0) / tot : 0) + (x.type === "course" || x.type === "lab" ? 5 : 0) + Math.max(0, 10 - ageDays(x.added, now) / 3);
      if (d !== null && d <= 30) { kind = "deadline"; score += 40 - d; }
    }
    out.push({ item: x, kind, score, days: d });
  }
  out.sort((a, b) => b.score - a.score);
  const pick: typeof out = [], perTab: Record<string, number> = {}; let opp = 0;
  for (const r of out) {
    if (pick.length >= max) break;
    if ((perTab[r.item.tab] || 0) >= 2) continue;
    if (isOpp(r.item) && opp >= 2) continue;
    pick.push(r); perTab[r.item.tab] = (perTab[r.item.tab] || 0) + 1; if (isOpp(r.item)) opp++;
  }
  if (!pick.some((r) => r.kind === "continue")) { const c = out.find((r) => r.kind === "continue"); if (c) { if (pick.length >= max) pick.pop(); pick.push(c); } }
  return pick;
}

export function recsText(items: Item[]): string {
  return rank(items).map((r, i) => `${i + 1}. [${r.item.tab}] ${r.item.title} (${r.kind === "deadline" ? `deadline in ${r.days} days` : r.kind === "continue" ? "she already started it" : "fits the area she is working on"})`).join("\n");
}
