// Edge Function "cat-fetch": lets Dobby read a link Ahlam pastes (public pages, public Google Drive files/folders/Docs, PDFs).
//   body: { url }  ->  {kind:"text", name, text} | {kind:"pdf", name, b64} | {kind:"folder", name, files:[{name,url}]} | {error, detail?}
// Only https, only public hosts (no IP literals / localhost / internal names), redirects checked hop by hop, 15 MB max.
// Nothing is stored. Private Drive files return {error:"private"}.
import { cors, json, userFromJwt } from "../_shared/auth.ts";

const MAX = 15 * 1024 * 1024, UA = "Mozilla/5.0 (compatible; AhlamsLibrary/1.0)";

function safe(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;             // no IP literals
  if (h.endsWith(".supabase.co") || h.endsWith(".supabase.in")) return false;
  return true;
}
async function get(url: string): Promise<Response> {
  let u = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    if (!safe(u)) throw new Error("blocked");
    const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" }, signal: AbortSignal.timeout(20000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location")!, u); continue; }
    return Object.assign(r, { finalUrl: u.toString() });
  }
  throw new Error("too many redirects");
}
async function body(r: Response): Promise<Uint8Array> {
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > MAX) throw new Error("too large");
  const reader = r.body!.getReader(), parts: Uint8Array[] = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > MAX) throw new Error("too large"); parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const unescape = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
function htmlText(html: string): { title: string; text: string } {
  const title = unescape((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim());
  const main = html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html;
  const text = unescape(main
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "- ").replace(/<h(\d)[^>]*>/gi, (_, n) => "\n" + "#".repeat(+n) + " ")
    .replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text };
}
function b64(b: Uint8Array): string { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
const fileName = (r: Response, fallback: string) => {
  const cd = r.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) ?? cd.match(/filename="?([^";]+)"?/i);
  try { return m ? decodeURIComponent(m[1]) : fallback; } catch { return m ? m[1] : fallback; }
};

/** Rewrite Google Drive / Docs share links to direct download or export URLs. */
function driveTarget(u: URL): { url: string; kind?: "folder"; name: string } | null {
  const h = u.hostname, p = u.pathname;
  let m = p.match(/\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/);
  if (h === "drive.google.com" && m) return { url: `https://drive.google.com/embeddedfolderview?id=${m[1]}`, kind: "folder", name: "Drive folder" };
  m = p.match(/\/file\/d\/([\w-]+)/) ?? (p.startsWith("/open") || p.startsWith("/uc") ? [null, u.searchParams.get("id")] as unknown as RegExpMatchArray : null);
  if (h === "drive.google.com" && m && m[1]) return { url: `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t`, name: "Drive file" };
  m = p.match(/\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
  if (h === "docs.google.com" && m) {
    const [, t, id] = m;
    const url = t === "document" ? `https://docs.google.com/document/d/${id}/export?format=txt`
      : t === "spreadsheets" ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
      : `https://docs.google.com/presentation/d/${id}/export/pdf`;
    return { url, name: t === "document" ? "Google Doc" : t === "spreadsheets" ? "Google Sheet" : "Google Slides" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  if (!userFromJwt(req)) return json(req, { error: "unauthorized" }, 401);
  let src: URL;
  try { src = new URL(String((await req.json()).url ?? "")); } catch { return json(req, { error: "bad url" }, 400); }
  if (!safe(src)) return json(req, { error: "blocked" }, 400);
  try {
    const d = driveTarget(src);
    const r = await get(d ? d.url : src.toString());
    if (!r.ok) return json(req, { error: r.status === 401 || r.status === 403 ? "private" : "http", status: r.status });
    const type = (r.headers.get("content-type") ?? "").toLowerCase(), bytes = await body(r);
    const finalUrl = (r as Response & { finalUrl?: string }).finalUrl ?? "";
    if (/accounts\.google\.com|ServiceLogin/.test(finalUrl) || (d && type.includes("text/html") && /accounts\.google\.com\/(v3\/)?signin|ServiceLogin/.test(decode(bytes.subarray(0, 200000)))))
      return json(req, { error: "private" });
    if (d?.kind === "folder") {
      const html = decode(bytes), files: { name: string; url: string }[] = [];
      const re = /<a href="(https:\/\/drive\.google\.com\/(?:file\/d|drive\/folders)\/[^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
      let m; while ((m = re.exec(html)) && files.length < 40) files.push({ url: unescape(m[1]), name: unescape(m[2]).trim() });
      const title = unescape(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Drive folder").trim();
      if (!files.length) return json(req, { error: /signin|ServiceLogin/.test(html) ? "private" : "empty folder" });
      return json(req, { kind: "folder", name: title, files });
    }
    const name = fileName(r, d ? d.name : (src.pathname.split("/").filter(Boolean).pop() || src.hostname)).slice(0, 80);
    if (type.includes("pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46))
      return json(req, { kind: "pdf", name: /\.pdf$/i.test(name) ? name : name + ".pdf", b64: b64(bytes) });
    if (type.includes("html")) {
      const { title, text } = htmlText(decode(bytes));
      return json(req, { kind: "text", name: (title || name).slice(0, 80), text: text.slice(0, 200000) });
    }
    if (type.startsWith("text/") || /json|csv|xml|markdown/.test(type)) return json(req, { kind: "text", name, text: decode(bytes).slice(0, 200000) });
    return json(req, { error: "unsupported", type: type.split(";")[0] });
  } catch (e) {
    const m = String((e as Error).message ?? e);
    console.error("cat-fetch", src.hostname, m);
    return json(req, { error: m === "too large" ? "too large" : m === "blocked" ? "blocked" : "fetch" });
  }
});
