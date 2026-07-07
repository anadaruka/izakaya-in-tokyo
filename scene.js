/* an izakaya in tokyo — a quiet generative scene.

   a small watercolor on cream paper: you're standing across the street
   from an izakaya somewhere outside tokyo, a little drunk, a little
   lost. lanterns lean into the wind, mist drifts down the block, the
   city hums somewhere behind you in circles of out-of-focus light.
   people drift in, stay a while, and drift on.

   the scene lives on tokyo time. the shop opens at 5pm and pulls the
   shutter down at 5am; the sky moves through dawn, day, dusk and night.
   ?hour=21.5 pins the clock, ?speed=10 makes ten minutes pass per second.

   every frame is painted in 2d canvas, then run through a webgl shader
   that turns it into watercolor: noise-warped edges, pigment
   granulation, washes, and color blending. */

(() => {
  const canvas = document.getElementById("scene");
  const captionEl = document.getElementById("caption");

  // the sheet of paper
  const W = 840;
  const H = 480;
  const PAPER = "#f2ecdf";
  const JP_FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

  // the shop itself is drawn in its own coordinate space (760x560) and
  // placed small in the middle of the sheet, so you stand further back
  const S = 0.55;
  const TX = 211;
  const TY = 146;
  const GROUND = TY + S * 430; // where the shop floor meets the street

  // walkers live in shop-space; these bounds reach the paper's edges
  const WALK_MIN = -400;
  const WALK_MAX = 1160;

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
    return gust * (Math.sin(t * 0.28) * 0.55 + Math.sin(t * 0.11 + 2.1) * 0.3 + Math.sin(t * 0.5 + 4.0) * 0.15);
  }

  // gentle lamp flicker, 0..1
  function flicker(t) {
    return 0.5 + 0.4 * Math.sin(t * 1.1 + Math.sin(t * 2.3)) + 0.1 * Math.sin(t * 8.1);
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

  // palette keyframes across the day — nights lean blue-violet, dreamy
  const DAYKEYS = [
    { h: 0.0,  sky0: [30, 28, 52],    sky1: [19, 16, 27],    air: [44, 42, 78, 0.12],    bright: 1.0,  sat: 1.0 },
    { h: 4.6,  sky0: [30, 28, 52],    sky1: [19, 16, 27],    air: [44, 42, 78, 0.12],    bright: 1.0,  sat: 1.0 },
    { h: 6.0,  sky0: [86, 80, 110],   sky1: [140, 110, 105], air: [170, 150, 170, 0.1],  bright: 1.1,  sat: 0.82 },
    { h: 8.0,  sky0: [130, 136, 150], sky1: [172, 158, 140], air: [208, 208, 212, 0.12], bright: 1.28, sat: 0.64 },
    { h: 12.0, sky0: [158, 166, 176], sky1: [196, 184, 166], air: [224, 224, 224, 0.13], bright: 1.4,  sat: 0.56 },
    { h: 15.5, sky0: [148, 142, 140], sky1: [186, 166, 140], air: [216, 202, 184, 0.12], bright: 1.32, sat: 0.64 },
    { h: 17.3, sky0: [116, 84, 110],  sky1: [172, 110, 92],  air: [232, 150, 110, 0.1],  bright: 1.14, sat: 0.9 },
    { h: 18.7, sky0: [64, 52, 92],    sky1: [86, 60, 76],    air: [104, 80, 120, 0.11],  bright: 1.05, sat: 0.96 },
    { h: 20.0, sky0: [38, 34, 62],    sky1: [26, 20, 32],    air: [48, 44, 84, 0.12],    bright: 1.0,  sat: 1.0 },
    { h: 24.0, sky0: [30, 28, 52],    sky1: [19, 16, 27],    air: [44, 42, 78, 0.12],    bright: 1.0,  sat: 1.0 },
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
  // layers
  // ---------------------------------------------------------------

  const facadeLayer = document.createElement("canvas");
  const fgLayer = document.createElement("canvas");
  const off = document.createElement("canvas"); // per-frame compose target

  function canvasSpace(g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function sceneSpace(g) {
    g.setTransform(dpr * S, 0, 0, dpr * S, dpr * TX, dpr * TY);
  }

  // lit windows in the distant buildings (paper coords), drawn at night
  const cityWindows = (() => {
    const rng = mulberry32(11);
    const list = [];
    for (let i = 0; i < 14; i++) {
      const left = rng() > 0.5;
      list.push({
        x: left ? 8 + rng() * 180 : 660 + rng() * 170,
        y: 250 + rng() * 100,
        a: 0.08 + rng() * 0.14,
      });
    }
    return list;
  })();

  function paintFacade() {
    const g = facadeLayer.getContext("2d");
    canvasSpace(g);
    g.clearRect(0, 0, W, H);
    const rng = mulberry32(7);

    // ---- the block around the shop, in paper coords ----

    // neighboring buildings, dim and far
    g.fillStyle = "#1b1824";
    g.fillRect(-10, 235, 130, 150);
    g.fillRect(88, 285, 108, 100);
    g.fillStyle = "#191622";
    g.fillRect(652, 262, 120, 122);
    g.fillRect(742, 222, 110, 162);
    // a few dark window pits
    g.fillStyle = "rgba(10, 8, 14, 0.5)";
    for (const [bx, by] of [[16, 258], [52, 262], [98, 302], [676, 282], [706, 286], [766, 244], [800, 248], [770, 300]]) {
      g.fillRect(bx + rng() * 4, by + rng() * 4, 12, 16);
    }

    // a neon strip on the right building, unlit here
    g.fillStyle = "#2c2030";
    g.fillRect(796, 262, 13, 78);

    // vending machine by the alley, unlit here
    g.fillStyle = "#1c2430";
    g.fillRect(700, 330, 30, 52);
    g.fillStyle = "#26344a";
    g.fillRect(703, 334, 24, 30);

    // utility pole + cables, that tokyo tangle
    g.strokeStyle = "rgba(140, 130, 130, 0.28)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(94, 42);
    g.lineTo(98, GROUND);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(72, 70);
    g.lineTo(120, 70);
    g.stroke();
    g.lineWidth = 1;
    for (const [y1, cy, y2] of [[74, 118, 58], [86, 132, 78], [64, 92, 34]]) {
      g.beginPath();
      g.moveTo(96, y1);
      g.quadraticCurveTo(430, cy, 840, y2);
      g.stroke();
    }

    // the street, full width of the sheet
    const st = g.createLinearGradient(0, GROUND, 0, H);
    st.addColorStop(0, "#241c1e");
    st.addColorStop(1, "#151013");
    g.fillStyle = st;
    g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = "rgba(255, 255, 255, 0.03)";
    g.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const sy = GROUND + 8 + rng() * (H - GROUND - 16);
      g.beginPath();
      g.moveTo(rng() * 400, sy);
      g.lineTo(400 + rng() * 440, sy + rng() * 4 - 2);
      g.stroke();
    }

    // ---- the shop, small in the middle of the block ----
    sceneSpace(g);

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

    // signboard (unlit here; its glow is painted each frame while open)
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

    // threshold
    g.fillStyle = "#161014";
    g.fillRect(100, 430, 560, 8);

    canvasSpace(g);
  }

  function paintForeground() {
    const g = fgLayer.getContext("2d");
    canvasSpace(g);
    g.clearRect(0, 0, W, H);
    const rng = mulberry32(23);

    // the painting ends before the paper does: a narrow soft fade
    const fade = 34;
    for (const [x0, y0, x1, y1] of [
      [0, 0, 0, fade], [0, H, 0, H - fade], [0, 0, fade, 0], [W, 0, W - fade, 0],
    ]) {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, PAPER);
      lg.addColorStop(1, "rgba(242, 236, 223, 0)");
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
    }

    // a slightly irregular line where the wash stopped
    g.save();
    g.shadowColor = PAPER;
    g.shadowBlur = 22;
    for (let i = 0; i < 60; i++) {
      const edge = Math.floor(rng() * 4);
      let x, y;
      if (edge === 0) { x = rng() * W; y = rng() * 10; }
      else if (edge === 1) { x = rng() * W; y = H - rng() * 10; }
      else if (edge === 2) { x = rng() * 10; y = rng() * H; }
      else { x = W - rng() * 10; y = rng() * H; }
      g.globalAlpha = 0.1 + rng() * 0.18;
      g.fillStyle = PAPER;
      g.beginPath();
      g.arc(x, y, 6 + rng() * 14, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // a little grain (the shader adds the real tooth)
    for (let i = 0; i < 1200; i++) {
      const brightDot = rng() > 0.5;
      g.fillStyle = brightDot ? "rgba(255, 248, 235, 0.02)" : "rgba(40, 30, 24, 0.03)";
      g.fillRect(rng() * W, rng() * H, 1.4, 1.4);
    }
  }

  // ---------------------------------------------------------------
  // lanterns (shop space)
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
  // noren + shutter (shop space)
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
  // people — soft gouache figures, not silhouettes (shop space)
  // ---------------------------------------------------------------

  const stools = [
    { x: 288, busy: null },
    { x: 356, busy: null },
    { x: 424, busy: null },
    { x: 492, busy: null },
  ];

  const COATS = ["#343044", "#3a3450", "#2e2c3e", "#403646", "#33303b"];

  const people = [];
  let nextArrival = 0;
  let nextPasser = 0;

  function makeWalker(kind) {
    const female = Math.random() < 0.45;
    return {
      kind,
      female,
      hairBun: female && Math.random() < 0.4,
      pale: Math.random() < 0.45, // a pale shirt under the coat
      state: "in",
      x: 0,
      dir: 1,
      speed: rand(26, 40),
      h: female ? rand(76, 92) : rand(84, 102),
      baseY: kind === "passer" ? rand(508, 524) : rand(452, 462),
      phase: rand(0, 6.28),
      swayPhase: rand(0, 6.28),
      coat: COATS[Math.floor(Math.random() * COATS.length)],
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
    p.x = p.dir === 1 ? WALK_MIN : WALK_MAX;
    p.stool = s;
    s.busy = p;
    people.push(p);
    return true;
  }

  function spawnPasser() {
    const p = makeWalker("passer");
    p.dir = Math.random() < 0.5 ? 1 : -1;
    p.x = p.dir === 1 ? WALK_MIN : WALK_MAX;
    people.push(p);
  }

  function seatPatronNow(t, female) {
    if (!spawnPatron(t)) return;
    const p = people[people.length - 1];
    if (female !== undefined) p.female = female;
    p.hairBun = p.female && Math.random() < 0.4;
    p.state = "seated";
    p.until = t + rand(20, 60);
  }

  function updatePerson(p, dt, t, openK) {
    switch (p.state) {
      case "in": {
        p.x += p.dir * p.speed * dt;
        if (p.kind === "patron" && openK < 0.5) {
          if (p.stool) p.stool.busy = null;
          p.stool = null;
          p.kind = "passer";
        }
        if (p.kind === "passer") {
          if (p.x < WALK_MIN - 20 || p.x > WALK_MAX + 20) p.dead = true;
          break;
        }
        if (Math.abs(p.x - p.stool.x) < 3) {
          p.state = "sitdown";
          p.t0 = t;
        }
        break;
      }
      case "sitdown": {
        if (t - p.t0 > 1.3) {
          p.state = "seated";
          p.until = t + rand(28, 75);
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
        if (t - p.t0 > 1.3) {
          p.state = "out";
          p.dir = Math.random() < 0.5 ? 1 : -1;
          p.stool.busy = null;
          p.stool = null;
        }
        break;
      }
      case "out": {
        p.x += p.dir * p.speed * dt;
        if (p.x < WALK_MIN - 20 || p.x > WALK_MAX + 20) p.dead = true;
        break;
      }
    }
  }

  function drawWalker(g, p, t, alpha, rise = 0) {
    if (alpha <= 0.01) return;
    const h = p.h;
    const bob = Math.abs(Math.sin(t * 2.2 + p.phase)) * 1.4;
    const yb = p.baseY - bob - rise;
    const w = h * (p.female ? 0.3 : 0.34);
    const lean = p.dir * h * 0.02;

    g.save();
    g.globalAlpha = alpha * 0.88;
    g.shadowColor = p.coat;
    g.shadowBlur = 6;

    // quiet legs: two short strokes, barely moving
    const step = Math.sin(p.x * 0.07 + p.phase) * h * 0.045;
    g.strokeStyle = p.coat;
    g.lineWidth = h * 0.065;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(p.x - w * 0.17 + step * 0.4, yb - h * 0.16);
    g.lineTo(p.x - w * 0.17 + step, yb);
    g.moveTo(p.x + w * 0.17 - step * 0.4, yb - h * 0.16);
    g.lineTo(p.x + w * 0.17 - step, yb);
    g.stroke();

    // one soft coat shape
    g.fillStyle = p.coat;
    g.beginPath();
    g.moveTo(p.x - w * 0.5, yb - h * 0.13);
    g.bezierCurveTo(p.x - w * 0.56, yb - h * 0.5, p.x - w * 0.42 + lean, yb - h * 0.76, p.x - w * 0.26 + lean, yb - h * 0.8);
    g.quadraticCurveTo(p.x + lean, yb - h * 0.87, p.x + w * 0.26 + lean, yb - h * 0.8);
    g.bezierCurveTo(p.x + w * 0.42 + lean, yb - h * 0.76, p.x + w * 0.56, yb - h * 0.5, p.x + w * 0.5, yb - h * 0.13);
    g.closePath();
    g.fill();

    // a pale shirt showing at the chest
    if (p.pale) {
      g.fillStyle = "rgba(212, 202, 184, 0.5)";
      g.beginPath();
      g.moveTo(p.x - w * 0.2 + lean, yb - h * 0.78);
      g.quadraticCurveTo(p.x + lean, yb - h * 0.84, p.x + w * 0.2 + lean, yb - h * 0.78);
      g.quadraticCurveTo(p.x + w * 0.22 + lean, yb - h * 0.6, p.x + lean, yb - h * 0.56);
      g.quadraticCurveTo(p.x - w * 0.22 + lean, yb - h * 0.6, p.x - w * 0.2 + lean, yb - h * 0.78);
      g.closePath();
      g.fill();
    }

    // head + hair, one soft mass
    const hx = p.x + lean;
    const hy = yb - h + h * 0.085;
    g.fillStyle = "#23202c";
    g.beginPath();
    g.arc(hx, hy, h * 0.078, 0, Math.PI * 2);
    g.fill();
    if (p.female) {
      if (p.hairBun) {
        g.beginPath();
        g.arc(hx - p.dir * h * 0.03, hy - h * 0.08, h * 0.04, 0, Math.PI * 2);
        g.fill();
      } else {
        g.beginPath();
        g.ellipse(hx - p.dir * h * 0.02, hy + h * 0.09, h * 0.075, h * 0.11, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // warm rim as they pass through the shop's light
    const warm = Math.max(0, 1 - Math.abs(p.x - GLOW.x) / 260);
    if (warm > 0.05) {
      g.shadowBlur = 0;
      const side = GLOW.x > p.x ? 1 : -1;
      g.strokeStyle = `rgba(255, 195, 130, ${0.3 * warm * alpha})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(hx, hy, h * 0.078, -Math.PI / 2 + side * 0.3, -Math.PI / 2 + side * 1.4);
      g.stroke();
      g.strokeStyle = `rgba(255, 195, 130, ${0.16 * warm * alpha})`;
      g.beginPath();
      g.moveTo(p.x + side * w * 0.42, yb - h * 0.66);
      g.lineTo(p.x + side * w * 0.46, yb - h * 0.3);
      g.stroke();
    }
    g.restore();
  }

  function drawSitter(g, p, t, alpha) {
    if (alpha <= 0.01) return;
    const x = p.stool.x + Math.sin(t * 0.4 + p.swayPhase) * 1.1;
    const lean = Math.sin(t * 0.11 + p.phase) * 2;
    const hx = x + lean;
    const w = p.female ? 26 : 30;

    g.save();
    g.globalAlpha = alpha * 0.92;
    g.shadowColor = p.coat;
    g.shadowBlur = 5;

    // lower legs, feet resting on the footrest
    g.strokeStyle = p.coat;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - 8, 356);
    g.quadraticCurveTo(x - 10, 368, x - 5, 381);
    g.moveTo(x + 8, 356);
    g.quadraticCurveTo(x + 10, 368, x + 5, 381);
    g.stroke();

    // one soft hunched form over the counter
    g.fillStyle = p.coat;
    g.beginPath();
    g.moveTo(x - w * 0.55, 360);
    g.bezierCurveTo(x - w * 0.62, 338, x - w * 0.5 + lean, 320, hx - w * 0.32, 314);
    g.quadraticCurveTo(hx, 306, hx + w * 0.32, 314);
    g.bezierCurveTo(x + w * 0.5 + lean, 320, x + w * 0.62, 338, x + w * 0.55, 360);
    g.closePath();
    g.fill();

    // pale shirt across the shoulders
    if (p.pale) {
      g.fillStyle = "rgba(212, 202, 184, 0.4)";
      g.beginPath();
      g.moveTo(hx - w * 0.3, 316);
      g.quadraticCurveTo(hx, 308, hx + w * 0.3, 316);
      g.quadraticCurveTo(hx + w * 0.3, 328, hx, 331);
      g.quadraticCurveTo(hx - w * 0.3, 328, hx - w * 0.3, 316);
      g.closePath();
      g.fill();
    }

    // head + hair
    g.fillStyle = "#23202c";
    g.beginPath();
    g.arc(hx, 301, 9.5, 0, Math.PI * 2);
    g.fill();
    if (p.female) {
      if (p.hairBun) {
        g.beginPath();
        g.arc(hx, 292, 4.5, 0, Math.PI * 2);
        g.fill();
      } else {
        g.beginPath();
        g.ellipse(hx, 312, 9, 11, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.shadowBlur = 0;

    // warm rim light on the side facing the counter glow
    const ang = Math.atan2(GLOW.y - 301, GLOW.x - hx);
    g.strokeStyle = `rgba(255, 195, 130, ${0.32 * alpha})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(hx, 301, 9.5, ang - 1.0, ang + 1.0);
    g.stroke();
    g.strokeStyle = `rgba(255, 195, 130, ${0.16 * alpha})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hx, 322, 15, ang - 0.7, ang + 0.5);
    g.stroke();
    g.restore();
  }

  function drawPerson(g, p, t) {
    switch (p.state) {
      case "in":
      case "out":
        drawWalker(g, p, t, p.kind === "passer" ? 0.8 : 0.95);
        break;
      case "sitdown": {
        const k = Math.min(1, (t - p.t0) / 1.3);
        drawWalker(g, p, t, 1 - k, k * 55);
        drawSitter(g, p, t, k);
        break;
      }
      case "seated":
        drawSitter(g, p, t, 1);
        break;
      case "standup": {
        const k = Math.min(1, (t - p.t0) / 1.3);
        drawSitter(g, p, t, 1 - k);
        drawWalker(g, p, t, k, (1 - k) * 55);
        break;
      }
    }
  }

  // ---------------------------------------------------------------
  // chef + steam (shop space)
  // ---------------------------------------------------------------

  function drawChef(g, t, alpha) {
    if (alpha < 0.03) return;
    const cx = 358 + 30 * Math.sin(t * 0.055 + 1) + 16 * Math.sin(t * 0.023);
    const bob = Math.sin(t * 1.1) * 1.3;

    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = "rgba(212, 198, 172, 0.82)";
    g.beginPath();
    g.moveTo(cx - 21, 292 + bob);
    g.bezierCurveTo(cx - 21, 270 + bob, cx - 18, 258 + bob, cx - 10, 253 + bob);
    g.quadraticCurveTo(cx, 248 + bob, cx + 10, 253 + bob);
    g.bezierCurveTo(cx + 18, 258 + bob, cx + 21, 270 + bob, cx + 21, 292 + bob);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(120, 96, 66, 0.45)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 15, 274 + bob);
    g.lineTo(cx + 15, 274 + bob);
    g.stroke();
    g.strokeStyle = "rgba(212, 198, 172, 0.72)";
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx + 13, 262 + bob);
    g.lineTo(cx + 23 + Math.sin(t * 2.3) * 3, 282 + bob + Math.cos(t * 2.3) * 2);
    g.stroke();
    g.fillStyle = "#2a2018";
    g.beginPath();
    g.arc(cx, 240 + bob, 10, 0, Math.PI * 2);
    g.fill();
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
  // light (shop space)
  // ---------------------------------------------------------------

  function drawGlows(g, t, fl, openK, nightK) {
    if (openK < 0.02) return;
    g.save();
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

    // warm haze rising off the shop at night
    g.save();
    g.globalCompositeOperation = "lighter";
    const haze = g.createRadialGradient(380, 300, 40, 380, 300, 420);
    haze.addColorStop(0, `rgba(255, 170, 90, ${0.07 * openK * (0.4 + 0.6 * nightK)})`);
    haze.addColorStop(1, "rgba(255, 170, 90, 0)");
    g.fillStyle = haze;
    g.fillRect(-380, -260, 1520, 1120);

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
  // bokeh — gauzy, half-focused city light (paper coords except shop ones)
  // ---------------------------------------------------------------

  const bokeh = (() => {
    const rng = mulberry32(41);
    const orbs = [];
    // the city behind you, breathing in circles of light
    for (let i = 0; i < 26; i++) {
      orbs.push({
        kind: "city",
        x: rng() * W,
        y: 16 + rng() * 240,
        r: 7 + rng() * 13,
        warm: rng() > 0.45,
        a: 0.05 + rng() * 0.09,
        ph: rng() * 6.28,
        sp: 0.12 + rng() * 0.3,
      });
    }
    // warmth drifting off the lanterns (paper coords, near the mapped lanterns)
    for (const lx of [TX + S * 178, TX + S * 582]) {
      for (let i = 0; i < 3; i++) {
        const ang = rng() * 6.28;
        const d = 26 + rng() * 34;
        orbs.push({
          kind: "lantern",
          x: lx + Math.cos(ang) * d,
          y: TY + S * 168 + Math.sin(ang) * d * 0.8,
          r: 6 + rng() * 9,
          warm: true,
          a: 0.06 + rng() * 0.08,
          ph: rng() * 6.28,
          sp: 0.15 + rng() * 0.35,
        });
      }
    }
    // faint reflections in the street
    for (let i = 0; i < 5; i++) {
      orbs.push({
        kind: "street",
        x: 320 + rng() * 200,
        y: GROUND + 14 + rng() * 60,
        r: 4 + rng() * 6,
        warm: true,
        a: 0.04 + rng() * 0.04,
        ph: rng() * 6.28,
        sp: 0.12 + rng() * 0.25,
      });
    }
    return orbs;
  })();

  function drawBokeh(g, t, openK, nightK, kinds) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const o of bokeh) {
      if (!kinds.includes(o.kind)) continue;
      const gate = o.kind === "city" ? nightK : openK;
      if (gate < 0.03) continue;
      const tw = 0.65 + 0.35 * Math.sin(t * o.sp + o.ph);
      const a = o.a * gate * tw;
      const c = o.warm ? "255, 216, 160" : "212, 218, 245";
      const grad = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      grad.addColorStop(0, `rgba(${c}, ${a})`);
      grad.addColorStop(0.55, `rgba(${c}, ${a * 0.55})`);
      grad.addColorStop(1, `rgba(${c}, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ---------------------------------------------------------------
  // mist, neon, vending machine — the dreamy block (paper coords)
  // ---------------------------------------------------------------

  function drawMist(g, t, nightK) {
    const strength = 0.4 + 0.6 * nightK;
    g.save();
    for (const [my, mr, msp, mph] of [[GROUND - 6, 190, 3.2, 0], [GROUND + 40, 240, 2.1, 2.5], [230, 260, 1.4, 4.6]]) {
      const mx = ((t * msp + mph * 130) % (W + 500)) - 250;
      const grad = g.createRadialGradient(mx, my, 0, mx, my, mr);
      grad.addColorStop(0, `rgba(178, 182, 210, ${0.045 * strength})`);
      grad.addColorStop(1, "rgba(178, 182, 210, 0)");
      g.fillStyle = grad;
      g.save();
      g.translate(mx, my);
      g.scale(1, 0.28);
      g.translate(-mx, -my);
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
  }

  function drawStreetLife(g, t, fl, nightK) {
    if (nightK < 0.03) return;
    g.save();

    // the neon strip, humming rose-pink
    g.shadowColor = `rgba(240, 130, 170, ${0.55 * nightK})`;
    g.shadowBlur = 16;
    g.fillStyle = `rgba(244, 150, 185, ${(0.2 + fl * 0.05) * nightK})`;
    g.fillRect(797, 264, 11, 74);
    g.shadowBlur = 0;
    g.fillStyle = `rgba(255, 190, 215, ${0.3 * nightK})`;
    g.fillRect(800, 268, 3, 66);

    // the vending machine, awake all night
    g.shadowColor = `rgba(150, 200, 255, ${0.5 * nightK})`;
    g.shadowBlur = 14;
    g.fillStyle = `rgba(160, 205, 250, ${(0.16 + fl * 0.04) * nightK})`;
    g.fillRect(703, 334, 24, 30);
    g.shadowBlur = 0;
    g.fillStyle = `rgba(220, 235, 255, ${0.25 * nightK})`;
    for (let i = 0; i < 3; i++) g.fillRect(706 + i * 7, 340, 4, 6);
    // its little pool of cold light
    g.save();
    g.globalCompositeOperation = "lighter";
    const vp = g.createRadialGradient(715, 384, 2, 715, 384, 46);
    vp.addColorStop(0, `rgba(150, 200, 255, ${0.08 * nightK})`);
    vp.addColorStop(1, "rgba(150, 200, 255, 0)");
    g.fillStyle = vp;
    g.save();
    g.translate(715, 384);
    g.scale(1, 0.35);
    g.translate(-715, -384);
    g.beginPath();
    g.arc(715, 384, 46, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.restore();

    g.restore();
  }

  // ---------------------------------------------------------------
  // the paper: a webgl pass that turns each frame into watercolor —
  // wobbled edges, pigment granulation, washes, and color blending
  // ---------------------------------------------------------------

  function createPainter(target) {
    const gl = target.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return null;

    const vsrc = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }`;

    const fsrc = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec2 uRes;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      void main() {
        vec2 uv = vUv;
        vec2 px = 1.0 / uRes;

        // hand wobble: no line stays quite straight
        vec2 wf = uv * vec2(9.0, 6.6);
        vec2 warp = vec2(fbm(wf), fbm(wf + vec2(5.2, 1.3))) - 0.5;
        vec2 wuv = uv + warp * px * 4.5;

        // gentle diffusion, pigment spreading into wet paper
        vec3 c = texture2D(uTex, wuv).rgb * 0.38;
        c += texture2D(uTex, wuv + vec2( 1.8,  0.4) * px).rgb * 0.155;
        c += texture2D(uTex, wuv + vec2(-1.8, -0.4) * px).rgb * 0.155;
        c += texture2D(uTex, wuv + vec2( 0.4,  1.8) * px).rgb * 0.155;
        c += texture2D(uTex, wuv + vec2(-0.4, -1.8) * px).rgb * 0.155;

        float lum = dot(c, vec3(0.299, 0.587, 0.114));

        // granulation: coarse pigment blotches and the fine tooth of the sheet
        float g1 = fbm(uv * uRes / 7.0);
        float g2 = vnoise(uv * uRes / 2.2);
        float mid = smoothstep(0.02, 0.22, lum) * (1.0 - smoothstep(0.6, 0.98, lum));
        c *= 1.0 + (g1 - 0.5) * 0.3 * mid + (g2 - 0.5) * 0.16 * mid;
        // the paper's tooth shows faintly even where the wash is pale
        c *= 1.0 + (g1 - 0.5) * 0.06 * smoothstep(0.6, 0.95, lum);

        // slow washes of tone drifting across the sheet
        float wash = fbm(uv * 2.6 + 3.7);
        c *= 1.0 + (wash - 0.5) * 0.1;

        // color blending: shadows cool off, light warms up, black lifts to paper
        c = mix(c, c * vec3(0.94, 0.97, 1.09), (1.0 - lum) * 0.3);
        c = mix(c, c * vec3(1.06, 1.0, 0.94), smoothstep(0.45, 0.9, lum) * 0.16);
        c += vec3(0.05, 0.045, 0.04) * (1.0 - smoothstep(0.0, 0.35, lum));

        gl_FragColor = vec4(c, 1.0);
      }`;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    const vs = compile(gl.VERTEX_SHADER, vsrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const uResLoc = gl.getUniformLocation(prog, "uRes");

    return {
      draw(source) {
        gl.viewport(0, 0, target.width, target.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform2f(uResLoc, target.width, target.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
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
  const painter = createPainter(canvas);
  const ctx2d = painter ? null : canvas.getContext("2d");

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
    canvasSpace(g);

    // sky, the color of the hour
    const sky = g.createLinearGradient(0, 0, 0, GROUND + 30);
    sky.addColorStop(0, rgb(P.sky0));
    sky.addColorStop(1, rgb(P.sky1));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // the city's bokeh, behind everything
    drawBokeh(g, t, openK, nightK, ["city"]);

    // the block, tinted by the hour
    if (canFilter) g.filter = `brightness(${P.bright.toFixed(3)}) saturate(${P.sat.toFixed(3)})`;
    g.drawImage(facadeLayer, 0, 0, W, H);
    if (canFilter) g.filter = "none";

    // lit windows far away
    if (nightK > 0.05) {
      for (const wdw of cityWindows) {
        g.fillStyle = `rgba(214, 170, 100, ${wdw.a * nightK})`;
        g.fillRect(wdw.x, wdw.y, 7, 9);
      }
    }

    // daylight reaching the street
    const dayK = 1 - nightK;
    if (dayK > 0.02) {
      const dg = g.createLinearGradient(0, GROUND, 0, H);
      dg.addColorStop(0, `rgba(208, 200, 188, ${0.16 * dayK})`);
      dg.addColorStop(1, `rgba(208, 200, 188, ${0.08 * dayK})`);
      g.fillStyle = dg;
      g.fillRect(0, GROUND, W, H - GROUND);
    }

    drawStreetLife(g, t, fl, nightK);

    // --- inside the shop's little world ---
    sceneSpace(g);

    drawGlows(g, t, fl, openK, nightK);
    drawChef(g, t, openK);
    updateSteam(dt, t, wd, openK);
    drawSteam(g);

    if (openK > 0.9 && t > nextArrival) {
      const ok = spawnPatron(t);
      nextArrival = t + (ok ? rand(14, 40) : rand(8, 16));
    }
    if (t > nextPasser) {
      spawnPasser();
      nextPasser = t + (openK > 0.5 ? rand(25, 70) : rand(12, 34));
    }
    for (const p of people) updatePerson(p, dt, t, openK);
    for (let i = people.length - 1; i >= 0; i--) {
      if (people[i].dead) people.splice(i, 1);
    }

    for (const p of people) if (p.kind === "patron") drawPerson(g, p, t);

    drawShutter(g, openK);
    drawNoren(g, t, wd, openK);
    for (const l of smallLanterns) drawSmallLantern(g, l, t, wd, fl, openK);
    for (const l of bigLanterns) drawBigLantern(g, l, t, wd, fl, openK);

    drawLightPool(g, t, fl, openK);
    for (const p of people) if (p.kind === "passer") drawPerson(g, p, t);

    // --- back out on the street ---
    canvasSpace(g);

    drawBokeh(g, t, openK, nightK, ["lantern", "street"]);
    drawMist(g, t, nightK);

    // the color of the hour, washed over everything
    g.fillStyle = `rgba(${P.air[0] | 0}, ${P.air[1] | 0}, ${P.air[2] | 0}, ${P.air[3]})`;
    g.fillRect(0, 0, W, H);

    // a slow breath over the whole scene, like the evening exhaling
    g.fillStyle = `rgba(30, 26, 40, ${(0.04 + 0.03 * Math.sin(t * 0.09)) * (0.3 + 0.7 * nightK)})`;
    g.fillRect(0, 0, W, H);

    g.drawImage(fgLayer, 0, 0, W, H);

    // --- the paper pass: the whole frame becomes a watercolor ---
    if (painter) {
      painter.draw(off);
    } else {
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.drawImage(off, 0, 0, W, H);
      if (canFilter) {
        ctx2d.save();
        ctx2d.globalAlpha = 0.4;
        ctx2d.filter = "blur(2px)";
        ctx2d.drawImage(off, 0, 0, W, H);
        ctx2d.restore();
      }
    }

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
  nextArrival = rand(6, 14);
  nextPasser = rand(8, 20);

  window.__izakaya = { people, stools, spawnPatron, spawnPasser, get t() { return tAnim; }, get hour() { return currentHour(); } };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    for (let i = 0; i < 180; i++) frame(i * 16.7);
  } else {
    requestAnimationFrame(loop);
  }
})();
