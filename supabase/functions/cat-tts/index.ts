// Edge Function "cat-tts": Groq Orpheus Arabic (Saudi) text-to-speech. Key only from Supabase secrets.
//   body: { text: string (<= 200 chars), voice?: abdullah|fahad|sultan|lulwa|noura|aisha }  ->  audio/wav
import { cors, json, userFromJwt } from "../_shared/auth.ts";

const MODEL = Deno.env.get("GROQ_TTS_MODEL") ?? "canopylabs/orpheus-arabic-saudi";
const VOICES = ["abdullah", "fahad", "sultan", "lulwa", "noura", "aisha"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "not configured" }, 503);
  if (!userFromJwt(req)) return json(req, { error: "unauthorized" }, 401);
  if (req.headers.get("x-warm")) return new Response(null, { status: 204, headers: cors(req) });   // pre-warm ping: no Groq call

  let b: { text?: string; voice?: string };
  try { b = await req.json(); } catch { return json(req, { error: "bad json" }, 400); }
  const text = (b.text ?? "").toString().trim().slice(0, 200);
  if (!text) return json(req, { error: "no text" }, 400);
  const voice = VOICES.includes(b.voice ?? "") ? b.voice! : "noura";

  const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text, voice, response_format: "wav" }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300);
    console.error("groq tts error", r.status, MODEL, t);
    return json(req, { error: "upstream", status: r.status, detail: t.slice(0, 200) }, 502);
  }
  return new Response(r.body, { headers: { ...cors(req), "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
});
