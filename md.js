/* Tiny, safe Markdown renderer for the cat's replies.
   Everything is HTML-escaped FIRST; only whitelisted tags are produced; links must be http(s). */
(function () {
"use strict";
const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function inline(raw) {
  const codes = [];
  let s = esc(raw).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
       .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
       .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
       .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const isRow = l => /^\s*\|.*\|\s*$/.test(l);
const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

function render(md) {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {                       // fenced code
      const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue;
    }
    if (isRow(l) && i + 1 < lines.length && isSep(lines[i + 1])) {   // table
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
        rows.map(r => `<tr>${head.map((_, k) => `<td>${inline(r[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    let m;
    if ((m = l.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) { out.push(`<p class="h"><strong>${inline(m[2])}</strong></p>`); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*[-*+•]\s+/.test(l)) {
      const it = []; while (i < lines.length && /^\s*[-*+•]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*[-*+•]\s+/, ""));
      out.push(`<ul>${it.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const it = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(`<ol>${it.map(x => `<li>${inline(x)}</li>`).join("")}</ol>`); continue;
    }
    if (/^\s*>\s?/.test(l)) {
      const b = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) b.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${inline(b.join(" "))}</blockquote>`); continue;
    }
    if (!l.trim()) { i++; continue; }
    const p = [l]; i++;                                                  // paragraph
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|[-*+•]\s|\d+[.)]\s|>|\|)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${p.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}
window.LibMd = { render };
})();
