// Edge Function "cat": the assistant, proxied to Groq. GROQ_API_KEY lives ONLY in Supabase secrets.
//   body: { messages, name?, mode?: "chat" | "voice", stream?: boolean }
//   chat  -> GROQ_MODEL (default openai/gpt-oss-120b), markdown allowed
//   voice -> GROQ_VOICE_MODEL (default openai/gpt-oss-20b), 2-3 spoken sentences, no markdown
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, userFromJwt } from "../_shared/auth.ts";

const CHAT_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const VOICE_MODEL = Deno.env.get("GROQ_VOICE_MODEL") ?? "openai/gpt-oss-20b";

// Library context cache per user (60 s) so voice turns don't pay a DB round trip each time.
const cache = new Map<string, { at: number; lib: string }>();

async function library(req: Request, sub: string, max: number): Promise<string | null> {
  const hit = cache.get(sub);
  if (hit && Date.now() - hit.at < 60_000) return hit.lib.slice(0, max);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await sb.from("items").select("tab,title,sub,status,due,summary_en,summary_ar").limit(500);
  if (error) return null; // RLS denied -> not a real signed-in user
  const lib = (data ?? []).map((x) =>
    `- [${x.tab}] ${x.title} | ${x.sub ?? ""} | status=${["not started", "learning", "done"][x.status] ?? "not started"}${x.due ? ` | due ${x.due}` : ""} | ${x.summary_en ?? x.summary_ar ?? ""}`
  ).join("\n");
  cache.set(sub, { at: Date.now(), lib });
  return lib.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "assistant not configured" }, 503);
  const user = userFromJwt(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);

  let body: { messages?: { role: string; content: string }[]; name?: string; mode?: string; stream?: boolean };
  try { body = await req.json(); } catch { return json(req, { error: "bad json" }, 400); }
  const msgs = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length) return json(req, { error: "no messages" }, 400);

  const voice = body.mode === "voice";
  const lib = await library(req, user.sub, voice ? 8000 : 24000);
  if (lib === null) return json(req, { error: "unauthorized" }, 401);

  const name = (body.name ?? "").toString().slice(0, 24) || "Dobby";
  const base = `You are ${name}, a friendly black-cat study companion inside Ahlam's private learning library. Ahlam is an IT graduate in Saudi Arabia targeting SOC, Blue Team and DFIR roles, and learning the Forward Deployed Engineer (FDE) track.
Reply in the language she writes in: Saudi Arabic (simple, warm) or English. Keep technical terms in English.
You can: explain a resource from her library, quiz her (one question at a time, wait for her answer, then explain), suggest what to start next based on status and due dates, or make a short study plan.
Only recommend resources that are in the library below unless she asks for new ones; when you suggest something not in the library, say clearly it's from your general knowledge and she should verify the link. Never invent links.
Today is ${new Date().toISOString().slice(0, 10)}.`;
  const style = voice
    ? `\nThis is a SPOKEN conversation. Answer in 2 to 3 short, natural sentences, like talking to a friend. No tables, no lists, no markdown, no symbols, no emoji, no URLs. Write numbers and dates the way you would say them.`
    : `\nBe short and practical (under 120 words unless she asks for more). Markdown is allowed (bold, lists, tables) when it helps.`;
  const system = `${base}${style}\nHer library (section | title | subtopic | status | summary):\n${lib}`;

  const stream = !!body.stream;
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: voice ? VOICE_MODEL : CHAT_MODEL, temperature: voice ? 0.5 : 0.6,
      max_completion_tokens: voice ? 400 : 1500,
      reasoning_effort: "low", include_reasoning: false, stream,
      messages: [{ role: "system", content: system }, ...msgs],
    }),
  });
  if (!r.ok) {
    // Log status + Groq's error message only (never the key or request headers).
    const t = (await r.text()).slice(0, 400);
    console.error("groq error", r.status, voice ? VOICE_MODEL : CHAT_MODEL, t);
    return json(req, { error: "upstream", status: r.status, detail: t.slice(0, 200) }, 502);
  }
  if (stream) {
    return new Response(r.body, { headers: { ...cors(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  const j = await r.json();
  return json(req, { text: j.choices?.[0]?.message?.content ?? "" });
});
