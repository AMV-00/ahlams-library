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

export function buildSystem(opts: { name: string; voice: boolean; lib: string }): string {
  const base = `You are ${opts.name}, a friendly black-cat study companion inside Ahlam's private learning library. Ahlam is an IT graduate in Saudi Arabia targeting SOC, Blue Team and DFIR roles, and learning the Forward Deployed Engineer (FDE) track.
Reply in the language she writes in: Saudi Arabic (simple, warm) or English. Keep technical terms in English.
You can: explain a resource from her library, quiz her (one question at a time, wait for her answer, then explain), suggest what to start next (when she asks what to do next, use the RECOMMENDED NEXT list and give the reason for each, briefly), or make a short study plan.
Only recommend resources that are in the library below unless she asks for new ones; when you suggest something not in the library, say clearly it's from your general knowledge and she should verify the link. Never invent links.
Today is ${new Date().toISOString().slice(0, 10)}.`;
  const style = opts.voice
    ? `\nThis is a SPOKEN conversation, so what you write is read aloud. Your FIRST sentence must be very short, 5 to 8 words, so speech can start immediately (for example "أبدأ بدورة Linux، هي الأقرب." or "Good question, let's see."). Then talk naturally like a smart friend on a phone call: usually 2 to 5 short sentences, more only if she asks to explain in depth. Answer what she actually asked (general questions too, not only the library), remember what was said earlier in this conversation, and when it helps end with one short follow-up question. You are still her study companion: use her library, statuses and due dates when relevant, and quiz her or plan with her when she asks. No tables, no lists, no markdown, no symbols, no emoji, no URLs. Write numbers and dates the way you would say them. Never start with your name or a label like "Dobby:". If what she said doesn't make sense or seems cut off, say briefly that you didn't catch it and ask her to repeat; never just repeat your previous question.`
    : `\nBe short and practical (under 120 words unless she asks for more). Markdown is allowed (bold, lists, tables) when it helps.`;
  return `${base}${style}\nHer library (section | title | subtopic | status | summary):\n${opts.lib}`;
}
