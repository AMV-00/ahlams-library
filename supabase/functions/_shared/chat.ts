// Shared by `cat` (text chat) and `cat-voice` (push-to-talk). No secrets here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { recsText } from "./recs.ts";

// Library context cache per user (60 s) so repeated turns don't pay a DB round trip each time.
const cache = new Map<string, { at: number; lib: string }>();

/** Library as text, read with the CALLER's JWT so RLS applies. null = not a real signed-in user. */
export async function getLibrary(req: Request, sub: string, max: number): Promise<string | null> {
  const hit = cache.get(sub);
  if (hit && Date.now() - hit.at < 60_000) return hit.lib.slice(0, max);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await sb.from("items").select("id,tab,type,title,sub,status,due,added,updated_at,summary_en,summary_ar").limit(500);
  if (error) return null;
  const rows = (data ?? []).map((x) =>
    `- [${x.tab}] ${x.title} | ${x.sub ?? ""} | status=${["not started", "learning", "done"][x.status] ?? "not started"}${x.due ? ` | due ${x.due}` : ""} | ${x.summary_en ?? x.summary_ar ?? ""}`
  ).join("\n");
  // Put the recommendations first so they survive the length cut in voice mode.
  const recs = recsText((data ?? []).map((x) => ({ ...x, status: Number(x.status) || 0 })));
  const lib = (recs ? `RECOMMENDED NEXT (same list her site shows in "لك الحين"; best first):\n${recs}\n\nFULL LIBRARY:\n` : "") + rows;
  cache.set(sub, { at: Date.now(), lib });
  return lib.slice(0, max);
}

type Msg = { role: string; content: string };
/** Keep the newest messages that fit in `maxChars` (Groq's free tier rejects big requests: 413/429 on tokens per minute).
 *  One very long pasted message or answer is cut instead of pushing everything else out. */
export function fitHistory(msgs: Msg[], maxChars: number, perMsg = 2500): Msg[] {
  const out: Msg[] = []; let used = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i], c = m.content.length > perMsg ? m.content.slice(0, perMsg) + " …" : m.content;
    if (out.length && used + c.length > maxChars) break;
    out.unshift({ role: m.role, content: c }); used += c.length;
  }
  while (out.length && out[0].role !== "user") out.shift();       // start with a user turn
  return out;
}

/** POST to Groq chat; if the request is too big or rate-limited by tokens, retry ONCE with a smaller library and history. */
export async function groqChat(key: string, body: Record<string, unknown>, build: (small: boolean) => Msg[]): Promise<Response> {
  const call = (small: boolean) => fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, messages: build(small) }),
  });
  const r = await call(false);
  if (r.status !== 413 && r.status !== 429 && r.status !== 400) return r;
  const t = (await r.text()).slice(0, 300);
  console.error("groq rejected the full request, retrying smaller", r.status, body.model, t);
  if (r.status === 429 && !/token|TPM|too large/i.test(t)) return new Response(t, { status: 429 });
  return call(true);
}

export type Doc = { name: string; text: string; partial?: boolean };
/** A file she attached (text extracted in her browser). Long files: keep the start + the parts that share words with the question. */
export function readDoc(raw: unknown, question: string, budget: number): Doc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const name = String(d.name ?? "file").slice(0, 80), text = String(d.text ?? "").slice(0, 60000);
  if (!text.trim()) return null;
  if (text.length <= budget) return { name, text, partial: !!d.partial };
  const chunks: string[] = []; for (let i = 0; i < text.length; i += 1400) chunks.push(text.slice(i, i + 1400));
  const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).map((w) => w.replace(/^(ال|وال|بال|لل)/, ""));
  const q = new Set(words(question));
  const pick = new Set([0]); let used = chunks[0].length;
  const scored = chunks.map((c, i) => ({ i, s: words(c).filter((w) => q.has(w)).length })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  for (const { i } of scored) { if (used + chunks[i].length > budget) continue; pick.add(i); used += chunks[i].length; }
  for (let i = 1; i < chunks.length && used < budget * 0.6; i++) if (!pick.has(i)) { pick.add(i); used += chunks[i].length; }
  return { name, text: [...pick].sort((a, b) => a - b).map((i) => chunks[i]).join("\n…\n"), partial: true };
}

export function buildSystem(opts: { name: string; voice: boolean; lib: string; doc?: Doc | null }): string {
  const base = `You are ${opts.name}, a friendly black-cat study companion inside Ahlam's private learning library. Her name is أحلام (Ahlam): always call her أحلام in Arabic and Ahlam in English, never any other name (not أمل). Ahlam is an IT graduate in Saudi Arabia targeting SOC, Blue Team and DFIR roles, and learning the Forward Deployed Engineer (FDE) track.
Reply in the language she writes in: Saudi Arabic (simple, warm) or English. Keep technical terms in English.
You can: explain a resource from her library, quiz her (one question at a time, wait for her answer, then explain), suggest what to start next (when she asks what to do next, use the RECOMMENDED NEXT list and give the reason for each, briefly), or make a short study plan.
Only recommend resources that are in the library below unless she asks for new ones; when you suggest something not in the library, say clearly it's from your general knowledge and she should verify the link. Never invent links.
What you can and cannot do: you CANNOT open links, browse the web, or read Google Drive, Gmail or any website, even if she pastes a link; say so plainly and never pretend you read something. She CAN attach a file with the 📎 button next to the message box (PDF, image, or text file); then its text is given to you below and you can explain it, summarise it, quiz her on it or make a plan from it. Never claim any other ability (sending files, reminders, remembering between chats).
Today is ${new Date().toISOString().slice(0, 10)}.`;
  const style = opts.voice
    ? `\nThis is a SPOKEN conversation, so what you write is read aloud. Your FIRST sentence must be very short, 5 to 8 words, so speech can start immediately (for example "أبدأ بدورة Linux، هي الأقرب." or "Good question, let's see."). Then talk naturally like a smart friend on a phone call: usually 2 to 5 short sentences, more only if she asks to explain in depth. Answer what she actually asked (general questions too, not only the library), remember what was said earlier in this conversation, and when it helps end with one short follow-up question. You are still her study companion: use her library, statuses and due dates when relevant, and quiz her or plan with her when she asks. No tables, no lists, no markdown, no symbols, no emoji, no URLs. Write numbers and dates the way you would say them. Never start with your name or a label like "Dobby:". If what she said doesn't make sense or seems cut off, say briefly that you didn't catch it and ask her to repeat; never just repeat your previous question.`
    : `\nBe short and practical (under 120 words unless she asks for more). Markdown is allowed (bold, lists, tables) when it helps.`;
  const doc = opts.doc
    ? `\n\nATTACHED FILE «${opts.doc.name}»${opts.doc.partial ? " (only the parts most related to her question are included; say so if the answer may be elsewhere in the file)" : ""}. Base answers about the file on this text and quote it when useful:\n<<<\n${opts.doc.text}\n>>>`
    : "";
  return `${base}${style}\nHer library (section | title | subtopic | status | summary):\n${opts.lib}${doc}`;
}
