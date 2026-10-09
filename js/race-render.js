// Hay Bale Derby — canvas renderer. Reads simulation state, never writes it.
(function (root) {
  const { WORLD, TRACK, LANES, LANE_H, BALE, laneCenter } = root.HaySim;
  const W = WORLD.width;
  const H = WORLD.height;
  const OUTLINE = '#3b2a14';

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const bg = document.createElement('canvas');
    let scale = 1;
    let particles = [];
    let lastTime = 0;
    const lastShout = new Map();

    function resize() {
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round((cssW * H / W) * dpr);
      scale = canvas.width / W;
      bg.width = canvas.width;
      bg.height = canvas.height;
      const bctx = bg.getContext('2d');
      bctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBackground(bctx);
    }

    // ---------- Effects ----------

    function addEvents(events, state) {
      for (const e of events) {
        if (e.type === 'hit') {
          // One shout per animal at a time, even if it bumps two bales at once.
          if (!(lastShout.get(e.animalId) > state.t - 0.8)) {
            lastShout.set(e.animalId, state.t);
            const shout = root.HaySim.ANIMALS[e.kind].sound;
            particles.push({ type: 'text', x: e.x, y: e.y - 30, vx: 0, vy: -28, life: 1.1, max: 1.1, text: shout });
          }
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 90;
            particles.push({
              type: 'straw', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 0.7 + Math.random() * 0.4, max: 1.1, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
            });
          }
          if (e.kind === 'chicken' || e.kind === 'duck') {
            for (let i = 0; i < 6; i++) {
              const a = Math.random() * Math.PI * 2;
              particles.push({
                type: 'feather', x: e.x, y: e.y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50,
                life: 1.4, max: 1.4, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4,
                color: e.kind === 'chicken' ? '#ffffff' : '#a5865a',
              });
            }
          }
          particles.push({ type: 'star', x: (e.x + state.bales[e.lane].x) / 2, y: (e.y + state.bales[e.lane].y) / 2, life: 0.35, max: 0.35 });
        } else if (e.type === 'bump') {
          for (let i = 0; i < 5; i++) addDust(e.x - 10, e.y + (Math.random() - 0.5) * 40, 1.4);
        } else if (e.type === 'clack') {
          particles.push({ type: 'star', x: e.x, y: e.y, life: 0.3, max: 0.3 });
        }
      }
    }

    function addDust(x, y, size = 1) {
      particles.push({
        type: 'dust', x, y, vx: -10 - Math.random() * 20, vy: (Math.random() - 0.5) * 20,
        life: 0.6 + Math.random() * 0.4, max: 1, size: (4 + Math.random() * 5) * size,
      });
    }

    function updateParticles(dt, state, racing) {
      if (racing && state) {
        for (const b of state.bales) {
          if (b.vx > 30 && Math.random() < 0.35) {
            addDust(b.x - BALE.w / 2, b.y + (Math.random() - 0.5) * BALE.h * 0.8);
          }
        }
      }
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 'straw' || p.type === 'feather') {
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.rot += p.spin * dt;
        }
      }
      particles = particles.filter((p) => p.life > 0);
    }

    function drawParticles(layer) {
      for (const p of particles) {
        const k = Math.max(0, p.life / p.max);
        if (layer === 'under' && p.type === 'dust') {
          ctx.globalAlpha = k * 0.5;
          ctx.fillStyle = '#d9c08a';
          circle(ctx, p.x, p.y, p.size * (1.6 - k * 0.6));
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (layer === 'over') {
          if (p.type === 'straw') {
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 2);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.strokeStyle = '#e9c35a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.lineTo(5, 0);
            ctx.stroke();
            ctx.restore();
          } else if (p.type === 'feather') {
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 2);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          } else if (p.type === 'star') {
            ctx.save();
            ctx.globalAlpha = k / p.max;
            ctx.translate(p.x, p.y);
            const s = 18 + (1 - k / p.max) * 14;
            starPath(ctx, 0, 0, 8, s, s * 0.45);
            ctx.fillStyle = '#fff6a8';
            ctx.fill();
            ctx.strokeStyle = '#e09a14';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          } else if (p.type === 'text') {
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 2.5);
            ctx.font = '22px "Lilita One", "Arial Black", sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 5;
            ctx.strokeStyle = OUTLINE;
            ctx.strokeText(p.text, p.x, p.y);
            ctx.fillStyle = '#fff';
            ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
          }
        }
      }
    }

    // ---------- Frame ----------

    function draw(state, view, now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
      lastTime = now;
      updateParticles(dt, state, view.phase === 'racing' || view.phase === 'finished');

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      drawParticles('under');

      const sprites = [];
      for (const b of state.bales) sprites.push({ y: b.y + BALE.h / 2, draw: () => drawBale(ctx, b, state.field[b.lane], view, now) });
      for (const a of state.animals) sprites.push({ y: a.y + a.r, draw: () => drawAnimal(ctx, a, now) });
      sprites.sort((p, q) => p.y - q.y);
      sprites.forEach((s) => s.draw());

      for (const a of state.animals) {
        if (a.startle > 0.4) exclaim(ctx, a.x, a.y - a.r - 18, now);
      }

      drawParticles('over');
      drawFinishBanner(ctx);

      if (view.phase === 'countdown') drawCountdown(ctx, view.countdown);
      if (view.phase === 'racing' && view.goFlash > 0) drawBigText(ctx, 'ROLL!', view.goFlash);
    }

    function reset() {
      particles = [];
      lastShout.clear();
    }

    return { resize, draw, addEvents, reset };
  }

  // ---------- Helpers ----------

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, cx, cy, spikes, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // Outlines are drawn at this fraction of their nominal width: thin and crisp.
  const LINE = 0.6;
  function fillStroke(ctx, fill, lw = 2.5, stroke = OUTLINE) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw * LINE;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // ---------- Background (pre-rendered once per resize) ----------

  function drawBackground(c) {
    const rng = root.FarmRng.mulberry32(20241009);

    // Meadow, sunlit at the hilltop (left) and shadier downhill (right).
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#8fd16a');
    g.addColorStop(1, '#5fae48');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Grass tufts everywhere.
    c.strokeStyle = 'rgba(40, 110, 40, 0.35)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 900; i++) {
      const x = rng() * W;
      const y = rng() * H;
      c.beginPath();
      c.moveTo(x - 3, y + 3);
      c.lineTo(x - 1, y - 2);
      c.moveTo(x + 3, y + 3);
      c.lineTo(x + 1, y - 3);
      c.stroke();
    }

    // Mown lanes with stripes, plus hill contour shading.
    for (let i = 0; i < LANES; i++) {
      const y = TRACK.top + i * LANE_H;
      const lg = c.createLinearGradient(TRACK.startX, 0, W, 0);
      lg.addColorStop(0, i % 2 ? '#9ddc74' : '#93d36b');
      lg.addColorStop(1, i % 2 ? '#6fbd52' : '#67b44b');
      c.fillStyle = lg;
      c.fillRect(TRACK.startX - 60, y, W - TRACK.startX + 60, LANE_H);
    }
    // Contour arcs suggest the slope.
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 6;
    for (let x = TRACK.startX + 60; x < W; x += 110) {
      c.beginPath();
      c.moveTo(x, TRACK.top);
      c.quadraticCurveTo(x + 40, (TRACK.top + TRACK.bottom) / 2, x, TRACK.bottom);
      c.stroke();
    }

    // Chalk lane dividers.
    c.strokeStyle = 'rgba(255,255,255,0.65)';
    c.lineWidth = 3;
    c.setLineDash([16, 12]);
    for (let i = 1; i < LANES; i++) {
      const y = TRACK.top + i * LANE_H;
      c.beginPath();
      c.moveTo(TRACK.startX - 50, y);
      c.lineTo(TRACK.finishX + 120, y);
      c.stroke();
    }
    c.setLineDash([]);

    // Downhill arrows painted on the lanes.
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < LANES; i++) {
      for (let x = TRACK.startX + 260; x < TRACK.finishX - 100; x += 300) {
        const y = laneCenter(i);
        c.beginPath();
        c.moveTo(x, y - 12);
        c.lineTo(x + 18, y);
        c.lineTo(x, y + 12);
        c.lineTo(x + 6, y);
        c.closePath();
        c.fill();
      }
    }

    // Start line + starting stalls.
    c.fillStyle = '#fffdf2';
    c.fillRect(TRACK.startX - 3, TRACK.top, 6, TRACK.bottom - TRACK.top);
    for (let i = 0; i <= LANES; i++) {
      const y = TRACK.top + i * LANE_H;
      roundRect(c, 20, y - 5, TRACK.startX - 40, 10, 4);
      fillStroke(c, '#b9773b', 2);
    }
    c.fillStyle = '#8a6a3d';
    c.fillRect(14, TRACK.top - 8, 14, TRACK.bottom - TRACK.top + 16);
    c.strokeStyle = OUTLINE;
    c.lineWidth = 2;
    c.strokeRect(14, TRACK.top - 8, 14, TRACK.bottom - TRACK.top + 16);

    // Lane numbers painted in each stall.
    for (let i = 0; i < LANES; i++) {
      const y = laneCenter(i);
      circle(c, 58, y, 15);
      fillStroke(c, root.HaySim.LANE_COLORS[i].hex, 3);
      c.fillStyle = '#fff';
      c.font = '18px "Lilita One", "Arial Black", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), 58, y + 1);
    }

    // Finish line — chequered strip.
    const sq = 15;
    for (let y = TRACK.top, row = 0; y < TRACK.bottom; y += sq, row++) {
      for (let col = 0; col < 2; col++) {
        c.fillStyle = (row + col) % 2 ? '#222' : '#fff';
        c.fillRect(TRACK.finishX + col * sq, y, sq, Math.min(sq, TRACK.bottom - y));
      }
    }

    // Run-out: a big soft straw pile catches the bales.
    for (let i = 0; i < 70; i++) {
      const x = TRACK.finishX + 95 + rng() * 45;
      const y = TRACK.top + rng() * (TRACK.bottom - TRACK.top);
      circle(c, x, y, 10 + rng() * 10);
      c.fillStyle = rng() < 0.5 ? '#e8c25a' : '#d8ad45';
      c.fill();
    }
    c.strokeStyle = 'rgba(120, 80, 20, 0.5)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 160; i++) {
      const x = TRACK.finishX + 85 + rng() * 60;
      const y = TRACK.top + rng() * (TRACK.bottom - TRACK.top);
      const a = rng() * Math.PI;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
      c.stroke();
    }

    // Fences along both sides of the course.
    drawFence(c, TRACK.top - 8);
    drawFence(c, TRACK.bottom + 8);

    // Scenery outside the fences.
    drawBarn(c, 30, 8);
    drawPond(c, 1150, 715);
    drawTractor(c, 360, 718);
    drawHayStack(c, 255, 40, rng);
    drawHayStack(c, 940, 722, rng);
    drawTree(c, 520, 42, 44, rng);
    drawTree(c, 1330, 50, 52, rng);
    drawTree(c, 760, 730, 40, rng);
    drawTree(c, 40, 730, 48, rng);
    drawBush(c, 640, 70, rng);
    drawBush(c, 1060, 36, rng);
    drawBush(c, 560, 720, rng);
    drawBush(c, 1365, 700, rng);
    drawSign(c, 860, 52, 'HAY BALE DERBY');

    const flowerColors = ['#ffffff', '#ffe14d', '#ff8fb1', '#b38cff'];
    for (let i = 0; i < 90; i++) {
      const top = rng() < 0.5;
      const x = 160 + rng() * (W - 180);
      const y = top ? 8 + rng() * (TRACK.top - 30) : TRACK.bottom + 22 + rng() * (H - TRACK.bottom - 30);
      drawFlower(c, x, y, flowerColors[Math.floor(rng() * flowerColors.length)]);
    }
  }

  function drawFence(c, y) {
    c.strokeStyle = OUTLINE;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(0, y - 3);
    c.lineTo(W, y - 3);
    c.moveTo(0, y + 3);
    c.lineTo(W, y + 3);
    c.stroke();
    c.strokeStyle = '#c98f52';
    c.lineWidth = 4;
    c.stroke();
    for (let x = 10; x < W; x += 56) {
      roundRect(c, x - 6, y - 8, 12, 16, 3);
      fillStroke(c, '#9b6633', 2);
    }
  }

  function drawBarn(c, x, y) {
    // Top-down barn roof with ridge and a weathervane dot.
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowOffsetX = 6;
    c.shadowOffsetY = 6;
    roundRect(c, x, y, 170, 100, 6);
    fillStroke(c, '#c8382c', 3);
    c.restore();
    c.fillStyle = '#e04a3c';
    c.fillRect(x + 3, y + 3, 164, 46);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      c.beginPath();
      c.moveTo(x + i * 17, y + 2);
      c.lineTo(x + i * 17, y + 98);
      c.stroke();
    }
    c.strokeStyle = '#fff';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(x, y + 50);
    c.lineTo(x + 170, y + 50);
    c.stroke();
    circle(c, x + 85, y + 50, 7);
    fillStroke(c, '#555', 2);
  }

  function drawPond(c, x, y) {
    c.beginPath();
    c.ellipse(x, y, 110, 34, 0, 0, Math.PI * 2);
    fillStroke(c, '#5bb7e6', 3);
    c.beginPath();
    c.ellipse(x - 10, y - 4, 80, 20, 0, 0, Math.PI * 2);
    c.fillStyle = '#7fcdf2';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 2;
    for (const [dx, dy, r] of [[-40, -6, 10], [30, 6, 14], [60, -8, 7]]) {
      c.beginPath();
      c.arc(x + dx, y + dy, r, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    // Lily pads.
    for (const [dx, dy] of [[-70, 8], [75, 4]]) {
      c.beginPath();
      c.arc(x + dx, y + dy, 8, 0.4, Math.PI * 2);
      c.lineTo(x + dx, y + dy);
      fillStroke(c, '#4caf50', 1.5);
    }
  }

  function drawTractor(c, x, y) {
    c.save();
    c.translate(x, y);
    // Wheels
    for (const [wx, wy, w, h] of [[-34, -26, 26, 10], [-34, 16, 26, 10], [14, -22, 16, 7], [14, 15, 16, 7]]) {
      roundRect(c, wx, wy, w, h, 3);
      fillStroke(c, '#2c2c2c', 2);
    }
    roundRect(c, -30, -16, 64, 32, 8);
    fillStroke(c, '#3aa142', 3);
    roundRect(c, -28, -13, 26, 26, 4);
    fillStroke(c, '#2b8132', 2);
    circle(c, 22, -8, 4);
    fillStroke(c, '#444', 1.5);
    c.restore();
  }

  function drawHayStack(c, x, y, rng) {
    for (let i = 0; i < 3; i++) {
      roundRect(c, x + i * 34 - 50, y - 14, 32, 26, 5);
      fillStroke(c, i === 1 ? '#e6bd55' : '#dcb04a', 2);
      c.strokeStyle = 'rgba(120,80,20,0.5)';
      c.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const lx = x + i * 34 - 46 + rng() * 24;
        c.beginPath();
        c.moveTo(lx, y - 10);
        c.lineTo(lx + 3, y + 8);
        c.stroke();
      }
    }
  }

  function drawTree(c, x, y, r, rng) {
    c.beginPath();
    c.ellipse(x + 10, y + 12, r, r * 0.9, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fill();
    circle(c, x, y, r);
    fillStroke(c, '#3f9a3a', 3);
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * r * 0.5;
      circle(c, x + Math.cos(a) * d - r * 0.15, y + Math.sin(a) * d - r * 0.15, r * (0.3 + rng() * 0.2));
      c.fillStyle = 'rgba(120, 200, 90, 0.55)';
      c.fill();
    }
  }

  function drawBush(c, x, y, rng) {
    for (let i = 0; i < 4; i++) {
      circle(c, x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 16, 14 + rng() * 6);
      fillStroke(c, '#4aa845', 2);
    }
    for (let i = 0; i < 4; i++) {
      circle(c, x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 14, 2.5);
      c.fillStyle = '#e8384f';
      c.fill();
    }
  }

  function drawFlower(c, x, y, color) {
    c.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circle(c, x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4);
      c.fill();
    }
    circle(c, x, y, 1.8);
    c.fillStyle = '#f5a623';
    c.fill();
  }

  function drawSign(c, x, y, text) {
    c.save();
    c.font = '22px "Lilita One", "Arial Black", sans-serif';
    const w = c.measureText(text).width + 36;
    c.fillStyle = 'rgba(0,0,0,0.2)';
    roundRect(c, x - w / 2 + 5, y - 20 + 5, w, 40, 8);
    c.fill();
    roundRect(c, x - w / 2, y - 20, w, 40, 8);
    fillStroke(c, '#c98f52', 3);
    c.fillStyle = '#fff6dc';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y + 1);
    c.restore();
  }

  function drawFinishBanner(ctx) {
    const x = TRACK.finishX + 15;
    for (const y of [TRACK.top - 26, TRACK.bottom + 26]) {
      roundRect(ctx, x - 44, y - 13, 88, 26, 6);
      fillStroke(ctx, '#e2412f', 3);
      ctx.fillStyle = '#fff';
      ctx.font = '16px "Lilita One", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH', x, y + 1);
    }
  }

  // ---------- Bales ----------

  function drawBale(ctx, b, f, view, now) {
    const sq = b.squash;
    const w = BALE.w * (1 + sq * 0.14);
    const h = BALE.h * (1 - sq * 0.08);
    const x = b.x;
    const y = b.y;
    const mine = view.myLanes && view.myLanes.has(b.lane);

    // Shadow
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 9, w * 0.58, h * 0.52, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();

    if (mine) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.7 + pulse * 4, h * 0.62 + pulse * 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Cylinder body, shaded across its rolling direction.
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#b5862a');
    g.addColorStop(0.35, '#f5d36e');
    g.addColorStop(0.65, '#e7bd52');
    g.addColorStop(1, '#a87a22');
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 12);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 12);
    ctx.clip();
    // Straw stripes wrap round the cylinder so they visibly roll.
    const rCyl = BALE.w / 2;
    const turns = b.roll / rCyl;
    ctx.strokeStyle = 'rgba(130, 90, 20, 0.45)';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 14; k++) {
      const theta = -turns + (k / 14) * Math.PI * 2;
      if (Math.cos(theta) <= 0.05) continue;
      const px = x + Math.sin(theta) * w / 2;
      ctx.beginPath();
      ctx.moveTo(px, y - h / 2 + 6);
      for (let yy = y - h / 2 + 6; yy <= y + h / 2 - 6; yy += 8) {
        ctx.lineTo(px + ((yy + k) % 3) - 1, yy);
      }
      ctx.stroke();
    }
    // Flat ends of the bale, seen edge-on.
    ctx.fillStyle = 'rgba(140, 95, 25, 0.55)';
    ctx.fillRect(x - w / 2, y - h / 2, w, 6);
    ctx.fillRect(x - w / 2, y + h / 2 - 6, w, 6);
    // Twine in the lane colour.
    for (const ty of [y - h * 0.24, y + h * 0.24]) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, ty);
      ctx.lineTo(x + w / 2, ty);
      ctx.stroke();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.restore();

    roundRect(ctx, x - w / 2, y - h / 2, w, h, 12);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // Number disc.
    circle(ctx, x, y, 11);
    fillStroke(ctx, '#fff', 2.5, f.color);
    ctx.fillStyle = OUTLINE;
    ctx.font = '15px "Lilita One", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(f.number), x, y + 1);

    if (b.place && b.place <= 3) {
      const medal = ['#ffd700', '#d9d9d9', '#d58a4a'][b.place - 1];
      circle(ctx, x + w / 2 + 6, y - h / 2 - 2, 11);
      fillStroke(ctx, medal, 2.5);
      ctx.fillStyle = OUTLINE;
      ctx.font = '13px "Lilita One", "Arial Black", sans-serif';
      ctx.fillText(String(b.place), x + w / 2 + 6, y - h / 2 - 1);
    }
  }

  // ---------- Animals (drawn facing +x in local space) ----------

  function legs(ctx, positions, phase, len, color) {
    ctx.fillStyle = color;
    positions.forEach(([lx, ly], i) => {
      const off = Math.sin(phase + (i % 2 ? Math.PI : 0)) * len;
      ctx.beginPath();
      ctx.ellipse(lx + off, ly, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    });
  }

  function eyes(ctx, x, spread, r = 1.8) {
    ctx.fillStyle = '#111';
    circle(ctx, x, -spread, r);
    ctx.fill();
    circle(ctx, x, spread, r);
    ctx.fill();
  }

  function drawAnimal(ctx, a, now) {
    const moving = a.mode === 'walk';
    const phase = moving ? a.walkPhase : 0;
    const peck = a.mode === 'pause' ? Math.max(0, Math.sin(now / 120 + a.id)) * 3 : 0;

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.beginPath();
    ctx.ellipse(5, 6, a.r * 1.05, a.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
    ctx.rotate(a.heading);
    if (a.startle > 0) ctx.translate(Math.sin(now / 25) * 1.2, 0);

    switch (a.kind) {
      case 'chicken': drawChicken(ctx, phase, peck); break;
      case 'duck': drawDuck(ctx, phase, peck); break;
      case 'sheep': drawSheep(ctx, phase, peck); break;
      case 'pig': drawPig(ctx, phase, peck); break;
      case 'cow': drawCow(ctx, phase, peck, a.id); break;
    }
    ctx.restore();
  }

  function drawChicken(ctx, phase, peck) {
    ctx.strokeStyle = '#f39a1e';
    ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      const off = Math.sin(phase + (s > 0 ? Math.PI : 0)) * 4;
      ctx.beginPath();
      ctx.moveTo(0, s * 4);
      ctx.lineTo(4 + off, s * 6);
      ctx.stroke();
    }
    // Tail feathers
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-15, 0);
    ctx.lineTo(-18, 6);
    ctx.closePath();
    fillStroke(ctx, '#f2efe6', 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 9.5, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ffffff', 2.5);
    // Wings
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-2, s * 7, 7, 3, s * 0.2, 0, Math.PI * 2);
      fillStroke(ctx, '#ece7da', 1.5);
    }
    const hx = 11 + peck;
    circle(ctx, hx, 0, 6);
    fillStroke(ctx, '#ffffff', 2);
    // Comb
    ctx.fillStyle = '#e8302a';
    for (const cx of [hx - 3, hx, hx + 3]) {
      circle(ctx, cx, 0, 2.3);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(hx + 5, -2.5);
    ctx.lineTo(hx + 10, 0);
    ctx.lineTo(hx + 5, 2.5);
    ctx.closePath();
    fillStroke(ctx, '#f7a325', 1.2);
    eyes(ctx, hx + 2, 3.6, 1.4);
  }

  function drawDuck(ctx, phase, peck) {
    legs(ctx, [[2, -5], [2, 5]], phase, 3, '#f39a1e');
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-17, 4);
    ctx.closePath();
    fillStroke(ctx, '#5a4430', 1.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#a5865a', 2.5);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-3, s * 6, 8, 3.5, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#7d6243', 1.2);
      ctx.fillStyle = '#3a6fd8';
      ctx.fillRect(-2, s * 6 - 1, 4, 2);
    }
    // White collar and green head
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(10, 0, 6.5, -1.2, 1.2);
    ctx.stroke();
    const hx = 12 + peck;
    circle(ctx, hx, 0, 6);
    fillStroke(ctx, '#1f8a4c', 2);
    roundRect(ctx, hx + 4, -3.5, 9, 7, 3);
    fillStroke(ctx, '#f7a325', 1.2);
    eyes(ctx, hx + 1, 3.6, 1.4);
  }

  function drawSheep(ctx, phase, peck) {
    legs(ctx, [[-9, -9], [-9, 9], [9, -9], [9, 9]], phase, 3, '#222');
    const puffs = [[-14, 0], [-10, -9], [-10, 9], [0, -12], [0, 12], [10, -9], [10, 9], [12, 0], [0, 0]];
    for (const [px, py] of puffs) {
      circle(ctx, px, py, 8);
      fillStroke(ctx, '#f6f3ea', 2);
    }
    for (const [px, py] of puffs) {
      circle(ctx, px, py, 7);
      ctx.fillStyle = '#f6f3ea';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    circle(ctx, -3, 3, 7);
    ctx.fill();
    const hx = 19 + peck;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hx - 3, s * 7.5, 5, 2.5, s * 0.4, 0, Math.PI * 2);
      fillStroke(ctx, '#2a2a2a', 1.5);
    }
    ctx.beginPath();
    ctx.ellipse(hx, 0, 8, 6, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#2a2a2a', 2);
    circle(ctx, hx - 4, 0, 4);
    ctx.fillStyle = '#f6f3ea';
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, hx + 2, -3, 1.6);
    ctx.fill();
    circle(ctx, hx + 2, 3, 1.6);
    ctx.fill();
  }

  function drawPig(ctx, phase, peck) {
    legs(ctx, [[-10, -10], [-10, 10], [10, -10], [10, 10]], phase, 3, '#e98aa1');
    // Curly tail
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-19, 0);
    ctx.bezierCurveTo(-26, -6, -28, 4, -23, 4);
    ctx.bezierCurveTo(-20, 4, -21, -1, -24, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#f7a8bb', 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-3, -5, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const hx = 14 + peck;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx - 4, s * 6);
      ctx.lineTo(hx - 10, s * 15);
      ctx.lineTo(hx + 2, s * 11);
      ctx.closePath();
      fillStroke(ctx, '#f28fa8', 1.8);
    }
    ctx.beginPath();
    ctx.ellipse(hx + 7, 0, 4.5, 6.5, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ef8aa3', 2);
    ctx.fillStyle = '#9b3c55';
    circle(ctx, hx + 8, -2.3, 1.3);
    ctx.fill();
    circle(ctx, hx + 8, 2.3, 1.3);
    ctx.fill();
    eyes(ctx, hx, 5, 1.7);
  }

  function drawCow(ctx, phase, peck, id) {
    legs(ctx, [[-16, -13], [-16, 13], [14, -13], [14, 13]], phase, 4, '#3a3a3a');
    // Tail with tuft
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.quadraticCurveTo(-36, Math.sin(phase) * 5, -40, 3);
    ctx.stroke();
    circle(ctx, -40, 3, 3);
    ctx.fillStyle = '#333';
    ctx.fill();
    roundRect(ctx, -28, -17, 52, 34, 15);
    fillStroke(ctx, '#ffffff', 2.5);
    // Spots — pattern varies per cow.
    ctx.save();
    roundRect(ctx, -28, -17, 52, 34, 15);
    ctx.clip();
    const rng = root.FarmRng.mulberry32(id * 977);
    ctx.fillStyle = '#2b2b2b';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(-22 + rng() * 42, -14 + rng() * 28, 5 + rng() * 6, 4 + rng() * 5, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const hx = 30 + peck;
    for (const s of [-1, 1]) {
      // Horns and ears
      ctx.beginPath();
      ctx.ellipse(hx - 4, s * 11, 3, 5, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#f1e3c2', 1.5);
      ctx.beginPath();
      ctx.ellipse(hx - 6, s * 14, 6, 3, s * 0.6, 0, Math.PI * 2);
      fillStroke(ctx, '#2b2b2b', 1.5);
    }
    ctx.beginPath();
    ctx.ellipse(hx, 0, 10, 9, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ffffff', 2.2);
    ctx.beginPath();
    ctx.ellipse(hx + 8, 0, 5, 8, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#f6b6c4', 2);
    ctx.fillStyle = '#9b3c55';
    circle(ctx, hx + 9, -3, 1.4);
    ctx.fill();
    circle(ctx, hx + 9, 3, 1.4);
    ctx.fill();
    eyes(ctx, hx - 1, 5, 2);
  }

  function exclaim(ctx, x, y, now) {
    const bob = Math.sin(now / 80) * 2;
    circle(ctx, x, y + bob, 10);
    fillStroke(ctx, '#fff', 2.5);
    ctx.fillStyle = '#e2412f';
    ctx.font = '16px "Lilita One", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + bob + 1);
  }

  function drawBigText(ctx, text, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.font = '120px "Lilita One", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, W / 2, H / 2);
    ctx.restore();
  }

  function drawCountdown(ctx, remaining) {
    const n = Math.ceil(remaining);
    const frac = remaining - Math.floor(remaining);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    const s = 1 + frac * 0.4;
    ctx.scale(s, s);
    ctx.font = '140px "Lilita One", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 16;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(String(n), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  root.HayRender = { createRenderer, drawAnimal };
})(typeof globalThis !== 'undefined' ? globalThis : this);
