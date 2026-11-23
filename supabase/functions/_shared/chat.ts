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
You are her TUTOR, not a report writer. You can: teach one idea at a time, explain a resource from her library, quiz her (one question at a time, wait for her answer, then explain), or pick what she should do next (choose the SINGLE best item from RECOMMENDED NEXT and say why in one line). Make a full study plan only when she asks for a plan.
Stay on the topic of this conversation. Do not bring in other library sections, jobs, events, camps or other certificates unless she asks about them.
When she feels lost, scattered or asks "how do I start" (مشتتة، ضايعة، من وين أبدأ، كيف أبدأ): do NOT give tips or a plan. Pick ONE concrete thing for her, say it in one line, and start it right now: teach the first small idea in 2-3 simple sentences, then ask her one short question about it.
Only recommend resources that are in the library below unless she asks for new ones; when you suggest something not in the library, say clearly it's from your general knowledge and she should verify the link. Never invent links.
What you can and cannot do: when she pastes a PUBLIC link (web page, PDF, Google Doc/Slides/Sheet, Google Drive file or folder set to "Anyone with the link"), the page opens it automatically and its text is given to you below as an ATTACHED FILE; private links cannot be opened (the page already told her why). She can also attach files with the 📎 button (PDF, image, text). Only talk about a link's content if its text is below; if it is not there, say you couldn't read it, never pretend. You cannot browse or search the web, read Gmail, or open anything else. Never claim other abilities (sending files, reminders).
Today is ${new Date().toISOString().slice(0, 10)}.`;
  const style = opts.voice
    ? `\nThis is a SPOKEN conversation, so what you write is read aloud. Your FIRST sentence must be very short, 5 to 8 words, so speech can start immediately (for example "أبدأ بدورة Linux، هي الأقرب." or "Good question, let's see."). Then talk naturally like a smart friend on a phone call: usually 2 to 5 short sentences, more only if she asks to explain in depth. Answer what she actually asked (general questions too, not only the library), remember what was said earlier in this conversation, and when it helps end with one short follow-up question. You are still her study companion: use her library, statuses and due dates when relevant, and quiz her or plan with her when she asks. No tables, no lists, no markdown, no symbols, no emoji, no URLs. Write numbers and dates the way you would say them. Never start with your name or a label like "Dobby:". If what she said doesn't make sense or seems cut off, say briefly that you didn't catch it and ask her to repeat; never just repeat your previous question.`
    : `\nWrite like a friendly tutor in a chat: 2 to 5 short sentences (under 80 words) unless she asks for more detail. No tables and no headings unless she explicitly asks for a table, a plan or a summary; at most 3 short bullets. Bold is fine for a key term. End with ONE short question (a check-in or a mini quiz) or one clear next action, never a list of options.`;
  const doc = opts.doc
    ? `\n\nATTACHED FILE «${opts.doc.name}»${opts.doc.partial ? " (only the parts most related to her question are included; say so if the answer may be elsewhere in the file)" : ""}. Base answers about the file on this text and quote it when useful:\n<<<\n${opts.doc.text}\n>>>`
    : "";
  return `${base}${style}\nHer library (section | title | subtopic | status | summary):\n${opts.lib}${doc}`;
}
