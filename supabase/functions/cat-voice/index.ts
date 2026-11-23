// Edge Function "cat-voice": push-to-talk in ONE round trip.
//   multipart/form-data: audio (webm/ogg/mp4/wav file), meta (JSON: { messages, name, lang })
//   1) Groq Whisper (whisper-large-v3-turbo) transcribes the audio  (the library is loaded in parallel)
//   2) the fast model's reply is STREAMED back as it is generated, no waiting for the whole reply
// Response: text/event-stream, one JSON per line:
//   {"stt":"...","ms":{"stt":N}}  {"t":"delta"}...  {"done":true,"ms":{"stt":N,"first_token":N,"total":N}}   or {"error":"..."}
// GROQ_API_KEY lives ONLY in Supabase secrets.
import { cors, json, userFromJwt } from "../_shared/auth.ts";
import { buildSystem, fitHistory, getLibrary, groqChat } from "../_shared/chat.ts";

const STT_MODEL = Deno.env.get("GROQ_STT_MODEL") ?? "whisper-large-v3-turbo";
// Same model as the text chat (gpt-oss-120b) so spoken answers are as smart; reasoning_effort "low" keeps the first token fast.
const VOICE_MODEL = Deno.env.get("GROQ_VOICE_MODEL") ?? "openai/gpt-oss-120b";
const MAX_AUDIO = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json(req, { error: "assistant not configured" }, 503);
  const user = userFromJwt(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);
  if (req.headers.get("x-warm")) return new Response(null, { status: 204, headers: cors(req) });

  const t0 = Date.now();
  let form: FormData;
  try { form = await req.formData(); } catch { return json(req, { error: "bad form" }, 400); }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size < 200) return json(req, { error: "no audio" }, 400);
  if (audio.size > MAX_AUDIO) return json(req, { error: "audio too large" }, 413);
  let meta: { messages?: { role: string; content: string }[]; name?: string; lang?: string } = {};
  try { meta = JSON.parse(String(form.get("meta") ?? "{}")); } catch { /* ignore */ }
  const lang = meta.lang === "en" ? "en" : "ar";
  const history = (meta.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-18).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  // Whisper and the library lookup run in parallel.
  const sttForm = new FormData();
  sttForm.set("file", audio, audio.name || "speech.webm");
  sttForm.set("model", STT_MODEL);
  sttForm.set("language", lang);
  sttForm.set("temperature", "0");
  sttForm.set("response_format", "verbose_json");
  // Arabic-first prompt: an English name here made Whisper write "Doby, Doby" and Latin text for unclear Arabic.
  sttForm.set("prompt", "دوبي، وش أبدأ فيه اليوم؟ مكتبتي فيها SOC و DFIR و FDE و AWS و Linux و Wazuh و Splunk.");
  const [libRes, sttRes] = await Promise.all([
    getLibrary(req, user.sub, 8000),
    fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: sttForm }),
  ]);
  if (libRes === null) return json(req, { error: "unauthorized" }, 401);
  if (!sttRes.ok) {
    const t = (await sttRes.text()).slice(0, 300);
    console.error("groq stt error", sttRes.status, STT_MODEL, t);
    return json(req, { error: "stt", status: sttRes.status, detail: t.slice(0, 200) }, 502);
  }
  const sj = await sttRes.json();
  const segs = (sj.segments ?? []) as { no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }[];
  const silent = segs.length > 0 && segs.every((s) => (s.no_speech_prob ?? 0) > 0.7);   // Whisper invents text on silence
  const lp = segs.length ? segs.reduce((a, s) => a + (s.avg_logprob ?? 0), 0) / segs.length : 0;
  const raw = silent ? "" : String(sj.text ?? "").trim();
  // She often calls him by name first ("دوبي، ..."): drop it so the model sees only the question.
  const text = raw.replace(/^\s*(?:(?:دوبي|دوبى|دوبیی|dobby|doby|dobi)[\s,،.!?؟:]*)+/i, "").trim();
  const unclear = !!raw && (!text || lp < -1.0 || segs.some((s) => (s.compression_ratio ?? 0) > 2.6));
  const sttMs = Date.now() - t0;

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        send({ stt: unclear ? "" : text, heard: raw, unclear, ms: { stt: sttMs, logprob: Math.round(lp * 100) / 100 } });
        if (!text || unclear) { send({ done: true }); return; }
        const name = (meta.name ?? "").toString().slice(0, 24) || "Dobby";
        const r = await groqChat(key, {
          model: VOICE_MODEL, temperature: 0.6, max_completion_tokens: 700, stream: true,
          reasoning_effort: "low", include_reasoning: false,
        }, (small) => [
          { role: "system", content: buildSystem({ name, voice: true, lib: small ? libRes.slice(0, 3000) : libRes }) },
          ...fitHistory([...history, { role: "user", content: text.slice(0, 2000) }], small ? 2500 : 7000, small ? 1200 : 2500),
        ]);
        if (!r.ok || !r.body) {
          const t = (await r.text()).slice(0, 300);
          console.error("groq chat error", r.status, VOICE_MODEL, t);
          send({ error: "upstream", status: r.status }); return;
        }
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buf = "", first = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const p = line.slice(5).trim(); if (p === "[DONE]") continue;
            try {
              const d = JSON.parse(p).choices?.[0]?.delta?.content;
              if (d) { if (!first) first = Date.now() - t0 - sttMs; send({ t: d }); }
            } catch { /* partial line */ }
          }
        }
        send({ done: true, ms: { stt: sttMs, first_token: first, total: Date.now() - t0 } });
      } catch (e) {
        console.error("cat-voice stream error", String(e));
        try { send({ error: "stream" }); } catch { /* closed */ }
      } finally { try { controller.close(); } catch { /* closed */ } }
    },
  });
  return new Response(body, { headers: { ...cors(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
});
