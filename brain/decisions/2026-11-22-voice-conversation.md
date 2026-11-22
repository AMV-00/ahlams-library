# Decision: Dobby voice conversation (wake word + streaming + Groq Orpheus TTS)
Date: 2026-11-22 | Status: superseded by [[2026-11-22-push-to-talk]]
Context: Ahlam asked for hands-free conversation. Her suggestion llama-3.1-8b-instant is itself deprecated (shut down 2026-08-16, Groq deprecations page) -> chose openai/gpt-oss-20b (Groq's recommended replacement) via GROQ_VOICE_MODEL.
Decision: browser SpeechRecognition ar-SA for wake word "دوبي" + 1.5 s silence; /cat streams SSE (mode=voice); /cat-tts proxies canopylabs/orpheus-arabic-saudi (<=200 chars, wav only, voices abdullah|fahad|sultan|lulwa|noura|aisha, $40/1M chars per Groq docs 2026-11-22); sentence-by-sentence playback; fallback to browser voice for 5 min after a TTS failure. English sentences use the browser voice.
Risks: echo (speakers feeding the mic) -> heuristic filter, headphones recommended; SpeechRecognition = Chrome/Edge only and sends audio to the browser vendor's service.
Revisit if: Groq changes models/pricing, or recognition quality for "دوبي" is poor (tune DEFAULT_WAKE in dobby.js).
