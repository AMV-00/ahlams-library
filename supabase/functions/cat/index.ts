// Edge Function "cat": proxies the assistant to Groq (Llama).
// GROQ_API_KEY lives ONLY in Supabase secrets:  supabase secrets set GROQ_API_KEY=...
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://amv-00.github.io,http://localhost:8080").split(",");

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(o) ? o : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "assistant not configured" }, 503);

  // Query the library with the CALLER's JWT so RLS applies.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json(req, { error: "unauthorized" }, 401);

  let body: { messages?: { role: string; content: string }[]; name?: string };
  try { body = await req.json(); } catch { return json(req, { error: "bad json" }, 400); }
  const msgs = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length) return json(req, { error: "no messages" }, 400);

  const { data: items } = await sb.from("items")
    .select("tab,title,sub,status,due,summary_en,summary_ar").limit(500);
  const lib = (items ?? []).map((x) =>
    `- [${x.tab}] ${x.title} | ${x.sub ?? ""} | status=${["not started", "learning", "done"][x.status] ?? "not started"}${x.due ? ` | due ${x.due}` : ""} | ${x.summary_en ?? x.summary_ar ?? ""}`
  ).join("\n").slice(0, 24000);

  const name = (body.name ?? "").toString().slice(0, 24) || "Qatwa";
  const system = `You are ${name}, a friendly black-cat study companion inside Ahlam's private learning library. Ahlam is an IT graduate in Saudi Arabia targeting SOC, Blue Team and DFIR roles, and learning the Forward Deployed Engineer (FDE) track.
Reply in the language she writes in: Saudi Arabic (simple, warm) or English. Keep technical terms in English. Be short and practical (under 120 words unless she asks for more).
You can: explain a resource from her library, quiz her (one question at a time, wait for her answer, then explain), suggest what to start next based on status and due dates, or make a short study plan.
Only recommend resources that are in the library below unless she asks for new ones; when you suggest something not in the library, say clearly it's from your general knowledge and she should verify the link. Never invent links.
Today is ${new Date().toISOString().slice(0, 10)}.
Her library (section | title | subtopic | status | summary):
${lib}`;

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.6, max_completion_tokens: 1500,
      reasoning_effort: "low", include_reasoning: false,
      messages: [{ role: "system", content: system }, ...msgs],
    }),
  });
  if (!r.ok) {
    // Log status + Groq's error message only (never the key or request headers).
    const t = (await r.text()).slice(0, 400);
    console.error("groq error", r.status, MODEL, t);
    return json(req, { error: "upstream", status: r.status, detail: t.slice(0, 200) }, 502);
  }
  const j = await r.json();
  return json(req, { text: j.choices?.[0]?.message?.content ?? "" });
});
