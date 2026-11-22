# Decision: lighter graphite theme + light mode, enforced by a contrast check
Date: 2026-11-22 | Status: active
Context: site was too dark and small text unclear. Before (real-DOM audit, 2026-11-22): 557 text elements under 13px, 5 below 4.5:1 (tab counts 3.35, search placeholder 3.74, chat placeholder 3.37, speaker button 4.5 at 12px).
Decision: bg #181b21, cards #22262e, text #eef1f5 / #b4bcc8 / tertiary #a0a9b6; base 16px, nothing under 13px; blue #0066ff and cyan #00e5ff unchanged in dark. Light mode via data-theme with deeper cyan (#00788f) because #00e5ff is 1.2:1 on white. Choice saved in localStorage "lib-theme".
Result: after, 0 below AA and 0 under 13px in both themes; `npm run contrast` checks every token pair (it caught --rec at 4.47:1, fixed).
Lesson: audit computed styles of the real DOM, not only tokens; placeholders and alpha-composited backgrounds hide failures.
