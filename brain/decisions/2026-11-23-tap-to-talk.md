# Decision: tap-to-talk with 1.5 s silence auto-stop (replaces hold-to-talk)
Date: 2026-11-23 | Status: active | supersedes the recording part of [[2026-11-22-push-to-talk]]
Context: Ahlam asked for one tap to start, one tap to stop, and an automatic stop after 1.5 s of silence.
Decision: 🎙 click (or Space when not typing / 🎙 focused) toggles. VAD in dobby.js: AnalyserNode on the mic stream, RMS every 50 ms; threshold = max(0.012, 3 x median room noise from the first 300 ms, ignoring loud frames), speech = 2 frames over it; 1500 ms below it after speech -> send; no speech in 7 s -> discard with "ما سمعت شي". Tap while the mic is starting = cancel; tap while Dobby talks = interrupt + listen. Reply pipeline unchanged (cat-voice SSE, first chunk after 3 words / 9 words, 3 TTS in flight, gapless Web Audio, 2.5 s browser-voice fallback).
Measurement: every turn's stop -> first sound (+ transcript, first token, first TTS byte, and from end of speech) is saved in localStorage "dobby-times" (last 20); console `LibDobby.times()` prints a table + medians; the status line shows "⏱ 1.4s". `npm run test-voice` (ROUNDS=3) measures the deployed functions and reports whether Groq TTS bytes stream (TTFB vs total).
Verified: stubbed headless Chrome with fake mic audio: speech file auto-sent ~1.5 s after speech end; silent file discarded after 7 s; tap-tap and Space toggle. NOT verified: real latency on Groq/Supabase (needs Ahlam to run test-voice or the page).
Note: the 1.5 s silence wait is by design and not counted in the <2 s target (target = stop -> first sound); "fromSpeechEnd" shows the felt total.
Revisit if: real median > 2 s -> next levers in order: play TTS WAV progressively if test-voice shows TTFB << total; do the first chunk's TTS inside cat-voice (saves one browser->Frankfurt round trip); shorter first chunk.

## Update 2026-11-23 (after Ahlam's first real test: transcripts "Doby, Doby", "Dobby, شبن ابدالیون"; replies began "Dobby:" and repeated the same quiz question; 2.6 s)
- Whisper prompt was English-first ("Ahlam's Library, Dobby, …"): with unclear Arabic it echoed the name in Latin. Now an Arabic sentence prompt.
- cat-voice strips a leading "دوبي/Dobby" from the transcript, and flags `unclear` (mean avg_logprob < -1.0, or compression_ratio > 2.6, or only the name): no model call, the page says "ما فهمت عليك" and shows what it heard.
- Voice system prompt: never start with your name; if unclear, ask to repeat instead of repeating the last question. Client also strips a leading "Dobby:" label.
- Client: start "ding" when the mic is really recording (she was likely talking before the recorder started, losing the first word); VAD ignores the first 220 ms; mic stays warm 60 s; opus 64 kbps.

## Update 2026-11-23 (2): conversation mode + smarter voice replies
Ahlam: "أسأل ويقفل على طول… أبي المحادثة نفس مستوى GPT" and Dobby must keep his library role.
- Conversation mode: after Dobby finishes speaking the mic reopens by itself (ding). Ends on: tap 🎙 before speaking, 7 s with no speech, closing the chat (now also stops Dobby), page hidden, or an error. Unclear transcript -> asks to repeat and listens again.
- Voice model default gpt-oss-20b -> gpt-oss-120b (same as text chat), max tokens 300 -> 700, prompt allows 2-5 sentences, follow-up question, general questions, memory of the conversation, while keeping the library/quiz/plan role. Needs Edge Function deploy. Watch first-token latency (reasoning_effort low).
