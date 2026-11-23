# Decision: Dobby follows the pointer (2026-11-23)
Ahlam asked for the cat to move with her across the site "like a brush" with a trail behind it.
- cat-trail.js: a separate 56px cat (`.trail-cat`) eases after the cursor (sits 26px/30px beside it so the cursor stays visible) and paints a fading cyan/blue brush stroke on a full-screen canvas. The big launcher cat stays put so the chat is still one click away.
- pointer-events:none on both, so nothing is ever blocked. The rAF loop stops when the cat has arrived and the trail has faded (0 frames when idle, measured).
- Phone: follows taps/drags, standing above the finger.
- Pose mirrors #catImg (sleep/think/celebrate) via MutationObserver.
- Toggle: 🐾 header button, localStorage "lib-trail". Default off under prefers-reduced-motion. Hidden while the chat is full screen.
- Result: Playwright check (stubbed, no Supabase) desktop + iPhone 13: trail drawn, no horizontal scroll, toggle persists.

## Update 2026-11-23 (Ahlam: "heavy", trail too strong, had to press 🐾)
- Faster chase (0.34/frame), 48px cat, smaller tilt; trail 420ms, thin and faint.
- ON by default for everyone (reduced-motion no longer turns it off; she asked). New key lib-trail2 so an old "off" is ignored; 🐾 turns it off.
