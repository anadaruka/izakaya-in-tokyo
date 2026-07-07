/* an izakaya in tokyo — a quiet generative scene.
   everything is painted by hand on a 760x560 canvas:
   soft watercolor night, lanterns on the wind, people who
   drift in, sit at the counter for a while, and drift on. */

(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const W = 760;
  const H = 560;
  const PAGE_BG = "#17110d";
  const JP_FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

  // glow center of the shop interior — rim light on people points at this
  const GLOW = { x: 380, y: 250 };

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
  // static layers (painted once)
  // ---------------------------------------------------------------

  const bgLayer = document.createElement("canvas");
  const fgLayer = document.createElement("canvas");

  function paintBackground() {
    const g = bgLayer.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const rng = mulberry32(7);

    // night wash
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1d1410");
    sky.addColorStop(0.55, "#191210");
    sky.addColorStop(1, "#120d0b");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // a faint warm haze rising off the whole block
    const haze = g.createRadialGradient(380, 300, 40, 380, 300, 420);
    haze.addColorStop(0, "rgba(255, 170, 90, 0.07)");
    haze.addColorStop(1, "rgba(255, 170, 90, 0)");
    g.fillStyle = haze;
    g.fillRect(0, 0, W, H);

    // distant buildings, barely there
    g.fillStyle = "#141009";
    for (const [bx, bw, bh] of [[-30, 150, 96], [96, 90, 60], [560, 110, 72], [648, 140, 108]]) {
      g.fillRect(bx, 0, bw, bh);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(214, 160, 88, ${0.10 + rng() * 0.14})`;
      const side = rng() > 0.5;
      g.fillRect(side ? 590 + rng() * 160 : rng() * 130, 14 + rng() * 70, 5, 7);
    }

    // utility pole + cables
    g.strokeStyle = "rgba(180, 160, 140, 0.13)";
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
    g.strokeStyle = "rgba(0,0,0,0.35)";
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

    // signboard, warm and backlit
    g.save();
    g.shadowColor = "rgba(255, 200, 130, 0.45)";
    g.shadowBlur = 18;
    const sb = g.createLinearGradient(0, 92, 0, 134);
    sb.addColorStop(0, "#d8ac6a");
    sb.addColorStop(1, "#b0824a");
    g.fillStyle = sb;
    g.fillRect(225, 92, 310, 42);
    g.restore();
    g.strokeStyle = "#33200f";
    g.lineWidth = 3;
    g.strokeRect(225, 92, 310, 42);
    g.fillStyle = "#241305";
    g.font = `27px ${JP_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("居酒屋　とまり木", 380, 114);

    // posts
    for (const px of [126, 604]) {
      g.fillStyle = "#261812";
      g.fillRect(px, 104, 30, 343);
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const gx = px + 5 + rng() * 20;
        g.beginPath();
        g.moveTo(gx, 110 + rng() * 40);
        g.lineTo(gx + rng() * 3 - 1.5, 430);
        g.stroke();
      }
    }

    // standing lit sign on the left, like an old menu lamp
    g.save();
    g.shadowColor = "rgba(244, 215, 145, 0.5)";
    g.shadowBlur = 24;
    const ss = g.createLinearGradient(0, 238, 0, 432);
    ss.addColorStop(0, "#ead9a8");
    ss.addColorStop(1, "#cdb684");
    g.fillStyle = ss;
    g.fillRect(84, 238, 38, 194);
    g.restore();
    g.strokeStyle = "#2a1c10";
    g.lineWidth = 3;
    g.strokeRect(84, 238, 38, 194);
    verticalText(g, "お酒とさかな", 103, 266, 17, 27, "#4a3417", 0.9);

    // --- interior, seen through the opening (below the signboard band) ---
    g.save();
    g.beginPath();
    g.rect(238, 146, 284, 301);
    g.clip();

    const back = g.createLinearGradient(0, 146, 0, 310);
    back.addColorStop(0, "#54391f");
    back.addColorStop(1, "#3a2718");
    g.fillStyle = back;
    g.fillRect(238, 146, 284, 164);

    // hanging menu strips
    for (let i = 0; i < 8; i++) {
      const mx = 252 + i * 33;
      g.fillStyle = "rgba(227, 207, 159, 0.85)";
      g.fillRect(mx, 150, 20, 62);
      g.fillStyle = "rgba(50, 34, 18, 0.75)";
      for (let d = 0; d < 4; d++) g.fillRect(mx + 7, 158 + d * 13, 6, 7);
    }

    // shelf with dishes
    g.strokeStyle = "rgba(30, 18, 10, 0.6)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(244, 248);
    g.lineTo(400, 248);
    g.stroke();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(216, 196, 154, ${0.35 + rng() * 0.2})`;
      g.fillRect(252 + i * 26 + rng() * 6, 236 - rng() * 8, 18, 10);
    }

    // bottles along the back of the counter, dark against the light
    g.fillStyle = "rgba(30, 20, 12, 0.85)";
    for (const bx of [255, 268, 282, 470, 484, 498, 510]) {
      const bh = 18 + rng() * 9;
      g.fillRect(bx, 292 - bh, 8, bh);
      g.fillRect(bx + 2.5, 292 - bh - 5, 3, 6);
    }

    // counter
    g.fillStyle = "#7a5024";
    g.fillRect(240, 292, 280, 14);
    g.fillStyle = "rgba(255, 217, 160, 0.75)";
    g.fillRect(240, 291, 280, 2.5);
    g.fillStyle = "#2e1d12";
    g.fillRect(240, 306, 280, 32);
    const cs = g.createLinearGradient(0, 338, 0, 366);
    cs.addColorStop(0, "rgba(0,0,0,0.45)");
    cs.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = cs;
    g.fillRect(240, 338, 280, 28);

    // floor inside
    const fl = g.createLinearGradient(0, 338, 0, 447);
    fl.addColorStop(0, "#4a2f1c");
    fl.addColorStop(1, "#241710");
    g.fillStyle = fl;
    g.fillRect(238, 338, 284, 109);
    g.restore();

    // stools (always there, patrons sit over them)
    for (const sx of [288, 356, 424, 492]) {
      g.strokeStyle = "rgba(150, 138, 124, 0.7)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, 388);
      g.lineTo(sx, 436);
      g.stroke();
      // footrest ring
      g.strokeStyle = "rgba(150, 138, 124, 0.55)";
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(sx, 420, 8, 2.6, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(60, 50, 44, 0.8)";
      g.beginPath();
      g.ellipse(sx, 438, 11, 3.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5d3a28";
      g.beginPath();
      g.ellipse(sx, 386, 15, 5.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255, 180, 94, 0.35)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(sx, 385, 14, 4.8, 0, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    }

    // threshold + street
    g.fillStyle = "#0f0b09";
    g.fillRect(0, 445, W, 6);
    const st = g.createLinearGradient(0, 451, 0, H);
    st.addColorStop(0, "#1e1510");
    st.addColorStop(1, "#140f0c");
    g.fillStyle = st;
    g.fillRect(0, 451, W, H - 451);
    g.strokeStyle = "rgba(255, 255, 255, 0.025)";
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const sy = 455 + rng() * 100;
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
    const fade = 34;
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
    g.shadowBlur = 30;
    for (let i = 0; i < 70; i++) {
      const edge = Math.floor(rng() * 4);
      let x, y;
      if (edge === 0) { x = rng() * W; y = rng() * 26; }
      else if (edge === 1) { x = rng() * W; y = H - rng() * 26; }
      else if (edge === 2) { x = rng() * 26; y = rng() * H; }
      else { x = W - rng() * 26; y = rng() * H; }
      g.globalAlpha = 0.12 + rng() * 0.3;
      g.fillStyle = PAGE_BG;
      g.beginPath();
      g.arc(x, y, 8 + rng() * 34, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // corner vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.82);
    vg.addColorStop(0, "rgba(10, 7, 5, 0)");
    vg.addColorStop(1, "rgba(10, 7, 5, 0.34)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // paper grain
    for (let i = 0; i < 2600; i++) {
      const bright = rng() > 0.5;
      g.fillStyle = bright ? "rgba(255, 240, 220, 0.028)" : "rgba(0, 0, 0, 0.05)";
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

  function drawBigLantern(l, t, wd, fl) {
    const a = wd * 0.11 + Math.sin(t * 0.9 + l.phase) * 0.016;
    ctx.save();
    ctx.translate(l.px, l.py);
    ctx.rotate(a);

    ctx.strokeStyle = "rgba(20, 14, 10, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, l.cord);
    ctx.stroke();

    const cy = l.cord + l.ry;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, cy, 4, 0, cy, l.rx * 2.6);
    glow.addColorStop(0, `rgba(255, 120, 60, ${0.30 + fl * 0.10})`);
    glow.addColorStop(1, "rgba(255, 120, 60, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-l.rx * 3, cy - l.rx * 3, l.rx * 6, l.rx * 6);
    ctx.restore();

    const body = ctx.createRadialGradient(-6, cy - 8, 4, 0, cy, l.ry);
    body.addColorStop(0, `rgba(255, 118, 62, ${0.92 + fl * 0.08})`);
    body.addColorStop(0.55, "#d84a26");
    body.addColorStop(1, "#8e2414");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, cy, l.rx, l.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(60, 12, 6, 0.35)";
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) {
      const yy = cy - l.ry + (i * 2 * l.ry) / 5;
      const w2 = l.rx * Math.sqrt(Math.max(0, 1 - ((yy - cy) / l.ry) ** 2));
      ctx.beginPath();
      ctx.ellipse(0, yy, w2, 3.4, 0, 0, Math.PI, false);
      ctx.stroke();
    }

    ctx.fillStyle = "#241a14";
    ctx.fillRect(-10, l.cord - 4, 20, 8);
    ctx.fillRect(-9, cy + l.ry - 4, 18, 8);
    ctx.strokeStyle = "rgba(36, 26, 20, 0.9)";
    ctx.beginPath();
    ctx.moveTo(0, cy + l.ry + 4);
    ctx.lineTo(0, cy + l.ry + 12);
    ctx.stroke();

    ctx.fillStyle = "rgba(248, 236, 218, 0.92)";
    ctx.font = `23px ${JP_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(l.chars, 0, cy + 1);
    ctx.restore();
  }

  function drawSmallLantern(l, t, wd, fl) {
    const a = wd * 0.14 + Math.sin(t * 1.1 + l.phase) * 0.02;
    ctx.save();
    ctx.translate(l.px, l.py);
    ctx.rotate(a);

    ctx.strokeStyle = "rgba(20, 14, 10, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, l.cord);
    ctx.stroke();

    const cy = l.cord + l.r;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, cy, 2, 0, cy, l.r * 3);
    glow.addColorStop(0, `rgba(255, 168, 88, ${0.24 + fl * 0.08})`);
    glow.addColorStop(1, "rgba(255, 168, 88, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-l.r * 3.2, cy - l.r * 3.2, l.r * 6.4, l.r * 6.4);
    ctx.restore();

    const body = ctx.createRadialGradient(-3, cy - 4, 1, 0, cy, l.r * 1.2);
    body.addColorStop(0, "#ffcf8e");
    body.addColorStop(0.6, "#f09a48");
    body.addColorStop(1, "#c05a22");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, cy, l.r, l.r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a32a18";
    ctx.fillRect(-6, cy - l.r * 1.15 - 3, 12, 5);
    ctx.fillRect(-5.5, cy + l.r * 1.15 - 2, 11, 5);
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // noren
  // ---------------------------------------------------------------

  function drawNoren(t, wd) {
    const chars = ["居", "酒", "屋"];
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(236, 143, 288, 5);
    for (let i = 0; i < 3; i++) {
      const x0 = 240 + i * 95;
      const off = wd * 8 * (0.75 + 0.25 * Math.sin(i * 2.1)) + Math.sin(t * 0.7 + i * 1.9) * 1.5;
      ctx.fillStyle = i === 1 ? "#273154" : "#232c4d";
      ctx.beginPath();
      ctx.moveTo(x0, 148);
      ctx.lineTo(x0 + 90, 148);
      ctx.quadraticCurveTo(x0 + 90 + off * 0.5, 190, x0 + 90 + off, 224);
      ctx.quadraticCurveTo(x0 + 45 + off, 230 + Math.sin(t * 0.9 + i) * 2, x0 + off, 224);
      ctx.quadraticCurveTo(x0 + off * 0.5, 190, x0, 148);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = 1.5;
      for (const fx of [0.3, 0.68]) {
        ctx.beginPath();
        ctx.moveTo(x0 + 90 * fx, 150);
        ctx.quadraticCurveTo(x0 + 90 * fx + off * 0.5, 190, x0 + 90 * fx + off * 0.9, 222);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(x0 + 45 + off * 0.6, 190);
      ctx.rotate(off * 0.004);
      ctx.fillStyle = "rgba(236, 230, 218, 0.92)";
      ctx.font = `32px ${JP_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
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

  const people = [];
  let nextArrival = 0;
  let nextPasser = 0;

  function makeWalker(kind) {
    return {
      kind,
      state: "in",
      x: 0,
      dir: 1,
      speed: rand(34, 52),
      h: rand(84, 104),
      baseY: kind === "passer" ? rand(514, 528) : rand(486, 496),
      phase: rand(0, 6.28),
      swayPhase: rand(0, 6.28),
      bag: Math.random() < 0.35,
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

  function seatPatronNow(t) {
    // for the opening frame: someone is already here
    if (!spawnPatron(t)) return;
    const p = people[people.length - 1];
    p.state = "seated";
    p.until = t + rand(14, 45);
  }

  function updatePerson(p, dt, t) {
    switch (p.state) {
      case "in": {
        p.x += p.dir * p.speed * dt;
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
        if (t > p.until) {
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

  function drawWalker(p, t, alpha) {
    if (alpha <= 0.01) return;
    const h = p.h;
    const stride = p.x * 0.105 + p.phase;
    const bob = Math.abs(Math.cos(stride)) * 1.8;
    const yb = p.baseY - bob;

    ctx.save();
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = "#0d0a10";
    ctx.strokeStyle = "#0d0a10";
    ctx.shadowColor = "#0d0a10";
    ctx.shadowBlur = 5;
    ctx.lineCap = "round";

    // legs
    const spread = Math.sin(stride) * h * 0.1;
    ctx.lineWidth = h * 0.075;
    ctx.beginPath();
    ctx.moveTo(p.x, yb - h * 0.42);
    ctx.lineTo(p.x + spread, yb);
    ctx.moveTo(p.x, yb - h * 0.42);
    ctx.lineTo(p.x - spread, yb);
    ctx.stroke();

    // torso
    capsule(ctx, p.x, yb - h * 0.82, h * 0.27, h * 0.44);

    // arm
    ctx.lineWidth = h * 0.055;
    ctx.beginPath();
    ctx.moveTo(p.x, yb - h * 0.72);
    ctx.lineTo(p.x - spread * 0.6, yb - h * 0.44);
    ctx.stroke();

    // head
    ctx.beginPath();
    ctx.arc(p.x + p.dir * 1.5, yb - h + h * 0.075, h * 0.075, 0, Math.PI * 2);
    ctx.fill();

    if (p.bag) {
      ctx.fillRect(p.x - p.dir * h * 0.16, yb - h * 0.48, h * 0.11, h * 0.13);
    }

    // warm rim as they pass through the shop's light
    const warm = Math.max(0, 1 - Math.abs(p.x - GLOW.x) / 250);
    if (warm > 0.05) {
      ctx.shadowBlur = 0;
      const hy = yb - h + h * 0.075;
      const ang = Math.atan2(-1, GLOW.x > p.x ? 1 : -1);
      ctx.strokeStyle = `rgba(255, 190, 120, ${0.42 * warm})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x + p.dir * 1.5, hy, h * 0.075, ang - 0.9, ang + 0.9);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 190, 120, ${0.24 * warm})`;
      ctx.beginPath();
      ctx.moveTo(p.x + (GLOW.x > p.x ? 1 : -1) * h * 0.13, yb - h * 0.78);
      ctx.lineTo(p.x + (GLOW.x > p.x ? 1 : -1) * h * 0.13, yb - h * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSitter(p, t, alpha) {
    if (alpha <= 0.01) return;
    const x = p.stool.x + Math.sin(t * 0.5 + p.swayPhase) * 1.2;
    const lean = Math.sin(t * 0.13 + p.phase) * 2;
    const hx = x + lean;

    ctx.save();
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = "#171219";
    ctx.shadowColor = "#171219";
    ctx.shadowBlur = 3;

    // lower legs dangle, feet hooked on the footrest — never touching the floor
    ctx.strokeStyle = "#171219";
    ctx.lineWidth = 6.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 10, 382);
    ctx.quadraticCurveTo(x - 12, 398, x - 6, 413);
    ctx.moveTo(x + 10, 382);
    ctx.quadraticCurveTo(x + 12, 398, x + 6, 413);
    ctx.stroke();

    // hunched back over the counter, seen from behind — wide and low
    ctx.beginPath();
    ctx.moveTo(x - 17, 386);
    ctx.bezierCurveTo(x - 20, 360, x - 17 + lean, 338, hx - 14, 328);
    ctx.quadraticCurveTo(hx, 319, hx + 14, 328);
    ctx.bezierCurveTo(x + 17 + lean, 338, x + 20, 360, x + 17, 386);
    ctx.closePath();
    ctx.fill();

    // elbows out, arms resting on the counter
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hx - 13, 333);
    ctx.quadraticCurveTo(x - 21, 344, x - 19, 356);
    ctx.moveTo(hx + 13, 333);
    ctx.quadraticCurveTo(x + 21, 344, x + 19, 356);
    ctx.stroke();

    // head, tucked low
    ctx.beginPath();
    ctx.arc(hx, 314, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // warm rim light on the side facing the counter glow
    const ang = Math.atan2(GLOW.y - 314, GLOW.x - hx);
    ctx.strokeStyle = "rgba(255, 195, 125, 0.42)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(hx, 314, 10, ang - 1.0, ang + 1.0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 195, 125, 0.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, 336, 16, ang - 0.7, ang + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawPerson(p, t) {
    switch (p.state) {
      case "in":
      case "out":
        drawWalker(p, t, p.kind === "passer" ? 0.85 : 1);
        break;
      case "sitdown": {
        const k = Math.min(1, (t - p.t0) / 1.1);
        drawWalker(p, t, 1 - k);
        drawSitter(p, t, k);
        break;
      }
      case "seated":
        drawSitter(p, t, 1);
        break;
      case "standup": {
        const k = Math.min(1, (t - p.t0) / 1.1);
        drawSitter(p, t, 1 - k);
        drawWalker(p, t, k);
        break;
      }
    }
  }

  // ---------------------------------------------------------------
  // chef + steam
  // ---------------------------------------------------------------

  function drawChef(t) {
    const cx = 358 + 30 * Math.sin(t * 0.055 + 1) + 16 * Math.sin(t * 0.023);
    const bob = Math.sin(t * 1.1) * 1.3;

    ctx.save();
    // body in pale working cloth, shoulders sloping, lit from within
    ctx.fillStyle = "rgba(214, 200, 174, 0.82)";
    ctx.beginPath();
    ctx.moveTo(cx - 22, 294 + bob);
    ctx.bezierCurveTo(cx - 22, 272 + bob, cx - 19, 260 + bob, cx - 11, 255 + bob);
    ctx.quadraticCurveTo(cx, 250 + bob, cx + 11, 255 + bob);
    ctx.bezierCurveTo(cx + 19, 260 + bob, cx + 22, 272 + bob, cx + 22, 294 + bob);
    ctx.closePath();
    ctx.fill();
    // apron tie
    ctx.strokeStyle = "rgba(120, 96, 66, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 16, 276 + bob);
    ctx.lineTo(cx + 16, 276 + bob);
    ctx.stroke();
    // an arm at work, small stirring motion
    ctx.strokeStyle = "rgba(214, 200, 174, 0.75)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + 14, 264 + bob);
    ctx.lineTo(cx + 24 + Math.sin(t * 2.3) * 3, 284 + bob + Math.cos(t * 2.3) * 2);
    ctx.stroke();
    // head
    ctx.fillStyle = "#2a2018";
    ctx.beginPath();
    ctx.arc(cx, 242 + bob, 10, 0, Math.PI * 2);
    ctx.fill();
    // small white cap
    ctx.fillStyle = "rgba(232, 222, 200, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, 238 + bob, 9, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  const steam = [];
  let nextSteam = 0;

  function updateSteam(dt, t, wd) {
    if (t > nextSteam && steam.length < 26) {
      steam.push({
        x: 390 + rand(-40, 40),
        y: 292,
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

  function drawSteam() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of steam) {
      const k = s.age / s.life;
      const a = 0.09 * Math.sin(Math.PI * Math.min(1, k)) ** 1.5;
      const r = s.r0 + k * 12;
      const grad = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, r);
      grad.addColorStop(0, `rgba(255, 225, 190, ${a})`);
      grad.addColorStop(1, "rgba(255, 225, 190, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------

  function drawGlows(t, fl) {
    ctx.save();
    // the light lives inside the shop; it should not wash the signboard
    ctx.beginPath();
    ctx.rect(232, 140, 296, 307);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";

    // the big warm heart of the shop
    const heart = ctx.createRadialGradient(GLOW.x, GLOW.y, 30, GLOW.x, GLOW.y, 220);
    heart.addColorStop(0, `rgba(255, 178, 92, ${0.30 + fl * 0.05})`);
    heart.addColorStop(1, "rgba(255, 178, 92, 0)");
    ctx.fillStyle = heart;
    ctx.fillRect(150, 60, 460, 400);

    // bulbs behind the noren
    for (const bx of [300, 380, 460]) {
      const bulb = ctx.createRadialGradient(bx, 168, 1, bx, 168, 26);
      bulb.addColorStop(0, `rgba(255, 214, 150, ${0.35 + fl * 0.12})`);
      bulb.addColorStop(1, "rgba(255, 214, 150, 0)");
      ctx.fillStyle = bulb;
      ctx.fillRect(bx - 28, 140, 56, 56);
    }
    ctx.restore();
  }

  function drawLightPool(t, fl) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pool = ctx.createRadialGradient(380, 462, 20, 380, 462, 230);
    pool.addColorStop(0, `rgba(255, 170, 90, ${0.17 + fl * 0.04})`);
    pool.addColorStop(1, "rgba(255, 170, 90, 0)");
    ctx.fillStyle = pool;
    ctx.save();
    ctx.translate(380, 462);
    ctx.scale(1, 0.32);
    ctx.translate(-380, -462);
    ctx.fillRect(120, 240, 520, 460);
    ctx.restore();

    // faint reflected streaks
    ctx.fillStyle = `rgba(255, 160, 80, ${0.035 + fl * 0.015})`;
    for (const sx of [300, 380, 460]) {
      ctx.fillRect(sx - 5, 452, 10, 60 + Math.sin(t + sx) * 6);
    }
    ctx.restore();
  }

  let tAnim = 0;
  let lastNow = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
    lastNow = now;
    tAnim += dt;
    const t = tAnim;

    const wd = wind(t);
    const fl = flicker(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgLayer, 0, 0, W, H);

    drawGlows(t, fl);
    drawChef(t);
    updateSteam(dt, t, wd);
    drawSteam();

    // people: schedule arrivals + passers-by
    if (t > nextArrival) {
      const ok = spawnPatron(t);
      nextArrival = t + (ok ? rand(9, 26) : rand(5, 11));
    }
    if (t > nextPasser) {
      spawnPasser();
      nextPasser = t + rand(16, 44);
    }
    for (const p of people) updatePerson(p, dt, t);
    for (let i = people.length - 1; i >= 0; i--) {
      if (people[i].dead) people.splice(i, 1);
    }

    // seated + entering patrons behind, passers-by in front
    for (const p of people) if (p.kind === "patron") drawPerson(p, t);

    drawNoren(t, wd);
    for (const l of smallLanterns) drawSmallLantern(l, t, wd, fl);
    for (const l of bigLanterns) drawBigLantern(l, t, wd, fl);

    drawLightPool(t, fl);
    for (const p of people) if (p.kind === "passer") drawPerson(p, t);

    // a slow breath over the whole scene, like the evening exhaling
    ctx.fillStyle = `rgba(23, 17, 13, ${0.05 + 0.035 * Math.sin(t * 0.11)})`;
    ctx.fillRect(0, 0, W, H);

    ctx.drawImage(fgLayer, 0, 0, W, H);
  }

  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, bgLayer, fgLayer]) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    paintBackground();
    paintForeground();
  }

  setup();
  window.addEventListener("resize", () => {
    const next = Math.min(window.devicePixelRatio || 1, 2);
    if (next !== dpr) setup();
  });

  // the shop is never empty when you arrive
  seatPatronNow(0);
  seatPatronNow(0);
  nextArrival = rand(4, 9);
  nextPasser = rand(5, 12);

  window.__izakaya = { people, stools, spawnPatron, spawnPasser, get t() { return tAnim; } };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    // a still painting: run the scene forward, then hold one frame
    for (let i = 0; i < 180; i++) frame(i * 16.7);
  } else {
    requestAnimationFrame(loop);
  }
})();
