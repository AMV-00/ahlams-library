# Decision: depth for the dark theme
Date 2026-11-23. Ahlam: "الموقع غامق مافيه تدرج للدرجات".
- Four tonal steps in dark: --bg-deep #111318 (page bottom) -> --bg #181b21 -> --panel/--panel-hi gradient (#22262e..#272c35) -> --raised #2f3540 (icons, recs, Dobby bubbles).
- Page background: soft blue + cyan radial glows at the top over a bg -> bg-deep gradient. Panels/cards: top-lit gradient + 1px inner highlight (--edge) + --elev-1 shadow; cards lift with --elev-2 on hover.
- Primary buttons gradient #0a6cff -> #005ce6 (white text >= 4.56:1; #1f7aff failed at 3.97).
- Sticky search bar is transparent until the page scrolls under it (class .stuck), so no hard dark block at the top.
- Light theme gets the same structure with very soft values.
Verified: contrast script passes; new surfaces hand-checked (ink-3 >= 5.19:1 on --raised). Stubbed Playwright desktop/light/phone, no overflow or errors.
