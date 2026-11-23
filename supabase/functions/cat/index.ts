// Edge Function "cat": the TEXT assistant, proxied to Groq. GROQ_API_KEY lives ONLY in Supabase secrets.
//   body: { messages, name?, mode?: "chat" | "voice", stream?: boolean }
// (push-to-talk uses `cat-voice`; `mode: "voice"` is kept for compatibility)
import { cors, json, userFromJwt } from "../_shared/auth.ts";
import { buildSystem, fitHistory, getLibrary, groqChat } from "../_shared/chat.ts";

const CHAT_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const VOICE_MODEL = Deno.env.get("GROQ_VOICE_MODEL") ?? "openai/gpt-oss-120b";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "assistant not configured" }, 503);
  const user = userFromJwt(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);
  if (req.headers.get("x-warm")) return new Response(null, { status: 204, headers: cors(req) });

  let body: { messages?: { role: string; content: string }[]; name?: string; mode?: string; stream?: boolean };
  try { body = await req.json(); } catch { return json(req, { error: "bad json" }, 400); }
  const msgs = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!msgs.length) return json(req, { error: "no messages" }, 400);

  const voice = body.mode === "voice";
  const lib = await getLibrary(req, user.sub, voice ? 8000 : 14000);
  if (lib === null) return json(req, { error: "unauthorized" }, 401);
  const name = (body.name ?? "").toString().slice(0, 24) || "Dobby";
  // Normal: library 14k chars + last ~9k chars of chat. Retry (too big / token limit): 4k + ~3k, keeping her last message.
  const build = (small: boolean) => [
    { role: "system", content: buildSystem({ name, voice, lib: small ? lib.slice(0, 4000) : lib }) },
    ...fitHistory(msgs, small ? 3000 : 9000, small ? 1500 : 3000),
  ];

  const stream = !!body.stream;
  const r = await groqChat(key, {
    model: voice ? VOICE_MODEL : CHAT_MODEL, temperature: voice ? 0.5 : 0.6,
    max_completion_tokens: voice ? 400 : 1500,
    reasoning_effort: "low", include_reasoning: false, stream,
  }, build);
  if (!r.ok) {
    // Log status + Groq's error message only (never the key or request headers).
    const t = (await r.text()).slice(0, 400);
    console.error("groq error", r.status, voice ? VOICE_MODEL : CHAT_MODEL, t);
    return json(req, { error: "upstream", status: r.status, detail: t.slice(0, 200) }, 502);
  }
  if (stream) {
    return new Response(r.body, { headers: { ...cors(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  }
  const j = await r.json();
  return json(req, { text: j.choices?.[0]?.message?.content ?? "" });
});
