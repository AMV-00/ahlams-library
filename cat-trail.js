/* Dobby follows the pointer: a small cat that glides after the cursor (or the finger on a phone)
   and paints a fading brush stroke behind it. Pure canvas + one <img>, pointer-events:none, so it
   never blocks a click. The loop sleeps when nothing moves. Toggle: #trailBtn, remembered in
   localStorage "lib-trail2". On by default (Ahlam asked). */
(function () {
  const KEY = "lib-trail2", LIFE = 420, SIZE = 48;
  let on;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (_) { on = true; }   // on by default; 🐾 turns it off

  const cv = document.createElement("canvas"); cv.className = "trail-cv"; cv.setAttribute("aria-hidden", "true");
  const cat = document.createElement("img"); cat.className = "trail-cat"; cat.alt = ""; cat.setAttribute("aria-hidden", "true");
  cat.src = "cat/happy.png"; cat.width = cat.height = SIZE;
  document.body.append(cv, cat);
  const g = cv.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener("resize", size, { passive: true });

  /* the cat's pose follows the big cat (happy / think / sleep / celebrate ...) */
  const big = document.getElementById("catImg");
  if (big) new MutationObserver(() => { cat.src = big.getAttribute("src"); }).observe(big, { attributes: true, attributeFilter: ["src"] });

  let tx = 0, ty = 0, x = 0, y = 0, face = 1, tilt = 0, seen = false, raf = 0, last = 0;
  const pts = [];

  function allowed() {
    const ui = document.getElementById("catUi");
    return on && seen && ui && !ui.hidden && !document.body.classList.contains("chat-full");
  }
  function point(e) {
    if (!on) return;
    const touch = e.pointerType === "touch" || e.pointerType === "pen";
    // stand a little beside the pointer so the cursor itself stays visible; above the finger on touch
    const h = SIZE / 2;
    tx = Math.max(h, Math.min(W - h, e.clientX + (touch ? 0 : 26)));
    ty = Math.max(h, Math.min(H - h, e.clientY + (touch ? -46 : 30)));
    if (!seen) { seen = true; x = tx; y = ty; }
    wakeLoop();
  }
  addEventListener("pointermove", point, { passive: true });
  addEventListener("pointerdown", point, { passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { pts.length = 0; } });

  function wakeLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function frame(now) {
    raf = 0;
    const dt = Math.min(now - last, 50); last = now;
    const show = allowed();
    cat.classList.toggle("on", show); cv.classList.toggle("on", show);
    if (!show) { pts.length = 0; g.clearRect(0, 0, W, H); return; }

    // smooth chase: frame-rate independent easing towards the target
    const k = 1 - Math.pow(1 - 0.34, dt / 16.7);
    const px = x, py = y;
    x += (tx - x) * k; y += (ty - y) * k;
    const vx = (x - px) / Math.max(dt, 1);
    if (Math.abs(vx) > 0.05) face = vx < 0 ? -1 : 1;
    tilt += (Math.max(-8, Math.min(8, vx * 5)) - tilt) * 0.3;
    cat.style.transform = `translate3d(${x - SIZE / 2}px,${y - SIZE / 2}px,0) rotate(${tilt}deg) scaleX(${face})`;

    if (Math.hypot(x - px, y - py) > 0.8) pts.push({ x, y: y + SIZE * 0.22, t: now });
    while (pts.length && now - pts[0].t > LIFE) pts.shift();
    draw(now);

    const moving = Math.hypot(tx - x, ty - y) > 0.3 || pts.length;
    if (moving) raf = requestAnimationFrame(frame);
  }

  function draw(now) {
    g.clearRect(0, 0, W, H);
    if (pts.length < 2) return;
    const cs = getComputedStyle(document.documentElement);
    const c1 = cs.getPropertyValue("--cyan").trim() || "#00e5ff", c2 = cs.getPropertyValue("--accent").trim() || "#0066ff";
    g.lineCap = "round"; g.lineJoin = "round";
    // two passes: a wide soft glow, then the bright brush core; each segment tapers and fades with age
    for (const pass of [0, 1]) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], life = 1 - (now - b.t) / LIFE;
        if (life <= 0) continue;
        const m0x = i > 1 ? (pts[i - 2].x + a.x) / 2 : a.x, m0y = i > 1 ? (pts[i - 2].y + a.y) / 2 : a.y;
        const m1x = (a.x + b.x) / 2, m1y = (a.y + b.y) / 2;
        g.beginPath(); g.moveTo(m0x, m0y); g.quadraticCurveTo(a.x, a.y, m1x, m1y);
        g.strokeStyle = pass ? c1 : c2;
        g.globalAlpha = pass ? life * 0.55 : life * 0.1;
        g.lineWidth = pass ? 1 + life * 2.5 : 3 + life * 6;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /* toggle button in the header */
  const btn = document.getElementById("trailBtn");
  function paint() {
    if (!btn) return;
    const ar = document.documentElement.lang !== "en";
    const label = on ? (ar ? "إيقاف القطو المتحرك" : "Stop the following cat") : (ar ? "خلي القطو يمشي معي" : "Let the cat follow me");
    btn.setAttribute("aria-pressed", String(on)); btn.setAttribute("aria-label", label); btn.title = label;
  }
  if (btn) btn.addEventListener("click", () => {
    on = !on; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) {}
    if (on) { const r = btn.getBoundingClientRect(); tx = x = r.left + r.width / 2; ty = y = r.bottom + 30; seen = true; }
    paint(); wakeLoop();
  });
  paint();
  window.LibTrail = { paint, isOn: () => on };
})();
