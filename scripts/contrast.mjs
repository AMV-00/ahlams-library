// WCAG check of the colour tokens in styles.css, for dark (default) and light. Fails (exit 1) on any text pair < 4.5:1
// or any control/graphic pair < 3:1. Run: npm run contrast
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const block = re => { const m = css.match(re); if (!m) throw new Error("block not found: " + re); return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2].trim()])); };
const dark = block(/:root\{([^}]*)\}/), light = { ...dark, ...block(/:root\[data-theme="light"\]\{([^}]*)\}/) };

const parse = v => {
  let m = v.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = v.match(/^rgba?\(([^)]+)\)$/); if (m) { const p = m[1].split(",").map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error("bad colour " + v);
};
const over = (t, b) => [0, 1, 2].map(i => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

let fails = 0;
for (const [name, T] of [["dark", dark], ["light", light]]) {
  const c = k => parse(T[k]);
  const surf = { bg: c("bg"), panel: c("panel"), "panel-2": c("panel-2") };
  const soft = (k, on) => over(c(k), surf[on]);
  const text = [   // [label, foreground token, background colour]
    ...["bg", "panel", "panel-2"].flatMap(s => ["ink", "ink-2", "ink-3", "accent-text"].map(t => [`${t} on ${s}`, t, surf[s]])),
    ["accent-ink on accent (buttons, selected tab)", "accent-ink", c("accent")],
    ["accent-text on accent-soft/panel", "accent-text", soft("accent-soft", "panel")],
    ["learn on learn-soft/panel", "learn", soft("learn-soft", "panel")],
    ["done on done-soft/panel", "done", soft("done-soft", "panel")],
    ["due on due-soft/panel", "due", soft("due-soft", "panel")],
    ["due on panel (card)", "due", surf.panel],
    ["due on panel-2 (recommendation reason)", "due", surf["panel-2"]],
    ["rec on rec-soft/panel-2", "rec", soft("rec-soft", "panel-2")],
  ];
  const ui = [     // controls & graphics need 3:1
    ...["bg", "panel", "panel-2"].map(s => [`control border on ${s}`, "ctl", surf[s]]),
    ["progress fill (cyan) on track (panel-2)", "cyan", surf["panel-2"]],
    ["accent on bg", "accent", surf.bg],
    ["rec dot on panel-2", "rec-dot", surf["panel-2"]],
  ];
  console.log(`\n== ${name}`);
  for (const [label, tok, bg, min] of [...text.map(x => [...x, 4.5]), ...ui.map(x => [...x, 3])]) {
    const r = ratio(over(c(tok), bg), bg), ok = r >= min; if (!ok) fails++;
    if (!ok || process.argv.includes("-v")) console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2)}:1 (min ${min})  ${label}`);
  }
}
console.log(fails ? `\n${fails} failing pair(s)` : "\ncontrast: all pairs pass (text >= 4.5:1, controls/graphics >= 3:1)");
process.exit(fails ? 1 : 0);
