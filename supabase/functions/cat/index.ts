// Edge Function "cat": the TEXT assistant, proxied to Groq. GROQ_API_KEY lives ONLY in Supabase secrets.
//   body: { messages, name?, mode?: "chat" | "voice", stream?: boolean }
// (push-to-talk uses `cat-voice`; `mode: "voice"` is kept for compatibility)
import { cors, json, userFromJwt } from "../_shared/auth.ts";
import { buildSystem, fitHistory, getLibrary, groqChat, readDoc } from "../_shared/chat.ts";

const CHAT_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const VOICE_MODEL = Deno.env.get("GROQ_VOICE_MODEL") ?? "openai/gpt-oss-120b";
// Image attachments: Groq vision model (docs 2026-11-23: qwen/qwen3.8-27b is GA; the Llama 4 vision models are shut down).
const VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") ?? "qwen/qwen3.8-27b";
const MAX_IMAGE = 4 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "assistant not configured" }, 503);
  const user = userFromJwt(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);
  if (req.headers.get("x-warm")) return new Response(null, { status: 204, headers: cors(req) });

  let body: { messages?: { role: string; content: string }[]; name?: string; mode?: string; stream?: boolean; doc?: unknown; extract_image?: string; lang?: string };
  try { body = await req.json(); } catch { return json(req, { error: "bad json" }, 400); }

  // 📎 image: transcribe + describe it once; the page keeps the text as the attached document.
  if (typeof body.extract_image === "string") {
    const img = body.extract_image;
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > MAX_IMAGE) return json(req, { error: "bad image" }, 400);
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL, temperature: 0.1, max_completion_tokens: 2500,
        messages: [{ role: "user", content: [
          { type: "text", text: "Transcribe ALL text in this image exactly, keeping its language (Arabic or English) and structure (headings, lists, tables as Markdown). Then add a short section 'Description:' describing any diagram, chart or picture. Output only that." },
          { type: "image_url", image_url: { url: img } },
        ] }],
      }),
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 400);
      console.error("groq vision error", r.status, VISION_MODEL, t);
      return json(req, { error: "vision", status: r.status, detail: t.slice(0, 200) }, 502);
    }
    const j = await r.json();
    return json(req, { text: String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() });
  }
  const msgs = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!msgs.length) return json(req, { error: "no messages" }, 400);

  const voice = body.mode === "voice";
  const question = msgs[msgs.length - 1].content;
  const doc = readDoc(body.doc, question, 8000);
  const lib = await getLibrary(req, user.sub, voice ? 8000 : doc ? 7000 : 14000);
  if (lib === null) return json(req, { error: "unauthorized" }, 401);
  const name = (body.name ?? "").toString().slice(0, 24) || "Dobby";
  // Normal: library 14k chars (7k with a file) + last ~9k chars of chat (+ file parts <= 8k).
  // Retry (too big / token limit): 3k library, ~3k chat, file parts <= 3.5k, keeping her last message.
  const small_doc = doc ? readDoc(body.doc, question, 3500) : null;
  const build = (small: boolean) => [
    { role: "system", content: buildSystem({ name, voice, lib: small ? lib.slice(0, 3000) : lib, doc: small ? small_doc : doc }) },
    ...fitHistory(msgs, small ? 3000 : doc ? 6000 : 9000, small ? 1500 : 3000),
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
