/* an izakaya in tokyo — a quiet generative scene.
   everything is painted by hand on a 760x560 canvas: soft watercolor
   light, lanterns on the wind, and people who drift in, sit at the
   counter for a while, and drift on.

   the scene lives on tokyo time. the shop opens at 5pm and pulls the
   shutter down at 5am; the sky moves through dawn, day, dusk and night.
   ?hour=21.5 pins the clock, ?speed=10 makes ten minutes pass per second. */

(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const captionEl = document.getElementById("caption");

  const W = 760;
  const H = 560;
  const PAGE_BG = "#17110d";
  const JP_FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

  // glow center of the shop interior — rim light on people points at this
  const GLOW = { x: 380, y: 250 };

  const params = new URLSearchParams(location.search);
  const hourOverride = params.has("hour") ? parseFloat(params.get("hour")) : null;
  const speed = params.has("speed") ? parseFloat(params.get("speed")) : 0; // sim minutes per real second

  let dpr = 1;

  // ---------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mixRgb = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgb = (c) => `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;

  // slow layered sines: smooth wind, -1..1, with slower gusts underneath
  function wind(t) {
    const gust = 0.55 + 0.45 * Math.sin(t * 0.045 + 1.3);
    return gust * (Math.sin(t * 0.35) * 0.55 + Math.sin(t * 0.13 + 2.1) * 0.3 + Math.sin(t * 0.62 + 4.0) * 0.15);
  }

  // gentle lamp flicker, 0..1
  function flicker(t) {
    return 0.5 + 0.4 * Math.sin(t * 1.3 + Math.sin(t * 2.7)) + 0.1 * Math.sin(t * 9.7);
  }

  function capsule(g, x, y, w, h) {
    // vertical capsule, (x,y) = top center
    const r = w / 2;
    g.beginPath();
    g.arc(x, y + r, r, Math.PI, 0);
    g.lineTo(x + r, y + h - r);
    g.arc(x, y + h - r, r, 0, Math.PI);
    g.closePath();
    g.fill();
  }

  function verticalText(g, chars, x, y, size, gap, color, alpha = 1) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.font = `${size}px ${JP_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = 0; i < chars.length; i++) g.fillText(chars[i], x, y + i * gap);
    g.restore();
  }

  // ---------------------------------------------------------------
  // tokyo time and the color of the hour
  // ---------------------------------------------------------------

  function tokyoHourNow() {
    const d = new Date();
    return (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + 9) % 24;
  }

  // how open the shop is: 1 from 5pm to 5am, easing at both ends
  function openness(h) {
    if (h >= 16.8) return clamp01((h - 16.8) / 0.3);
    if (h < 5.2) return 1 - clamp01((h - 4.9) / 0.3);
    return 0;
  }

  // palette keyframes across the day: sky, air wash, light and color of everything
  const DAYKEYS = [
    { h: 0.0,  sky0: [26, 17, 22],    sky1: [15, 11, 12],    air: [22, 15, 28, 0.14],   bright: 1.0,  sat: 1.0 },
    { h: 4.6,  sky0: [26, 17, 22],    sky1: [15, 11, 12],    air: [22, 15, 28, 0.14],   bright: 1.0,  sat: 1.0 },
    { h: 6.0,  sky0: [74, 64, 88],    sky1: [122, 90, 82],   air: [168, 138, 150, 0.1], bright: 1.1,  sat: 0.85 },
    { h: 8.0,  sky0: [125, 130, 144], sky1: [168, 154, 134], air: [205, 205, 208, 0.12], bright: 1.28, sat: 0.66 },
    { h: 12.0, sky0: [154, 162, 171], sky1: [192, 180, 160], air: [222, 222, 222, 0.13], bright: 1.4,  sat: 0.58 },
    { h: 15.5, sky0: [143, 138, 136], sky1: [184, 164, 136], air: [214, 200, 180, 0.12], bright: 1.32, sat: 0.66 },
    { h: 17.3, sky0: [106, 78, 88],   sky1: [162, 102, 78],  air: [228, 150, 92, 0.1],  bright: 1.14, sat: 0.92 },
    { h: 18.7, sky0: [58, 42, 62],    sky1: [78, 50, 48],    air: [96, 64, 88, 0.1],    bright: 1.04, sat: 0.98 },
    { h: 20.0, sky0: [32, 22, 34],    sky1: [22, 16, 17],    air: [30, 20, 36, 0.12],   bright: 1.0,  sat: 1.0 },
    { h: 24.0, sky0: [26, 17, 22],    sky1: [15, 11, 12],    air: [22, 15, 28, 0.14],   bright: 1.0,  sat: 1.0 },
  ];

  function palette(h) {
    let a = DAYKEYS[0];
    let b = DAYKEYS[DAYKEYS.length - 1];
    for (let i = 0; i < DAYKEYS.length - 1; i++) {
      if (h >= DAYKEYS[i].h && h <= DAYKEYS[i + 1].h) {
        a = DAYKEYS[i];
        b = DAYKEYS[i + 1];
        break;
      }
    }
    const k = b.h === a.h ? 0 : clamp01((h - a.h) / (b.h - a.h));
    const air = [lerp(a.air[0], b.air[0], k), lerp(a.air[1], b.air[1], k), lerp(a.air[2], b.air[2], k), lerp(a.air[3], b.air[3], k)];
    return {
      sky0: mixRgb(a.sky0, b.sky0, k),
      sky1: mixRgb(a.sky1, b.sky1, k),
      air,
      bright: lerp(a.bright, b.bright, k),
      sat: lerp(a.sat, b.sat, k),
    };
  }

  // ---------------------------------------------------------------
  // static layers (painted once): the facade, and the paper on top
  // ---------------------------------------------------------------

  const facadeLayer = document.createElement("canvas");
  const fgLayer = document.createElement("canvas");
  const off = document.createElement("canvas"); // per-frame compose target

  // lit windows in the distant buildings, drawn dynamically at night
  const cityWindows = (() => {
    const rng = mulberry32(11);
    const list = [];
    for (let i = 0; i < 9; i++) {
      const side = rng() > 0.5;
      list.push({ x: side ? 590 + rng() * 160 : rng() * 130, y: 14 + rng() * 70, a: 0.1 + rng() * 0.14 });
    }
    return list;
  })();

  function paintFacade() {
    const g = facadeLayer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const rng = mulberry32(7);

    // distant buildings, barely there (sky shows through around them)
    g.fillStyle = "#181210";
    for (const [bx, bw, bh] of [[-30, 150, 96], [96, 90, 60], [560, 110, 72], [648, 140, 108]]) {
      g.fillRect(bx, 0, bw, bh);
    }

    // utility pole + cables
    g.strokeStyle = "rgba(120, 105, 95, 0.3)";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(46, 0);
    g.lineTo(50, 300);
    g.stroke();
    g.lineWidth = 1.2;
    for (const [y1, cy, y2] of [[36, 76, 10], [52, 96, 30]]) {
      g.beginPath();
      g.moveTo(48, y1);
      g.quadraticCurveTo(400, cy, 760, y2);
      g.stroke();
    }

    // roof + eave
    g.fillStyle = "#2a1c12";
    g.fillRect(108, 58, 544, 22);
    g.strokeStyle = "rgba(0,0,0,0.3)";
    g.lineWidth = 1;
    for (let x = 116; x < 648; x += 14) {
      g.beginPath();
      g.moveTo(x, 60);
      g.lineTo(x, 78);
      g.stroke();
    }
    g.fillStyle = "#201410";
    g.fillRect(108, 78, 544, 26);

    // facade wall: sides of the opening plus the band the signboard hangs on
    g.fillStyle = "#1e1410";
    g.fillRect(156, 104, 448, 44);
    g.fillRect(156, 104, 82, 343);
    g.fillRect(522, 104, 82, 343);
    for (const [wx, wy] of [[168, 170], [178, 260], [538, 180], [548, 290]]) {
      g.fillStyle = `rgba(220, 200, 160, ${0.05 + rng() * 0.05})`;
      g.fillRect(wx + rng() * 10, wy + rng() * 20, 26, 38);
    }

    // signboard (unlit here; its glow is painted each frame while the shop is open)
    const sb = g.createLinearGradient(0, 92, 0, 134);
    sb.addColorStop(0, "#c8a068");
    sb.addColorStop(1, "#9c7846");
    g.fillStyle = sb;
    g.fillRect(225, 92, 310, 42);
    g.strokeStyle = "#3a2812";
    g.lineWidth = 2;
    g.strokeRect(225, 92, 310, 42);
    g.fillStyle = "#2a1808";
    g.font = `27px ${JP_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("居酒屋　とまり木", 380, 114);

    // posts
    for (const px of [126, 604]) {
      g.fillStyle = "#261812";
      g.fillRect(px, 104, 30, 343);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const gx = px + 5 + rng() * 20;
        g.beginPath();
        g.moveTo(gx, 110 + rng() * 40);
        g.lineTo(gx + rng() * 3 - 1.5, 430);
        g.stroke();
      }
    }

    // standing menu sign on the left (also unlit here)
    const ss = g.createLinearGradient(0, 238, 0, 432);
    ss.addColorStop(0, "#dcc999");
    ss.addColorStop(1, "#bda87a");
    g.fillStyle = ss;
    g.fillRect(84, 238, 38, 194);
    g.strokeStyle = "#2e2012";
    g.lineWidth = 2.5;
    g.strokeRect(84, 238, 38, 194);
    verticalText(g, "お酒とさかな", 103, 266, 17, 27, "#4a3417", 0.85);

    // --- interior, seen through the opening ---
    g.save();
    g.beginPath();
    g.rect(238, 146, 284, 284);
    g.clip();

    const back = g.createLinearGradient(0, 146, 0, 300);
    back.addColorStop(0, "#4e3720");
    back.addColorStop(1, "#382818");
    g.fillStyle = back;
    g.fillRect(238, 146, 284, 154);

    // hanging menu strips
    for (let i = 0; i < 8; i++) {
      const mx = 252 + i * 33;
      g.fillStyle = "rgba(222, 203, 158, 0.8)";
      g.fillRect(mx, 150, 20, 62);
      g.fillStyle = "rgba(50, 34, 18, 0.65)";
      for (let d = 0; d < 4; d++) g.fillRect(mx + 7, 158 + d * 13, 6, 7);
    }

    // shelf with dishes
    g.strokeStyle = "rgba(30, 18, 10, 0.55)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(244, 248);
    g.lineTo(400, 248);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(212, 192, 150, ${0.3 + rng() * 0.2})`;
      g.fillRect(252 + i * 26 + rng() * 6, 236 - rng() * 8, 18, 10);
    }

    // bottles along the back of the counter, dark against the light
    g.fillStyle = "rgba(30, 20, 12, 0.8)";
    for (const bx of [255, 268, 282, 470, 484, 498, 510]) {
      const bh = 16 + rng() * 9;
      g.fillRect(bx, 290 - bh, 8, bh);
      g.fillRect(bx + 2.5, 290 - bh - 5, 3, 6);
    }

    // counter: top surface, front face, shadow beneath
    g.fillStyle = "#75502a";
    g.fillRect(240, 290, 280, 12);
    g.fillStyle = "rgba(255, 220, 165, 0.6)";
    g.fillRect(240, 289, 280, 2.5);
    g.fillStyle = "#2e1d12";
    g.fillRect(240, 302, 280, 28);
    const cs = g.createLinearGradient(0, 330, 0, 356);
    cs.addColorStop(0, "rgba(0,0,0,0.4)");
    cs.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cs;
    g.fillRect(240, 330, 280, 26);

    // floor inside
    const fl = g.createLinearGradient(0, 330, 0, 430);
    fl.addColorStop(0, "#46301e");
    fl.addColorStop(1, "#241811");
    g.fillStyle = fl;
    g.fillRect(238, 330, 284, 100);
    g.restore();

    // stools, tucked under the counter's shadow (patrons sit over them)
    for (const sx of [288, 356, 424, 492]) {
      g.strokeStyle = "rgba(150, 138, 124, 0.65)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, 357);
      g.lineTo(sx, 396);
      g.stroke();
      g.strokeStyle = "rgba(150, 138, 124, 0.5)";
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(sx, 380, 8, 2.6, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(60, 50, 44, 0.75)";
      g.beginPath();
      g.ellipse(sx, 398, 10, 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#57381f";
      g.beginPath();
      g.ellipse(sx, 355, 14, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255, 185, 100, 0.3)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(sx, 354, 13, 4.4, 0, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    }

    // threshold + street
    g.fillStyle = "#120d0a";
    g.fillRect(0, 430, W, 6);
    const st = g.createLinearGradient(0, 436, 0, H);
    st.addColorStop(0, "#20160f");
    st.addColorStop(1, "#150f0c");
    g.fillStyle = st;
    g.fillRect(0, 436, W, H - 436);
    g.strokeStyle = "rgba(255, 255, 255, 0.025)";
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const sy = 442 + rng() * 110;
      g.beginPath();
      g.moveTo(rng() * 300, sy);
      g.lineTo(300 + rng() * 460, sy + rng() * 4 - 2);
      g.stroke();
    }
  }

  function paintForeground() {
    const g = fgLayer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const rng = mulberry32(23);

    // watercolor edges: the scene dissolves into the page
    const fade = 56;
    for (const [x0, y0, x1, y1] of [
      [0, 0, 0, fade], [0, H, 0, H - fade], [0, 0, fade, 0], [W, 0, W - fade, 0],
    ]) {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, PAGE_BG);
      lg.addColorStop(1, "rgba(23, 17, 13, 0)");
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
    }

    // irregular blooms eating into the border, like unfinished paper
    g.save();
    g.shadowColor = PAGE_BG;
    g.shadowBlur = 40;
    for (let i = 0; i < 70; i++) {
      const edge = Math.floor(rng() * 4);
      let x, y;
      if (edge === 0) { x = rng() * W; y = rng() * 22; }
      else if (edge === 1) { x = rng() * W; y = H - rng() * 22; }
      else if (edge === 2) { x = rng() * 22; y = rng() * H; }
      else { x = W - rng() * 22; y = rng() * H; }
      g.globalAlpha = 0.06 + rng() * 0.13;
      g.fillStyle = PAGE_BG;
      g.beginPath();
      g.arc(x, y, 14 + rng() * 28, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // corner vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.82);
    vg.addColorStop(0, "rgba(10, 7, 5, 0)");
    vg.addColorStop(1, "rgba(10, 7, 5, 0.32)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // paper grain (kept crisp above the soft paint)
    for (let i = 0; i < 3200; i++) {
      const brightDot = rng() > 0.5;
      g.fillStyle = brightDot ? "rgba(255, 240, 220, 0.03)" : "rgba(0, 0, 0, 0.05)";
      g.fillRect(rng() * W, rng() * H, 1.4, 1.4);
    }
  }

  // ---------------------------------------------------------------
  // lanterns
  // ---------------------------------------------------------------

  const bigLanterns = [
    { px: 178, py: 106, cord: 22, rx: 27, ry: 36, phase: 0.9, chars: "酒" },
    { px: 582, py: 106, cord: 22, rx: 27, ry: 36, phase: 3.7, chars: "肴" },
  ];
  const smallLanterns = [
    { px: 306, py: 137, cord: 12, r: 11, phase: 1.8 },
    { px: 380, py: 135, cord: 16, r: 12, phase: 4.4 },
    { px: 454, py: 137, cord: 12, r: 11, phase: 0.4 },
  ];

  function drawBigLantern(g, l, t, wd, fl, lit) {
    const a = wd * 0.11 + Math.sin(t * 0.9 + l.phase) * 0.016;
    g.save();
    g.translate(l.px, l.py);
    g.rotate(a);

    g.strokeStyle = "rgba(20, 14, 10, 0.85)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, l.cord);
    g.stroke();

    const cy = l.cord + l.ry;

    if (lit > 0.02) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const glow = g.createRadialGradient(0, cy, 4, 0, cy, l.rx * 2.6);
      glow.addColorStop(0, `rgba(255, 130, 70, ${(0.28 + fl * 0.1) * lit})`);
      glow.addColorStop(1, "rgba(255, 130, 70, 0)");
      g.fillStyle = glow;
      g.fillRect(-l.rx * 3, cy - l.rx * 3, l.rx * 6, l.rx * 6);
      g.restore();
    }

    const body = g.createRadialGradient(-6, cy - 8, 4, 0, cy, l.ry);
    body.addColorStop(0, `rgba(255, 128, 84, ${0.85 + fl * 0.1 * lit})`);
    body.addColorStop(0.55, "#cf5936");
    body.addColorStop(1, "#93321f");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, cy, l.rx, l.ry, 0, 0, Math.PI * 2);
    g.fill();
    if (lit < 1) {
      g.fillStyle = `rgba(24, 15, 16, ${0.5 * (1 - lit)})`;
      g.beginPath();
      g.ellipse(0, cy, l.rx, l.ry, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.strokeStyle = "rgba(60, 12, 6, 0.3)";
    g.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) {
      const yy = cy - l.ry + (i * 2 * l.ry) / 5;
      const w2 = l.rx * Math.sqrt(Math.max(0, 1 - ((yy - cy) / l.ry) ** 2));
      g.beginPath();
      g.ellipse(0, yy, w2, 3.4, 0, 0, Math.PI, false);
      g.stroke();
    }

    g.fillStyle = "#241a14";
    g.fillRect(-10, l.cord - 4, 20, 8);
    g.fillRect(-9, cy + l.ry - 4, 18, 8);
    g.strokeStyle = "rgba(36, 26, 20, 0.85)";
    g.beginPath();
    g.moveTo(0, cy + l.ry + 4);
    g.lineTo(0, cy + l.ry + 12);
    g.stroke();

    g.fillStyle = `rgba(246, 234, 216, ${0.5 + 0.42 * lit})`;
    g.font = `23px ${JP_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(l.chars, 0, cy + 1);
    g.restore();
  }

  function drawSmallLantern(g, l, t, wd, fl, lit) {
    const a = wd * 0.14 + Math.sin(t * 1.1 + l.phase) * 0.02;
    g.save();
    g.translate(l.px, l.py);
    g.rotate(a);

    g.strokeStyle = "rgba(20, 14, 10, 0.8)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, l.cord);
    g.stroke();

    const cy = l.cord + l.r;
    if (lit > 0.02) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const glow = g.createRadialGradient(0, cy, 2, 0, cy, l.r * 3);
      glow.addColorStop(0, `rgba(255, 172, 95, ${(0.22 + fl * 0.08) * lit})`);
      glow.addColorStop(1, "rgba(255, 172, 95, 0)");
      g.fillStyle = glow;
      g.fillRect(-l.r * 3.2, cy - l.r * 3.2, l.r * 6.4, l.r * 6.4);
      g.restore();
    }

    const body = g.createRadialGradient(-3, cy - 4, 1, 0, cy, l.r * 1.2);
    body.addColorStop(0, "#f5b878");
    body.addColorStop(0.6, "#e08a4a");
    body.addColorStop(1, "#b05a28");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, cy, l.r, l.r * 1.15, 0, 0, Math.PI * 2);
    g.fill();
    if (lit < 1) {
      g.fillStyle = `rgba(24, 15, 16, ${0.5 * (1 - lit)})`;
      g.beginPath();
      g.ellipse(0, cy, l.r, l.r * 1.15, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = "#96301d";
    g.fillRect(-6, cy - l.r * 1.15 - 3, 12, 5);
    g.fillRect(-5.5, cy + l.r * 1.15 - 2, 11, 5);
    g.restore();
  }

  // ---------------------------------------------------------------
  // noren + shutter
  // ---------------------------------------------------------------

  function drawNoren(g, t, wd, alpha) {
    if (alpha < 0.03) return;
    const chars = ["居", "酒", "屋"];
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = "#1a120c";
    g.fillRect(236, 143, 288, 5);
    for (let i = 0; i < 3; i++) {
      const x0 = 240 + i * 95;
      const offx = wd * 8 * (0.75 + 0.25 * Math.sin(i * 2.1)) + Math.sin(t * 0.7 + i * 1.9) * 1.5;
      g.fillStyle = i === 1 ? "#303a5e" : "#2c3452";
      g.beginPath();
      g.moveTo(x0, 148);
      g.lineTo(x0 + 90, 148);
      g.quadraticCurveTo(x0 + 90 + offx * 0.5, 190, x0 + 90 + offx, 224);
      g.quadraticCurveTo(x0 + 45 + offx, 230 + Math.sin(t * 0.9 + i) * 2, x0 + offx, 224);
      g.quadraticCurveTo(x0 + offx * 0.5, 190, x0, 148);
      g.closePath();
      g.fill();

      g.strokeStyle = "rgba(0, 0, 0, 0.2)";
      g.lineWidth = 1.5;
      for (const fx of [0.3, 0.68]) {
        g.beginPath();
        g.moveTo(x0 + 90 * fx, 150);
        g.quadraticCurveTo(x0 + 90 * fx + offx * 0.5, 190, x0 + 90 * fx + offx * 0.9, 222);
        g.stroke();
      }

      g.save();
      g.translate(x0 + 45 + offx * 0.6, 190);
      g.rotate(offx * 0.004);
      g.fillStyle = "rgba(232, 226, 214, 0.88)";
      g.font = `32px ${JP_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(chars[i], 0, 0);
      g.restore();
    }
    g.restore();
  }

  function drawShutter(g, openK) {
    const drop = (1 - openK) * 284;
    if (drop <= 1) return;
    g.save();
    g.beginPath();
    g.rect(238, 146, 284, 284);
    g.clip();
    const sg = g.createLinearGradient(0, 146, 0, 146 + drop);
    sg.addColorStop(0, "#453c33");
    sg.addColorStop(1, "#2e2721");
    g.fillStyle = sg;
    g.fillRect(238, 146, 284, drop);
    g.strokeStyle = "rgba(0, 0, 0, 0.22)";
    g.lineWidth = 1.5;
    for (let y = 146 + 7; y < 146 + drop - 4; y += 9) {
      g.beginPath();
      g.moveTo(238, y);
      g.lineTo(522, y);
      g.stroke();
    }
    g.fillStyle = "#241f1a";
    g.fillRect(238, 146 + drop - 5, 284, 5);
    g.restore();
  }

  // ---------------------------------------------------------------
  // people
  // ---------------------------------------------------------------

  const stools = [
    { x: 288, busy: null },
    { x: 356, busy: null },
    { x: 424, busy: null },
    { x: 492, busy: null },
  ];

  const TINTS = ["#141019", "#1a1420", "#191016", "#120e14"];

  const people = [];
  let nextArrival = 0;
  let nextPasser = 0;

  function makeWalker(kind) {
    const female = Math.random() < 0.45;
    return {
      kind,
      female,
      hairBun: female && Math.random() < 0.4,
      skirt: female && Math.random() < 0.5,
      state: "in",
      x: 0,
      dir: 1,
      speed: rand(34, 52),
      h: female ? rand(76, 92) : rand(84, 102),
      baseY: kind === "passer" ? rand(508, 524) : rand(452, 462),
      phase: rand(0, 6.28),
      swayPhase: rand(0, 6.28),
      bag: Math.random() < 0.35,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      alpha: 1,
      stool: null,
      t0: 0,
      until: 0,
    };
  }

  function spawnPatron(t) {
    const free = stools.filter((s) => !s.busy);
    if (!free.length) return false;
    const s = free[Math.floor(Math.random() * free.length)];
    const p = makeWalker("patron");
    p.dir = Math.random() < 0.5 ? 1 : -1;
    p.x = p.dir === 1 ? -50 : W + 50;
    p.stool = s;
    s.busy = p;
    people.push(p);
    return true;
  }

  function spawnPasser() {
    const p = makeWalker("passer");
    p.dir = Math.random() < 0.5 ? 1 : -1;
    p.x = p.dir === 1 ? -60 : W + 60;
    p.speed = rand(30, 58);
    people.push(p);
  }

  function seatPatronNow(t, female) {
    if (!spawnPatron(t)) return;
    const p = people[people.length - 1];
    if (female !== undefined) p.female = female;
    p.hairBun = p.female && Math.random() < 0.4;
    p.state = "seated";
    p.until = t + rand(14, 45);
  }

  function updatePerson(p, dt, t, openK) {
    switch (p.state) {
      case "in": {
        p.x += p.dir * p.speed * dt;
        if (p.kind === "patron" && openK < 0.5) {
          // arrived at a shut door — keep walking
          if (p.stool) p.stool.busy = null;
          p.stool = null;
          p.kind = "passer";
        }
        if (p.kind === "passer") {
          if (p.x < -80 || p.x > W + 80) p.dead = true;
          break;
        }
        if (Math.abs(p.x - p.stool.x) < 3) {
          p.state = "sitdown";
          p.t0 = t;
        }
        break;
      }
      case "sitdown": {
        if (t - p.t0 > 1.1) {
          p.state = "seated";
          p.until = t + rand(22, 62);
        }
        break;
      }
      case "seated": {
        if (t > p.until || openK < 0.5) {
          p.state = "standup";
          p.t0 = t;
        }
        break;
      }
      case "standup": {
        if (t - p.t0 > 1.1) {
          p.state = "out";
          p.dir = Math.random() < 0.5 ? 1 : -1;
          p.stool.busy = null;
          p.stool = null;
        }
        break;
      }
      case "out": {
        p.x += p.dir * p.speed * dt;
        if (p.x < -80 || p.x > W + 80) p.dead = true;
        break;
      }
    }
  }

  function drawWalker(g, p, t, alpha, rise = 0) {
    if (alpha <= 0.01) return;
    const h = p.h;
    const stride = p.x * 0.105 + p.phase;
    const bob = Math.abs(Math.cos(stride)) * 1.8;
    const yb = p.baseY - bob - rise;

    g.save();
    g.globalAlpha = alpha * 0.95;
    g.fillStyle = p.tint;
    g.strokeStyle = p.tint;
    g.shadowColor = p.tint;
    g.shadowBlur = 5;
    g.lineCap = "round";

    const spread = Math.sin(stride) * h * 0.1;

    if (p.skirt) {
      // a-line skirt, legs below the knee
      g.lineWidth = h * 0.06;
      g.beginPath();
      g.moveTo(p.x + spread * 0.55, yb);
      g.lineTo(p.x + spread * 0.4, yb - h * 0.24);
      g.moveTo(p.x - spread * 0.55, yb);
      g.lineTo(p.x - spread * 0.4, yb - h * 0.24);
      g.stroke();
      g.beginPath();
      g.moveTo(p.x - h * 0.1, yb - h * 0.45);
      g.lineTo(p.x + h * 0.1, yb - h * 0.45);
      g.lineTo(p.x + h * 0.17, yb - h * 0.2);
      g.lineTo(p.x - h * 0.17, yb - h * 0.2);
      g.closePath();
      g.fill();
    } else {
      g.lineWidth = h * 0.075;
      g.beginPath();
      g.moveTo(p.x, yb - h * 0.42);
      g.lineTo(p.x + spread, yb);
      g.moveTo(p.x, yb - h * 0.42);
      g.lineTo(p.x - spread, yb);
      g.stroke();
    }

    // torso
    capsule(g, p.x, yb - h * 0.82, h * (p.female ? 0.24 : 0.27), h * 0.44);

    // arm
    g.lineWidth = h * 0.055;
    g.beginPath();
    g.moveTo(p.x, yb - h * 0.72);
    g.lineTo(p.x - spread * 0.6, yb - h * 0.44);
    g.stroke();

    // head (+ hair)
    const hy = yb - h + h * 0.075;
    g.beginPath();
    g.arc(p.x + p.dir * 1.5, hy, h * 0.075, 0, Math.PI * 2);
    g.fill();
    if (p.female) {
      if (p.hairBun) {
        g.beginPath();
        g.arc(p.x - p.dir * h * 0.045, hy - h * 0.075, h * 0.042, 0, Math.PI * 2);
        g.fill();
      } else {
        // hair falling to the shoulders
        g.beginPath();
        g.moveTo(p.x + p.dir * 1.5 - h * 0.07, hy - h * 0.03);
        g.quadraticCurveTo(p.x - p.dir * h * 0.11, yb - h * 0.86, p.x - p.dir * h * 0.09, yb - h * 0.68);
        g.lineTo(p.x + p.dir * 0.02, yb - h * 0.7);
        g.closePath();
        g.fill();
      }
    }

    if (p.bag) {
      g.fillRect(p.x - p.dir * h * 0.16, yb - h * 0.48, h * 0.11, h * 0.13);
    }

    // warm rim as they pass through the shop's light
    const warm = Math.max(0, 1 - Math.abs(p.x - GLOW.x) / 250);
    if (warm > 0.05) {
      g.shadowBlur = 0;
      const ang = Math.atan2(-1, GLOW.x > p.x ? 1 : -1);
      g.strokeStyle = `rgba(255, 190, 120, ${0.42 * warm * alpha})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x + p.dir * 1.5, hy, h * 0.075, ang - 0.9, ang + 0.9);
      g.stroke();
      g.strokeStyle = `rgba(255, 190, 120, ${0.24 * warm * alpha})`;
      g.beginPath();
      g.moveTo(p.x + (GLOW.x > p.x ? 1 : -1) * h * 0.13, yb - h * 0.78);
      g.lineTo(p.x + (GLOW.x > p.x ? 1 : -1) * h * 0.13, yb - h * 0.5);
      g.stroke();
    }
    g.restore();
  }

  function drawSitter(g, p, t, alpha) {
    if (alpha <= 0.01) return;
    const x = p.stool.x + Math.sin(t * 0.5 + p.swayPhase) * 1.2;
    const lean = Math.sin(t * 0.13 + p.phase) * 2;
    const hx = x + lean;
    const shw = p.female ? 11 : 13; // shoulder half-width

    g.save();
    g.globalAlpha = alpha * 0.95;
    g.fillStyle = p.tint;
    g.shadowColor = p.tint;
    g.shadowBlur = 3;

    // lower legs dangle, feet hooked on the footrest — never touching the floor
    g.strokeStyle = p.tint;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - 9, 354);
    g.quadraticCurveTo(x - 11, 368, x - 5, 382);
    g.moveTo(x + 9, 354);
    g.quadraticCurveTo(x + 11, 368, x + 5, 382);
    g.stroke();

    // hunched back over the counter, seen from behind — wide and low
    g.beginPath();
    g.moveTo(x - 16, 358);
    g.bezierCurveTo(x - 19, 336, x - 16 + lean, 322, hx - shw, 315);
    g.quadraticCurveTo(hx, 307, hx + shw, 315);
    g.bezierCurveTo(x + 16 + lean, 322, x + 19, 336, x + 16, 358);
    g.closePath();
    g.fill();

    // elbows out, arms resting on the counter
    g.lineWidth = 5.5;
    g.beginPath();
    g.moveTo(hx - shw + 1, 319);
    g.quadraticCurveTo(x - 19, 328, x - 17, 338);
    g.moveTo(hx + shw - 1, 319);
    g.quadraticCurveTo(x + 19, 328, x + 17, 338);
    g.stroke();

    // head above the counter line
    g.beginPath();
    g.arc(hx, 301, 9.5, 0, Math.PI * 2);
    g.fill();
    if (p.female) {
      if (p.hairBun) {
        g.beginPath();
        g.arc(hx, 292, 4.5, 0, Math.PI * 2);
        g.fill();
      } else {
        // hair spilling down to the shoulders
        g.beginPath();
        g.moveTo(hx - 9, 296);
        g.quadraticCurveTo(hx - 13, 310, hx - 11, 320);
        g.lineTo(hx + 11, 320);
        g.quadraticCurveTo(hx + 13, 310, hx + 9, 296);
        g.closePath();
        g.fill();
      }
    }
    g.shadowBlur = 0;

    // warm rim light on the side facing the counter glow
    const ang = Math.atan2(GLOW.y - 301, GLOW.x - hx);
    g.strokeStyle = `rgba(255, 195, 125, ${0.42 * alpha})`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(hx, 301, 9.5, ang - 1.0, ang + 1.0);
    g.stroke();
    g.strokeStyle = `rgba(255, 195, 125, ${0.22 * alpha})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hx, 320, 15, ang - 0.7, ang + 0.5);
    g.stroke();
    g.restore();
  }

  function drawPerson(g, p, t) {
    switch (p.state) {
      case "in":
      case "out":
        drawWalker(g, p, t, p.kind === "passer" ? 0.85 : 1);
        break;
      case "sitdown": {
        const k = Math.min(1, (t - p.t0) / 1.1);
        drawWalker(g, p, t, 1 - k, k * 55);
        drawSitter(g, p, t, k);
        break;
      }
      case "seated":
        drawSitter(g, p, t, 1);
        break;
      case "standup": {
        const k = Math.min(1, (t - p.t0) / 1.1);
        drawSitter(g, p, t, 1 - k);
        drawWalker(g, p, t, k, (1 - k) * 55);
        break;
      }
    }
  }

  // ---------------------------------------------------------------
  // chef + steam
  // ---------------------------------------------------------------

  function drawChef(g, t, alpha) {
    if (alpha < 0.03) return;
    const cx = 358 + 30 * Math.sin(t * 0.055 + 1) + 16 * Math.sin(t * 0.023);
    const bob = Math.sin(t * 1.1) * 1.3;

    g.save();
    g.globalAlpha = alpha;
    // body in pale working cloth, shoulders sloping, lit from within
    g.fillStyle = "rgba(212, 198, 172, 0.82)";
    g.beginPath();
    g.moveTo(cx - 21, 292 + bob);
    g.bezierCurveTo(cx - 21, 270 + bob, cx - 18, 258 + bob, cx - 10, 253 + bob);
    g.quadraticCurveTo(cx, 248 + bob, cx + 10, 253 + bob);
    g.bezierCurveTo(cx + 18, 258 + bob, cx + 21, 270 + bob, cx + 21, 292 + bob);
    g.closePath();
    g.fill();
    // apron tie
    g.strokeStyle = "rgba(120, 96, 66, 0.45)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 15, 274 + bob);
    g.lineTo(cx + 15, 274 + bob);
    g.stroke();
    // an arm at work, small stirring motion
    g.strokeStyle = "rgba(212, 198, 172, 0.72)";
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx + 13, 262 + bob);
    g.lineTo(cx + 23 + Math.sin(t * 2.3) * 3, 282 + bob + Math.cos(t * 2.3) * 2);
    g.stroke();
    // head
    g.fillStyle = "#2a2018";
    g.beginPath();
    g.arc(cx, 240 + bob, 10, 0, Math.PI * 2);
    g.fill();
    // small white cap
    g.fillStyle = "rgba(228, 218, 196, 0.88)";
    g.beginPath();
    g.arc(cx, 236 + bob, 9, Math.PI, 0);
    g.fill();
    g.restore();
  }

  const steam = [];
  let nextSteam = 0;

  function updateSteam(dt, t, wd, openK) {
    if (openK > 0.5 && t > nextSteam && steam.length < 26) {
      steam.push({
        x: 390 + rand(-40, 40),
        y: 288,
        age: 0,
        life: rand(3, 5),
        drift: rand(0, 6.28),
        r0: rand(4, 7),
      });
      nextSteam = t + rand(0.25, 0.6);
    }
    for (const s of steam) {
      s.age += dt;
      s.y -= 13 * dt;
      s.x += Math.sin(s.age * 2 + s.drift) * 0.35 + wd * 0.5;
    }
    for (let i = steam.length - 1; i >= 0; i--) {
      if (steam[i].age > steam[i].life) steam.splice(i, 1);
    }
  }

  function drawSteam(g) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const s of steam) {
      const k = s.age / s.life;
      const a = 0.09 * Math.sin(Math.PI * Math.min(1, k)) ** 1.5;
      const r = s.r0 + k * 12;
      const grad = g.createRadialGradient(s.x, s.y, 1, s.x, s.y, r);
      grad.addColorStop(0, `rgba(255, 225, 190, ${a})`);
      grad.addColorStop(1, "rgba(255, 225, 190, 0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------
  // light
  // ---------------------------------------------------------------

  function drawGlows(g, t, fl, openK, nightK) {
    if (openK < 0.02) return;
    g.save();
    // the light lives inside the shop; it should not wash the signboard
    g.beginPath();
    g.rect(232, 140, 296, 292);
    g.clip();
    g.globalCompositeOperation = "lighter";

    const heart = g.createRadialGradient(GLOW.x, GLOW.y, 30, GLOW.x, GLOW.y, 220);
    heart.addColorStop(0, `rgba(255, 178, 92, ${(0.3 + fl * 0.05) * openK})`);
    heart.addColorStop(1, "rgba(255, 178, 92, 0)");
    g.fillStyle = heart;
    g.fillRect(150, 60, 460, 400);

    for (const bx of [300, 380, 460]) {
      const bulb = g.createRadialGradient(bx, 168, 1, bx, 168, 26);
      bulb.addColorStop(0, `rgba(255, 214, 150, ${(0.35 + fl * 0.12) * openK})`);
      bulb.addColorStop(1, "rgba(255, 214, 150, 0)");
      g.fillStyle = bulb;
      g.fillRect(bx - 28, 140, 56, 56);
    }
    g.restore();

    // warm haze rising off the whole block at night
    g.save();
    g.globalCompositeOperation = "lighter";
    const haze = g.createRadialGradient(380, 300, 40, 380, 300, 420);
    haze.addColorStop(0, `rgba(255, 170, 90, ${0.07 * openK * (0.4 + 0.6 * nightK)})`);
    haze.addColorStop(1, "rgba(255, 170, 90, 0)");
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);

    // sign glows
    g.fillStyle = `rgba(255, 214, 150, ${0.16 * openK})`;
    g.fillRect(225, 92, 310, 42);
    g.fillStyle = `rgba(255, 226, 170, ${0.14 * openK})`;
    g.fillRect(84, 238, 38, 194);
    g.restore();

    if (openK > 0.2) {
      g.save();
      g.shadowColor = `rgba(255, 205, 135, ${0.5 * openK})`;
      g.shadowBlur = 22;
      g.strokeStyle = `rgba(255, 205, 135, ${0.1 * openK})`;
      g.strokeRect(226, 93, 308, 40);
      g.shadowColor = `rgba(244, 218, 150, ${0.42 * openK})`;
      g.strokeRect(85, 239, 36, 192);
      g.restore();
    }
  }

  function drawLightPool(g, t, fl, openK) {
    if (openK < 0.02) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    const pool = g.createRadialGradient(380, 452, 20, 380, 452, 230);
    pool.addColorStop(0, `rgba(255, 170, 90, ${(0.17 + fl * 0.04) * openK})`);
    pool.addColorStop(1, "rgba(255, 170, 90, 0)");
    g.fillStyle = pool;
    g.save();
    g.translate(380, 452);
    g.scale(1, 0.32);
    g.translate(-380, -452);
    g.fillRect(120, 230, 520, 480);
    g.restore();

    g.fillStyle = `rgba(255, 160, 80, ${(0.035 + fl * 0.015) * openK})`;
    for (const sx of [300, 380, 460]) {
      g.fillRect(sx - 5, 440, 10, 58 + Math.sin(t + sx) * 6);
    }
    g.restore();
  }

  // ---------------------------------------------------------------
  // the caption under the painting
  // ---------------------------------------------------------------

  let lastCaption = "";

  function updateCaption(h, openK) {
    if (!captionEl) return;
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h % 1) * 60);
    const ampm = hh >= 12 ? "pm" : "am";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const time = `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
    const text = openK > 0.5
      ? `it is ${time} in tokyo. stay as long as you like.`
      : `it is ${time} in tokyo — the shop opens at 5pm.`;
    if (text !== lastCaption) {
      captionEl.textContent = text;
      lastCaption = text;
    }
  }

  // ---------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------

  const offCtx = off.getContext("2d");
  const canFilter = typeof offCtx.filter === "string";

  let tAnim = 0;
  let lastNow = 0;

  function currentHour() {
    const base = hourOverride !== null ? hourOverride : tokyoHourNow();
    return (base + (tAnim * speed) / 60 + 24) % 24;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
    lastNow = now;
    tAnim += dt;
    const t = tAnim;

    const h = currentHour();
    const P = palette(h);
    const openK = openness(h);
    const nightK = clamp01(1 - (P.bright - 1.0) / 0.4);
    const wd = wind(t);
    const fl = flicker(t);

    const g = offCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H * 0.85);
    sky.addColorStop(0, rgb(P.sky0));
    sky.addColorStop(1, rgb(P.sky1));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // the shopfront, tinted by the hour
    if (canFilter) g.filter = `brightness(${P.bright.toFixed(3)}) saturate(${P.sat.toFixed(3)})`;
    g.drawImage(facadeLayer, 0, 0, W, H);
    if (canFilter) g.filter = "none";

    // lit windows far away
    if (nightK > 0.05) {
      for (const wdw of cityWindows) {
        g.fillStyle = `rgba(214, 160, 88, ${wdw.a * nightK})`;
        g.fillRect(wdw.x, wdw.y, 5, 7);
      }
    }

    // daylight reaching the street
    const dayK = 1 - nightK;
    if (dayK > 0.02) {
      const dg = g.createLinearGradient(0, 430, 0, H);
      dg.addColorStop(0, `rgba(208, 200, 188, ${0.16 * dayK})`);
      dg.addColorStop(1, `rgba(208, 200, 188, ${0.08 * dayK})`);
      g.fillStyle = dg;
      g.fillRect(0, 430, W, H - 430);
    }

    drawGlows(g, t, fl, openK, nightK);
    drawChef(g, t, openK);
    updateSteam(dt, t, wd, openK);
    drawSteam(g);

    // people: schedule arrivals + passers-by
    if (openK > 0.9 && t > nextArrival) {
      const ok = spawnPatron(t);
      nextArrival = t + (ok ? rand(9, 26) : rand(5, 11));
    }
    if (t > nextPasser) {
      spawnPasser();
      nextPasser = t + (openK > 0.5 ? rand(16, 44) : rand(9, 26));
    }
    for (const p of people) updatePerson(p, dt, t, openK);
    for (let i = people.length - 1; i >= 0; i--) {
      if (people[i].dead) people.splice(i, 1);
    }

    // patrons behind, passers-by in front
    for (const p of people) if (p.kind === "patron") drawPerson(g, p, t);

    drawShutter(g, openK);
    drawNoren(g, t, wd, openK);
    for (const l of smallLanterns) drawSmallLantern(g, l, t, wd, fl, openK);
    for (const l of bigLanterns) drawBigLantern(g, l, t, wd, fl, openK);

    drawLightPool(g, t, fl, openK);
    for (const p of people) if (p.kind === "passer") drawPerson(g, p, t);

    // the color of the hour, washed over everything
    g.fillStyle = `rgba(${P.air[0] | 0}, ${P.air[1] | 0}, ${P.air[2] | 0}, ${P.air[3]})`;
    g.fillRect(0, 0, W, H);

    // a slow breath over the whole scene, like the evening exhaling
    g.fillStyle = `rgba(23, 17, 13, ${(0.05 + 0.035 * Math.sin(t * 0.11)) * (0.4 + 0.6 * nightK)})`;
    g.fillRect(0, 0, W, H);

    // --- compose: sharp base + a blurred pass over it = soft watercolor air ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(off, 0, 0, W, H);
    if (canFilter) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.filter = "blur(3.5px)";
      ctx.drawImage(off, 0, 0, W, H);
      ctx.restore();
    }
    ctx.drawImage(fgLayer, 0, 0, W, H);

    updateCaption(h, openK);
  }

  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, facadeLayer, fgLayer, off]) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    paintFacade();
    paintForeground();
  }

  setup();
  window.addEventListener("resize", () => {
    const next = Math.min(window.devicePixelRatio || 1, 2);
    if (next !== dpr) setup();
  });

  // the shop is never empty when you arrive (if it's open)
  if (openness(currentHour()) > 0.5) {
    seatPatronNow(0, false);
    seatPatronNow(0, true);
  }
  nextArrival = rand(4, 9);
  nextPasser = rand(5, 12);

  window.__izakaya = { people, stools, spawnPatron, spawnPasser, get t() { return tAnim; }, get hour() { return currentHour(); } };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    // a still painting: run the scene forward, then hold one frame
    for (let i = 0; i < 180; i++) frame(i * 16.7);
  } else {
    requestAnimationFrame(loop);
  }
})();
