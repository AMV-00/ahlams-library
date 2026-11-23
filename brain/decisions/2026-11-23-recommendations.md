# Decision: recommendations box "لك الحين"
Date 2026-11-23. Ahlam asked for a recommendations system.
- recs.js ranks up to 4 picks (3 inside one section) with a reason each: opportunities (job/event, or c-jobs/c-madinah) closing within 21 days first, then items she started ("كمّليها"), then not-started items weighted by how active she is in that section, small bonus for course/lab and for new additions. Max 2 per section and 2 opportunities in "all" so it doesn't fill with one area. Passed deadlines and done items are skipped.
- Buttons: ابدئي (status -> أتعلم), افتحي, اسألي دوبي, مو الحين (snooze 7 days, saved in config key "recs", no new table, no SQL).
- Dobby gets the same ranking (supabase/functions/_shared/recs.ts, keep in sync with recs.js) at the top of its library context, so "وش أبدأ فيه؟" matches the box. Snoozes are not sent to Dobby.
Check: stubbed Playwright run: ranking, snooze, start, ask, tab filter, collapse, phone width, no page errors. Real data not tried from the sandbox.
