# Decision: Dobby panel redesign (side panel + full screen)
Date 2026-11-23. Ahlam: the floating 380px chat box was too small to be useful.
- Desktop: a full-height side panel (460px) on the inline-start side; at >= 1180px it pushes the page instead of covering it.
- Expand button -> full screen with an 860px reading column; remembered in localStorage `lib-chat-mode`. Esc: full -> side panel -> closed.
- Phones (<= 760px): always full screen.
- Composer: auto-growing textarea (Enter sends, Shift+Enter new line), mic + send inside it. Voice status pill moved inside the panel footer.
- New-chat button clears history in place (`history.length = 0`, dobby.js keeps the same array reference).
- dobby.js (voice logic) untouched; it only relies on the ids listenBtn / vstatus / vtext / vheard / msgs, all kept.
- Page: wider layout (1160px, auto-fill card grid), sticky search + tabs, card "Ask" button labelled instead of a paw emoji.
Verified: stubbed-Supabase Playwright at 1440, 1280 (light) and 390 widths, no horizontal overflow, no JS errors; npm run contrast + check pass.
