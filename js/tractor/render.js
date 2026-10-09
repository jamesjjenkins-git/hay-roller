// Tractor Rally — canvas renderer (single-screen, top-down, Super Off Road style).
(function (root) {
  const { WORLD } = root.TractorTracks;
  const W = WORLD.width;
  const H = WORLD.height;
  const OUTLINE = '#3b2a14';
  const FONT = '"Lilita One", "Arial Black", sans-serif';

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const bg = document.createElement('canvas');
    const skid = document.createElement('canvas');
    let layerScale = 1; // pixels per world unit in the pre-rendered layers
    let mode = 'full'; // 'full' = whole track on one screen; 'chase' = zoomed camera
    let cam = null;
    let track = null;
    let particles = [];
    let lastTime = 0;
    let lastSkid = new Map();

    // In chase view this many world pixels fit top-to-bottom on screen.
    const CHASE_VIEW_H = 300;
    // Keep the off-screen layers under iOS's canvas size limits.
    const MAX_LAYER_W = 3000;

    function resize(cssW, cssH) {
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      if (track) buildLayers();
    }

    function setMode(m) {
      if (m === mode) return;
      mode = m;
      cam = null;
      if (track) buildLayers();
    }

    function setTrack(t) {
      track = t;
      particles = [];
      lastSkid = new Map();
      cam = null;
      buildLayers(true);
    }

    // Layers are drawn once at a resolution sharp enough for the current view.
    function buildLayers(force) {
      const full = Math.min(canvas.width / W, canvas.height / H);
      const want = mode === 'chase' ? canvas.height / CHASE_VIEW_H : full;
      const next = Math.min(Math.max(full, want), MAX_LAYER_W / W);
      const keepSkids = skid.width && Math.abs(next - layerScale) < 1e-6;
      layerScale = next;
      if (keepSkids && !force) return;
      for (const c of [bg, skid]) {
        c.width = Math.round(W * layerScale);
        c.height = Math.round(H * layerScale);
      }
      const b = bg.getContext('2d');
      b.setTransform(layerScale, 0, 0, layerScale, 0, 0);
      drawBackground(b, track);
      buildWallSprites();
      skid.getContext('2d').setTransform(layerScale, 0, 0, layerScale, 0, 0);
      lastSkid = new Map();
    }

    // Wall pieces are pre-drawn once per look (kind, colour, angle) and then
    // drawn every frame in depth order with everything else, so a vehicle
    // passes behind the near wall and in front of the far one.
    const SPR = { w: 44, h: 54, ox: 22, oy: 38 };
    let wallSprites = new Map();
    function wallKey(w) {
      if (w.kind === 'bale') return `b${w.n % 2}:${Math.round((((w.angle % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 48)) % 48}`;
      return w.kind === 'tyre' ? `t${w.n % 2}` : `r${w.n % 3}`;
    }
    function buildWallSprites() {
      wallSprites = new Map();
      for (const w of track.wallItems || []) {
        const key = wallKey(w);
        if (wallSprites.has(key)) continue;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(SPR.w * layerScale);
        cv.height = Math.ceil(SPR.h * layerScale);
        const cc = cv.getContext('2d');
        cc.setTransform(layerScale, 0, 0, layerScale, 0, 0);
        const bucket = w.kind === 'bale' ? (Number(key.split(':')[1]) * Math.PI) / 48 : 0;
        drawWallSolid(cc, { ...w, x: SPR.ox, y: SPR.oy, angle: bucket });
        wallSprites.set(key, cv);
      }
    }

    function clearSkids() {
      const s = skid.getContext('2d');
      s.save();
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, skid.width, skid.height);
      s.restore();
      lastSkid = new Map();
    }

    // ---------- Effects from sim events ----------

    function addEvents(events, sim) {
      for (const e of events) {
        const r = e.id != null ? sim.racers[e.id] : null;
        if (e.type === 'wall') {
          for (let i = 0; i < 6; i++) spark(e.x, e.y, '#ffe27a');
          if (e.power > 90) particles.push(textP(e.x, e.y - 16, 'THUD!', '#fff', 0.7));
          for (let i = 0; i < 4; i++) {
            particles.push({ type: 'straw', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.8, max: 0.8, rot: Math.random() * 6 });
          }
        } else if (e.type === 'bang') {
          particles.push({ type: 'star', x: e.x, y: e.y, life: 0.3, max: 0.3 });
        } else if (e.type === 'land' && r) {
          for (let i = 0; i < 10; i++) dust(r.x, r.y, 1.6, '#c99a5e');
        } else if (e.type === 'pickup') {
          const label = e.kind === 'cash' ? `+${e.value}` : '+NITRO';
          if (r && r.isPlayer) particles.push(textP(e.x, e.y - 14, label, e.kind === 'cash' ? '#ffd23f' : '#ff7a2f', 1.1));
          for (let i = 0; i < 8; i++) spark(e.x, e.y, e.kind === 'cash' ? '#ffd23f' : '#ff7a2f');
        } else if (e.type === 'pop') {
          // Burst like a balloon: confetti and a little "POP!".
          for (let i = 0; i < 12; i++) spark(e.x, e.y, ['#ff5d8f', '#ffd23f', '#5bd1ff', '#7ee07a', '#fff'][i % 5]);
          particles.push({ type: 'star', x: e.x, y: e.y, life: 0.25, max: 0.25 });
          particles.push(textP(e.x, e.y - 14, e.count % 5 === 0 ? `${e.count}!` : 'POP!', '#fff', 0.6));
        } else if (e.type === 'driftKick' && r) {
          // A puff of flame and dust out the back.
          const fx = Math.cos(r.heading);
          const fy = Math.sin(r.heading);
          for (let i = 0; i < 5; i++) {
            particles.push({ type: 'flame', x: r.x - fx * 16, y: r.y - fy * 16, vx: -fx * 120 + (Math.random() - 0.5) * 50, vy: -fy * 120 + (Math.random() - 0.5) * 50, life: 0.3, max: 0.3 });
          }
          for (let i = 0; i < 4; i++) dust(r.x - fx * 12, r.y - fy * 12, 1.2);
        } else if (e.type === 'nitro' && r) {
          particles.push(textP(r.x, r.y - 22, 'NITRO!', '#ff7a2f', 0.8));
        }
      }
    }

    function textP(x, y, text, color, life) {
      return { type: 'text', x, y, vx: 0, vy: -30, life, max: life, text, color };
    }

    function spark(x, y, color) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 120;
      particles.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, color });
    }

    function dust(x, y, size = 1, color = '#d8b27a') {
      particles.push({
        type: 'dust', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
        life: 0.5 + Math.random() * 0.4, max: 0.9, size: (4 + Math.random() * 4) * size, color,
      });
    }

    function emitFromRacers(sim, dt) {
      const s = skid.getContext('2d');
      for (const r of sim.racers) {
        const speed = Math.hypot(r.vx, r.vy);
        const body = r.heading + (r.drift || 0);
        const fx = Math.cos(body);
        const fy = Math.sin(body);
        const lift = (r.elev || 0) * RAISE;
        const rearX = r.x - fx * 10;
        const rearY = r.y - fy * 10 - lift;
        const slip = Math.abs(-r.vx * fy + r.vy * fx);

        if (!r.airborne && speed > 30) {
          const p = r.surface === 'mud' ? 0.6 : r.surface === 'water' ? 0.5 : 0.25 + slip / 200;
          if (Math.random() < p) {
            if (r.surface === 'mud') dust(rearX, rearY, 1, '#6b4a26');
            else if (r.surface === 'water') particles.push({ type: 'drop', x: rearX, y: rearY, vx: (Math.random() - 0.5) * 80 - fx * 40, vy: (Math.random() - 0.5) * 80 - fy * 40, life: 0.5, max: 0.5 });
            else dust(rearX, rearY);
          }
        }
        if ((r.nitroTime > 0 && Math.random() < 0.8) || (r.kickT > 0 && Math.random() < 0.5)) {
          particles.push({ type: 'flame', x: r.x - fx * 18, y: r.y - fy * 18 - lift, vx: -fx * 90 + (Math.random() - 0.5) * 30, vy: -fy * 90 + (Math.random() - 0.5) * 30, life: 0.25, max: 0.25 });
        }
        // Exhaust puffs.
        if (Math.random() < 0.08 + speed / 3000) {
          particles.push({ type: 'smoke', x: r.x + fx * 6 - fy * 5, y: r.y + fy * 6 + fx * 5 - r.z * 0.4 - lift, vx: -fx * 10, vy: -fy * 10 - 8, life: 0.8, max: 0.8 });
        }

        // Tyre marks on the persistent skid layer.
        const marks = [-1, 1].map((side) => ({ x: rearX - fy * 9 * side, y: rearY + fx * 9 * side }));
        const prev = lastSkid.get(r.id);
        if (prev && !r.airborne && speed > 15) {
          let alpha = 0.06;
          let color = '60, 35, 15';
          if (slip > 18) alpha = Math.min(0.35, 0.06 + slip / 300);
          if (r.surface === 'mud') { alpha = 0.3; color = '50, 30, 10'; }
          if (r.surface === 'water') alpha = 0;
          if (alpha > 0) {
            s.strokeStyle = `rgba(${color}, ${alpha})`;
            s.lineWidth = 4;
            s.lineCap = 'round';
            for (let i = 0; i < 2; i++) {
              s.beginPath();
              s.moveTo(prev[i].x, prev[i].y);
              s.lineTo(marks[i].x, marks[i].y);
              s.stroke();
            }
          }
        }
        lastSkid.set(r.id, r.airborne ? null : marks);
      }
    }

    function updateParticles(dt) {
      for (const p of particles) {
        p.life -= dt;
        p.x += p.vx * dt || 0;
        p.y += p.vy * dt || 0;
        if (p.type === 'spark' || p.type === 'straw' || p.type === 'drop') {
          p.vx *= 0.9;
          p.vy *= 0.9;
        }
      }
      particles = particles.filter((p) => p.life > 0);
      if (particles.length > 600) particles.splice(0, particles.length - 600);
    }

    function drawParticles(layer) {
      for (const p of particles) {
        const k = Math.max(0, p.life / p.max);
        if (layer === 'under') {
          if (p.type === 'dust') {
            ctx.globalAlpha = k * 0.55;
            ctx.fillStyle = p.color;
            circle(ctx, p.x, p.y, p.size * (1.5 - k * 0.5));
            ctx.fill();
          } else if (p.type === 'drop') {
            ctx.globalAlpha = k;
            ctx.fillStyle = '#bfe9ff';
            circle(ctx, p.x, p.y, 2.5);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          continue;
        }
        if (p.type === 'smoke') {
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = '#777';
          circle(ctx, p.x, p.y, 3 + (1 - k) * 7);
          ctx.fill();
        } else if (p.type === 'flame') {
          ctx.globalAlpha = k;
          ctx.fillStyle = k > 0.5 ? '#ffe36b' : '#ff7a2f';
          circle(ctx, p.x, p.y, 3 + k * 4);
          ctx.fill();
        } else if (p.type === 'spark') {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          circle(ctx, p.x, p.y, 2.2);
          ctx.fill();
        } else if (p.type === 'straw') {
          ctx.globalAlpha = k;
          ctx.strokeStyle = '#e9c35a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - 4, p.y);
          ctx.lineTo(p.x + 4, p.y + 2);
          ctx.stroke();
        } else if (p.type === 'star') {
          ctx.globalAlpha = k / p.max;
          starPath(ctx, p.x, p.y, 7, 16, 7);
          fillStroke(ctx, '#fff6a8', 2, '#e09a14');
        } else if (p.type === 'text') {
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.font = `20px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = OUTLINE;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Frame ----------

    // The rectangle of the world on screen, and world→canvas pixel scale.
    function viewRect(sim, dt) {
      const cw = canvas.width;
      const ch = canvas.height;
      if (mode === 'full') {
        const k = Math.min(cw / W, ch / H);
        const rw = cw / k;
        const rh = ch / k;
        return { k, rx: (W - rw) / 2, ry: (H - rh) / 2, rw, rh };
      }
      const k = ch / CHASE_VIEW_H;
      const rw = cw / k;
      const rh = ch / k;
      const me = sim.racers[0];
      // Look ahead in the direction of travel, like Micro Machines.
      const tx = me.x + me.vx * 0.45;
      const ty = me.y + me.vy * 0.45;
      if (!cam) cam = { x: tx, y: ty };
      const f = 1 - Math.exp(-dt * 5);
      cam.x += (tx - cam.x) * f;
      cam.y += (ty - cam.y) * f;
      const clampAxis = (c, size, world) => (size >= world ? (world - size) / 2 : Math.max(0, Math.min(world - size, c - size / 2)));
      return { k, rx: clampAxis(cam.x, rw, W), ry: clampAxis(cam.y, rh, H), rw, rh };
    }

    // Copy the visible part of a pre-rendered layer to the canvas.
    function blitLayer(layer, v) {
      const x0 = Math.max(0, v.rx);
      const y0 = Math.max(0, v.ry);
      const x1 = Math.min(W, v.rx + v.rw);
      const y1 = Math.min(H, v.ry + v.rh);
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(
        layer,
        x0 * layerScale, y0 * layerScale, (x1 - x0) * layerScale, (y1 - y0) * layerScale,
        (x0 - v.rx) * v.k, (y0 - v.ry) * v.k, (x1 - x0) * v.k, (y1 - y0) * v.k,
      );
    }

    // Overlays (countdown, banners) use world-sized fonts centred on screen.
    function screenSpace() {
      const s0 = Math.min(canvas.width / W, canvas.height / H);
      ctx.setTransform(s0, 0, 0, s0, (canvas.width - W * s0) / 2, (canvas.height - H * s0) / 2);
    }

    function draw(sim, view, now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
      lastTime = now;
      if (view.running) {
        emitFromRacers(sim, dt);
        updateParticles(dt);
      }

      const v = viewRect(sim, dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#5aa83f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blitLayer(bg, v);
      blitLayer(skid, v);
      ctx.setTransform(v.k, 0, 0, v.k, -v.rx * v.k, -v.ry * v.k);

      drawFlagman(ctx, sim, view, now);
      for (const p of sim.pickups) drawPickup(ctx, p, now);
      drawParticles('under');

      // Everything that stands up, back to front: walls, animals, vehicles.
      for (const r of sim.racers) drawShadow(ctx, r);
      const items = [];
      const x0 = v.rx - 30;
      const x1 = v.rx + v.rw + 30;
      const y0 = v.ry - 30;
      const y1 = v.ry + v.rh + 60;
      for (const w of track.wallItems || []) {
        if (w.x < x0 || w.x > x1 || w.y < y0 || w.y > y1) continue;
        items.push({ y: w.gy, w });
      }
      for (const a of sim.animals || []) items.push({ y: a.y, a });
      for (const r of sim.racers) items.push({ y: r.y + (r.airborne ? 40 : 0), r });
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        if (it.w) ctx.drawImage(wallSprites.get(wallKey(it.w)), it.w.x - SPR.ox, it.w.y - SPR.oy, SPR.w, SPR.h);
        else if (it.a) drawFarmAnimal(ctx, it.a, now);
        else drawTractor(ctx, it.r, now);
      }
      drawParticles('over');

      // Marker over the player for the first moments of the race.
      const me = sim.racers[0];
      if (view.showYou) {
        const bob = Math.sin(now / 150) * 3;
        ctx.save();
        ctx.translate(me.x, me.y - 30 - me.z - (me.elev || 0) * RAISE + bob);
        ctx.beginPath();
        ctx.moveTo(-8, -6);
        ctx.lineTo(8, -6);
        ctx.lineTo(0, 6);
        ctx.closePath();
        fillStroke(ctx, '#ffd23f', 2.5);
        ctx.font = `15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = OUTLINE;
        ctx.strokeText('YOU', 0, -14);
        ctx.fillStyle = '#fff';
        ctx.fillText('YOU', 0, -14);
        ctx.restore();
      }

      if (mode === 'chase') {
        drawRivalArrows(sim, v);
        drawMinimap(sim);
      }

      screenSpace();
      if (view.countdown > 0) drawCountdown(ctx, view.countdown);
      if (view.banner) drawBanner(ctx, view.banner.text, view.banner.t);
    }

    // Arrows on the screen edge pointing at rivals that are out of view.
    function drawRivalArrows(sim, v) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const cw = canvas.width;
      const ch = canvas.height;
      const pad = 26 * (canvas.height / 400);
      const cx = cw / 2;
      const cy = ch / 2;
      for (const r of sim.racers) {
        if (r.isPlayer) continue;
        const sx = (r.x - v.rx) * v.k;
        const sy = (r.y - v.ry) * v.k;
        if (sx > 0 && sx < cw && sy > 0 && sy < ch) continue;
        const dx = sx - cx;
        const dy = sy - cy;
        const t = Math.min((cw / 2 - pad) / Math.abs(dx || 1e-6), (ch / 2 - pad) / Math.abs(dy || 1e-6));
        const ax = cx + dx * t;
        const ay = cy + dy * t;
        const size = 11 * (canvas.height / 400);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.8, -size * 0.8);
        ctx.lineTo(-size * 0.4, 0);
        ctx.lineTo(-size * 0.8, size * 0.8);
        ctx.closePath();
        ctx.fillStyle = r.color;
        ctx.fill();
        ctx.lineWidth = size * 0.25 * LINE;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Small whole-track map, bottom centre, with every tractor as a dot.
    function drawMinimap(sim) {
      const t = sim.track;
      const mw = Math.min(canvas.width * 0.24, canvas.height * 0.5);
      const ms = mw / W;
      const mh = H * ms;
      const x0 = (canvas.width - mw) / 2;
      const y0 = canvas.height - mh - 10 * (canvas.height / 400);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(40, 70, 30, 0.5)';
      roundRect(ctx, x0 - 6, y0 - 6, mw + 12, mh + 12, 10);
      ctx.fill();
      ctx.setTransform(ms, 0, 0, ms, x0, y0);
      trackPath(ctx, t);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#e6c08a';
      ctx.lineWidth = t.width * 0.7;
      ctx.stroke();
      const s0 = t.samples[0];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(s0.x - s0.nx * t.halfWidth, s0.y - s0.ny * t.halfWidth);
      ctx.lineTo(s0.x + s0.nx * t.halfWidth, s0.y + s0.ny * t.halfWidth);
      ctx.stroke();
      for (const r of sim.racers.slice().sort((a, b) => a.isPlayer - b.isPlayer)) {
        circle(ctx, r.x, r.y, r.isPlayer ? 34 : 26);
        ctx.fillStyle = r.color;
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = r.isPlayer ? '#fff' : OUTLINE;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    return { resize, setTrack, setMode, draw, addEvents, clearSkids, get mode() { return mode; } };
  }

  // ---------- Drawing helpers ----------

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

  function trackPath(c, t) {
    c.beginPath();
    t.samples.forEach((s, i) => (i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y)));
    c.closePath();
  }

  function edgePath(c, t, off) {
    c.beginPath();
    t.samples.forEach((s, i) => {
      const x = s.x + s.nx * off;
      const y = s.y + s.ny * off;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
  }

  // ---------- Background ----------

  function drawBackground(c, t) {
    const rng = root.FarmRng.mulberry32(t.id.length * 7919 + t.count);

    c.fillStyle = '#6fbf4f';
    c.fillRect(0, 0, W, H);
    // Mown stripes and tufts.
    for (let x = 0; x < W; x += 80) {
      c.fillStyle = (x / 80) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
      c.fillRect(x, 0, 80, H);
    }
    // Raised and sunken ground (Ironman pack), drawn before anything sits on it.
    const groundAt = t.terrain ? (x, y) => root.TractorTracks.terrainHeight(t.terrain, x, y) : () => 0;
    if (t.terrain) drawTerrain(c, t);
    c.strokeStyle = 'rgba(30, 100, 30, 0.35)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 700; i++) {
      const x = rng() * W;
      const gy = rng() * H;
      const y = gy - groundAt(x, gy) * RAISE; // tufts sit on the raised ground
      c.beginPath();
      c.moveTo(x - 2, y + 3);
      c.lineTo(x, y - 2);
      c.lineTo(x + 2, y + 3);
      c.stroke();
    }

    // Grandstand with crowd along the top edge.
    drawGrandstand(c, rng);

    // Scenery in the infield and margins.
    for (const sc of t.scenery.slice().sort((a, b) => a.y - b.y)) drawSceneryDepth(c, sc, rng, groundAt(sc.x, sc.y));

    // Track: outer berm, then dirt.
    c.lineJoin = 'round';
    c.lineCap = 'round';
    trackPath(c, t);
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = t.width + 34;
    c.save();
    c.translate(4, 6);
    c.stroke();
    c.restore();
    c.strokeStyle = '#8a5a2b';
    c.lineWidth = t.width + 26;
    c.stroke();
    c.strokeStyle = '#c98f52';
    c.lineWidth = t.width;
    c.stroke();
    c.strokeStyle = '#d9a066';
    c.lineWidth = t.width - 16;
    c.stroke();

    // Dirt speckle and worn racing ruts.
    c.save();
    trackPath(c, t);
    c.lineWidth = t.width;
    for (let i = 0; i < 1600; i++) {
      const s = t.samples[Math.floor(rng() * t.count)];
      const off = (rng() - 0.5) * t.width;
      c.fillStyle = rng() < 0.5 ? 'rgba(120,70,30,0.25)' : 'rgba(255,230,180,0.25)';
      c.fillRect(s.x + s.nx * off, s.y + s.ny * off, 2 + rng() * 2, 2 + rng() * 2);
    }
    c.restore();
    for (const off of [-0.22, 0.22]) {
      edgePath(c, t, off * t.width);
      c.strokeStyle = 'rgba(120, 70, 30, 0.12)';
      c.lineWidth = 10;
      c.stroke();
    }

    // Hills: lit on the climb, shaded on the way down, with contour lines.
    if (t.elev && t.elev.some((h) => Math.abs(h) > 0.3)) drawRaisedRoad(c, t, rng);

    // Features.
    for (const f of t.features) drawFeature(c, f, rng, liftAt(t, f.idx));

    // Start/finish chequers.
    const s0 = t.samples[0];
    c.save();
    c.translate(s0.x, s0.y);
    c.rotate(s0.angle);
    const sq = t.width / 8;
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 2; k++) {
        c.fillStyle = (i + k) % 2 ? '#222' : '#fff';
        c.fillRect(-sq + k * sq, -t.width / 2 + i * sq, sq, sq);
      }
    }
    c.restore();

    // Walls: hay bales with tyre stacks along both edges. Items are spaced
    // by distance along the edge itself, so they don't bunch up on the
    // inside of bends; where the edge curves tightly, round oil barrels
    // replace the long bales.
    const walls = [];
    for (const side of [-1, 1]) {
      const off = side * (t.halfWidth + 7);
      const pts = t.samples.map((s) => ({ x: s.x + s.nx * off, y: s.y + s.ny * off, angle: s.angle }));
      let travelled = 0;
      let nextAt = 0;
      let placed = 0;
      for (let i = 0; i < t.count; i++) {
        const p = pts[i];
        const prev = pts[(i - 1 + t.count) % t.count];
        if (i > 0) travelled += Math.hypot(p.x - prev.x, p.y - prev.y);
        if (travelled < nextAt) continue;
        if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
        // On the inside of tight bends the offset edge folds back over the
        // road; don't draw anything where there's driving surface.
        if (onSurface(t, p.x, p.y, t.halfWidth + 3)) continue;
        // Local radius of this edge, from how fast it turns.
        const a0 = pts[(i - 3 + t.count) % t.count];
        const a1 = pts[(i + 3) % t.count];
        let turn = a1.angle - a0.angle;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        const edgeLen = Math.hypot(a1.x - a0.x, a1.y - a0.y);
        const tight = edgeLen / Math.max(0.001, Math.abs(turn)) < BARREL_RADIUS;
        const py = p.y - liftAt(t, i);
        if (placed % 9 === 0) {
          walls.push({ kind: 'tyre', x: p.x, y: py, gy: p.y, n: Math.floor(placed / 9) });
          nextAt = travelled + 20;
        } else if (tight) {
          walls.push({ kind: 'barrel', x: p.x, y: py, gy: p.y, n: placed });
          nextAt = travelled + 18;
        } else {
          walls.push({ kind: 'bale', x: p.x, y: py, gy: p.y, n: placed, angle: p.angle });
          nextAt = travelled + 25;
        }
        placed++;
      }
    }
    // Back to front, so nearer walls overlap the ones behind them.
    // Drawn each frame, depth-sorted with the vehicles (see the renderer).
    t.wallItems = walls;

    // Title sign.
    c.save();
    c.font = `20px ${FONT}`;
    const label = t.name.toUpperCase();
    const w = c.measureText(label).width + 30;
    roundRect(c, W - w - 14, H - 38, w, 30, 8);
    fillStroke(c, '#c98f52', 2.5);
    c.fillStyle = '#fff6dc';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, W - w / 2 - 14, H - 22);
    c.restore();
  }

  // The ground as raised/sunken land: small cells drawn back to front, each a
  // column from the ground up to its height (a grassy bank where it's higher
  // than the cell in front) with a grass top shaded by the slope.
  const TERRAIN_CX = 4; // cell width
  const TERRAIN_CY = 2; // cell height (fine, so slopes read smooth)
  function drawTerrain(c, t) {
    const cw = TERRAIN_CX;
    const ch = TERRAIN_CY;
    const hAt = (x, y) => root.TractorTracks.terrainHeight(t.terrain, x, y);
    // Only where there's any terrain nearby.
    const cols = Math.ceil(W / cw);
    const rows = Math.ceil(H / ch);
    const grid = [];
    let any = false;
    for (let j = 0; j <= rows + 1; j++) {
      const row = [];
      for (let i = 0; i <= cols + 1; i++) {
        const h = hAt(i * cw + cw / 2, j * ch + ch / 2);
        if (Math.abs(h) > 0.4) any = true;
        row.push(h);
      }
      grid.push(row);
    }
    if (!any) return;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const h = grid[j][i];
        // Skip flat ground unless it's next to a dip (it has to cover the
        // near edge of the pit).
        const behind = j > 0 ? grid[j - 1][i] : 0;
        if (Math.abs(h) < 0.4 && behind > -0.4) continue;
        const x = i * cw;
        const y = j * ch;
        const lift = h * RAISE;
        // Grass, lit from above: slopes facing the camera a little darker,
        // slopes facing away a little lighter.
        const dx = ((grid[j][i + 1] || 0) - (grid[j][Math.max(0, i - 1)] || 0)) / (2 * cw);
        const dy = (((grid[j + 1] && grid[j + 1][i]) || 0) - behind) / (2 * ch);
        const light = Math.max(-0.14, Math.min(0.14, -(dx * 0.6 + dy) * 0.9));
        const top = shade('#6fbf4f', light);
        // Bank below (raised ground) or the far wall of a dip.
        if (h > 0) {
          c.fillStyle = shade('#6fbf4f', light - 0.14);
          c.fillRect(x, y - lift, cw + 0.5, ch + lift + 0.5);
        } else if (h < 0) {
          c.fillStyle = '#7a5a32';
          c.fillRect(x, y, cw + 0.5, -lift + ch + 0.5);
        }
        c.fillStyle = top;
        c.fillRect(x, y - lift, cw + 0.5, ch + 0.5);
      }
    }
  }

  // ---------- Depth ----------
  // Things are drawn the Super Off Road way: a darker side stacked up from
  // the ground, with the top face `h` px up the screen, so you see their
  // front and how tall they are.
  function solid(c, x, y, h, side, foot) {
    c.fillStyle = side;
    for (let z = 0; z < h; z += 1) {
      c.save();
      c.translate(x, y - z);
      foot(c);
      c.fill();
      c.restore();
    }
  }

  const WALL_H = { bale: 9, tyre: 13, barrel: 15 };
  const BARREL_COLORS = ['#2f6fd0', '#e2412f', '#2e9a47'];

  function drawWallSolid(c, w) {
    const h = WALL_H[w.kind];
    // Ground shadow.
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.beginPath();
    c.ellipse(w.x + 3, w.y + 3, w.kind === 'bale' ? 13 : 10, 7, w.angle || 0, 0, Math.PI * 2);
    c.fill();
    if (w.kind === 'bale') {
      solid(c, w.x, w.y, h, '#a8842f', (cc) => {
        cc.rotate(w.angle);
        roundRect(cc, -12, -7, 24, 14, 3);
      });
      // Outline down the visible side.
      c.save();
      c.translate(w.x, w.y);
      c.rotate(w.angle);
      roundRect(c, -12, -7, 24, 14, 3);
      c.restore();
      c.strokeStyle = 'rgba(59,42,20,0.5)';
      c.lineWidth = 1;
      c.stroke();
      c.save();
      c.translate(w.x, w.y - h);
      c.rotate(w.angle);
      roundRect(c, -12, -7, 24, 14, 3);
      fillStroke(c, w.n % 2 ? '#e6bd55' : '#dcb04a', 1.8);
      c.strokeStyle = 'rgba(120,80,20,0.6)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-4, -6);
      c.lineTo(-4, 6);
      c.moveTo(4, -6);
      c.lineTo(4, 6);
      c.stroke();
      c.restore();
    } else if (w.kind === 'tyre') {
      // Three tyres stacked: dark rubber with a lighter band between each.
      for (let z = 0; z < h; z += 1) {
        circle(c, w.x, w.y - z, 8);
        c.fillStyle = z % 4 === 3 ? '#4a4a4a' : '#1d1d1d';
        c.fill();
      }
      drawTyreStack(c, w.x, w.y - h, w.n % 2);
    } else {
      const col = BARREL_COLORS[w.n % 3];
      solid(c, w.x, w.y, h, shade(col, -0.22), (cc) => circle(cc, 0, 0, 9));
      // A rib round the middle of the drum.
      c.strokeStyle = shade(col, -0.4);
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(w.x, w.y - h / 2, 9, 3, 0, 0, Math.PI);
      c.stroke();
      drawBarrel(c, w.x, w.y - h, w.n);
    }
  }

  // Scenery heights and footprints (for the sides and ground shadows).
  const SCENERY_SOLID = {
    barn: { h: 24, side: '#8f2a21', foot: (c) => roundRect(c, -60, -40, 120, 80, 5) },
    silo: { h: 40, side: '#8a949c', foot: (c) => circle(c, 0, 0, 30) },
    hay: { h: 16, side: '#b08a30', foot: (c) => roundRect(c, -48, -28, 94, 54, 4) },
    windmill: { h: 30, side: '#a8946a', foot: (c) => circle(c, 0, 0, 24) },
    tree: { h: 18, side: '#6b4423', foot: (c) => circle(c, 0, 0, 7), canopy: true },
  };

  function drawSceneryDepth(c, sc0, rng, ground = 0) {
    const sc = ground ? { ...sc0, y: sc0.y - ground * RAISE } : sc0;
    const d = SCENERY_SOLID[sc.kind];
    if (!d) {
      drawScenery(c, sc, rng);
      return;
    }
    const k = sc.scale || 1;
    const h = d.h * k;
    // Shadow on the ground, then the sides, then the top.
    c.save();
    c.translate(sc.x + 6 * k, sc.y + 6 * k);
    c.scale(k, k);
    if (d.canopy) circle(c, 0, 0, 34);
    else d.foot(c);
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fill();
    c.restore();
    solid(c, sc.x, sc.y, h, d.side, (cc) => {
      cc.scale(k, k);
      d.foot(cc);
    });
    drawScenery(c, { ...sc, y: sc.y - h }, rng, { noShadow: true });
  }

  // Edges that curve tighter than this (px) get oil barrels, not bales.
  const BARREL_RADIUS = 140;

  function drawTyreStack(c, x, y, red) {
    circle(c, x, y, 8);
    fillStroke(c, '#2a2a2a', 2);
    circle(c, x, y, 3.5);
    c.fillStyle = red ? '#e2412f' : '#fff';
    c.fill();
  }

  // Oil drum seen from above: coloured lid, rim and a filler cap.
  function drawBarrel(c, x, y, n) {
    const colors = ['#2f6fd0', '#e2412f', '#2e9a47'];
    const col = colors[n % colors.length];
    circle(c, x, y, 9);
    fillStroke(c, col, 2);
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1.5;
    circle(c, x, y, 6);
    c.stroke();
    circle(c, x + 3, y - 3, 1.8);
    c.fillStyle = '#d9d9d9';
    c.fill();
  }

  function onSurface(t, x, y, within) {
    const lim = within * within;
    for (const s of t.samples) {
      const dx = s.x - x;
      const dy = s.y - y;
      if (dx * dx + dy * dy < lim) return true;
    }
    return false;
  }

  function drawGrandstand(c, rng) {
    const y = 0;
    c.fillStyle = '#9b6633';
    c.fillRect(300, y, 600, 46);
    c.strokeStyle = OUTLINE;
    c.lineWidth = 3 * LINE;
    c.strokeRect(300, y - 3, 600, 49);
    const shirts = ['#e2412f', '#2f7de2', '#f4c20d', '#2fae4a', '#8e44c9', '#fff', '#f07c1b'];
    for (let row = 0; row < 3; row++) {
      for (let x = 310; x < 895; x += 13) {
        const yy = y + 9 + row * 13 + (rng() - 0.5) * 2;
        c.fillStyle = shirts[Math.floor(rng() * shirts.length)];
        circle(c, x + (row % 2) * 6, yy + 4, 6);
        c.fill();
        c.fillStyle = ['#f2c9a0', '#c98e5e', '#8a5a3c'][Math.floor(rng() * 3)];
        circle(c, x + (row % 2) * 6, yy, 3.6);
        c.fill();
      }
    }
  }

  // Screen px a hill lifts the road per px of height (Super Off Road style:
  // higher ground is drawn further up the screen, with an earth bank below).
  const RAISE = 1.4;
  const liftAt = (t, i) => root.TractorTracks.elevationAt(t, i).h * RAISE;

  // Hills: the road is drawn lifted up the screen by its height, with a
  // bank of earth filling the gap down to the ground, then the raised
  // surface on top — lit on the climb, shaded on the way down, with
  // contour lines.
  function drawRaisedRoad(c, t, rng) {
    const n = t.count;
    const lift = t.samples.map((_, i) => liftAt(t, i));
    const outer = t.halfWidth + 13;
    const quad = (i, w, la, lb) => {
      const a = t.samples[i];
      const b = t.samples[(i + 1) % n];
      c.beginPath();
      c.moveTo(a.x + a.nx * w, a.y + a.ny * w - la);
      c.lineTo(b.x + b.nx * w, b.y + b.ny * w - lb);
      c.lineTo(b.x - b.nx * w, b.y - b.ny * w - lb);
      c.lineTo(a.x - a.nx * w, a.y - a.ny * w - la);
      c.closePath();
    };
    const raised = [];
    for (let i = 0; i < n; i++) if (Math.abs(lift[i]) > 0.3 || Math.abs(lift[(i + 1) % n]) > 0.3) raised.push(i);
    // Bank: stack the road's footprint from the ground to the surface — up
    // for raised ground, down into a pit (where the far bank shows above it).
    for (const i of raised) {
      const la = lift[i];
      const lb = lift[(i + 1) % n];
      const lo = Math.min(0, la, lb);
      const hi = Math.max(0, la, lb);
      for (let z = lo; z < hi; z += 1) {
        const k = (z - lo) / Math.max(1, hi - lo);
        const dark = hi <= 0 ? 0.75 : 1;
        c.fillStyle = `rgb(${Math.round((96 + 42 * k) * dark)}, ${Math.round((60 + 30 * k) * dark)}, ${Math.round((28 + 14 * k) * dark)})`;
        const clamp = (l) => (l >= 0 ? Math.min(z, l) : Math.max(z, l));
        quad(i, outer, clamp(la), clamp(lb));
        c.fill();
      }
    }
    // The raised surface: berm, dirt and the worn centre, like the flat road.
    for (const [w, col] of [[outer, '#8a5a2b'], [t.halfWidth, '#c98f52'], [t.halfWidth - 8, '#d9a066']]) {
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 1;
      for (const i of raised) {
        quad(i, w, lift[i], lift[(i + 1) % n]);
        c.fill();
        c.stroke();
      }
    }
    // Light and shade by slope, contour lines and a little dirt speckle.
    for (const i of raised) {
      const { slope, h } = root.TractorTracks.elevationAt(t, i);
      const shade = Math.min(0.45, Math.abs(slope) * 1.3);
      c.fillStyle = slope > 0 ? `rgba(255, 245, 210, ${shade})` : `rgba(70, 40, 10, ${shade})`;
      quad(i, outer, lift[i], lift[(i + 1) % n]);
      c.fill();
      const h1 = root.TractorTracks.elevationAt(t, (i + 1) % n).h;
      if (Math.floor(h / 4) !== Math.floor(h1 / 4)) {
        const a = t.samples[i];
        c.strokeStyle = 'rgba(90, 55, 20, 0.35)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(a.x + a.nx * (t.halfWidth - 2), a.y + a.ny * (t.halfWidth - 2) - lift[i]);
        c.lineTo(a.x - a.nx * (t.halfWidth - 2), a.y - a.ny * (t.halfWidth - 2) - lift[i]);
        c.stroke();
      }
      const a = t.samples[i];
      for (let k = 0; k < 3; k++) {
        const off = (rng() - 0.5) * t.width;
        c.fillStyle = rng() < 0.5 ? 'rgba(120,70,30,0.25)' : 'rgba(255,230,180,0.25)';
        c.fillRect(a.x + a.nx * off, a.y + a.ny * off - lift[i], 2 + rng() * 2, 2 + rng() * 2);
      }
    }
  }

  // Jump ramp: a wooden wedge rising towards its lip, with the lip face and
  // the side facing the camera showing.
  const RAMP_H = 11;
  function drawRamp(c, f, lift) {
    const L = f.len;
    const hw = f.halfWidth - 6;
    const ux = Math.cos(f.angle);
    const uy = Math.sin(f.angle);
    const nx = -uy;
    const ny = ux;
    // Point on the ramp: `a` along (−L/2..L/2), `w` across, `h` up.
    const P = (a, w, h) => [f.x + ux * a + nx * w, f.y + uy * a + ny * w - lift - h * RAISE];
    const poly = (pts, fill) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.lineWidth = 1.5 * LINE;
      c.strokeStyle = OUTLINE;
      c.stroke();
    };
    // Shadow past the lip.
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    [P(L / 2, -hw, 0), P(L / 2 + 16, -hw, 0), P(L / 2 + 16, hw, 0), P(L / 2, hw, 0)].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.fill();
    // Sides (the near one shows), then the lip face, then the top.
    for (const w of [-hw, hw]) poly([P(-L / 2, w, 0), P(L / 2, w, 0), P(L / 2, w, RAMP_H)], '#7a4f25');
    poly([P(L / 2, -hw, 0), P(L / 2, hw, 0), P(L / 2, hw, RAMP_H), P(L / 2, -hw, RAMP_H)], '#8a5a2b');
    poly([P(-L / 2, -hw, 0), P(-L / 2, hw, 0), P(L / 2, hw, RAMP_H), P(L / 2, -hw, RAMP_H)], '#d79e5c');
    // Planks across, and two arrows up the middle.
    c.strokeStyle = 'rgba(80,45,15,0.5)';
    c.lineWidth = 1.5;
    for (let a = -L / 2 + 6; a < L / 2; a += 7) {
      const h = ((a + L / 2) / L) * RAMP_H;
      const [x0, y0] = P(a, -hw + 2, h);
      const [x1, y1] = P(a, hw - 2, h);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    c.fillStyle = '#fff6dc';
    for (const w of [-hw / 2, hw / 2]) {
      const pts = [P(-6, w - 7, RAMP_H * 0.3), P(6, w, RAMP_H * 0.7), P(-6, w + 7, RAMP_H * 0.3)];
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fill();
    }
  }

  function drawFeature(c, f, rng, lift = 0) {
    if (f.type === 'jump') {
      drawRamp(c, f, lift);
      return;
    }
    c.save();
    // Sits on the road surface, which may be up a hill.
    c.translate(f.x, f.y - lift);
    c.rotate(f.angle);
    if (f.type === 'mud') {
      c.beginPath();
      c.ellipse(0, 0, f.len / 2 + 6, f.halfWidth + 4, 0, 0, Math.PI * 2);
      c.fillStyle = '#7a5530';
      c.fill();
      c.beginPath();
      c.ellipse(0, 0, f.len / 2, f.halfWidth, 0, 0, Math.PI * 2);
      fillStroke(c, '#5e3d1d', 2, '#4a2e14');
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.ellipse((rng() - 0.5) * f.len * 0.7, (rng() - 0.5) * f.halfWidth, 6 + rng() * 6, 2 + rng() * 2, 0, 0, Math.PI * 2);
        c.fill();
      }
    } else if (f.type === 'water') {
      c.beginPath();
      c.ellipse(0, 0, f.len / 2, f.halfWidth, 0, 0, Math.PI * 2);
      fillStroke(c, '#4fa9dc', 2.5, '#2b6f9c');
      c.beginPath();
      c.ellipse(-4, -3, f.len / 2 - 10, f.halfWidth - 8, 0, 0, Math.PI * 2);
      c.fillStyle = '#7ccaf0';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc((rng() - 0.5) * f.len * 0.5, (rng() - 0.5) * f.halfWidth, 5 + rng() * 5, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
    } else if (f.type === 'bumps') {
      for (let x = -f.len / 2; x <= f.len / 2; x += 14) {
        const g = c.createLinearGradient(x - 6, 0, x + 6, 0);
        g.addColorStop(0, 'rgba(255,230,180,0.6)');
        g.addColorStop(1, 'rgba(110,60,25,0.45)');
        c.fillStyle = g;
        roundRect(c, x - 6, -f.halfWidth + 4, 12, f.halfWidth * 2 - 8, 6);
        c.fill();
      }
    }
    c.restore();
  }

  function drawScenery(c, sc, rng, opts = {}) {
    const { x, y } = sc;
    const shadows = !opts.noShadow;
    c.save();
    c.translate(x, y);
    if (sc.scale) c.scale(sc.scale, sc.scale);
    if (sc.kind === 'barn') {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      if (shadows) c.fillRect(-60 + 6, -40 + 6, 120, 80);
      roundRect(c, -60, -40, 120, 80, 5);
      fillStroke(c, '#c8382c', 3);
      c.fillStyle = '#e04a3c';
      c.fillRect(-57, -37, 114, 36);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 1.5;
      for (let i = -48; i < 60; i += 12) {
        c.beginPath();
        c.moveTo(i, -38);
        c.lineTo(i, 38);
        c.stroke();
      }
      c.strokeStyle = '#fff';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-60, 0);
      c.lineTo(60, 0);
      c.stroke();
    } else if (sc.kind === 'silo') {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      circle(c, 5, 6, 30);
      if (shadows) c.fill();
      circle(c, 0, 0, 30);
      fillStroke(c, '#b9c2c9', 3);
      circle(c, 0, 0, 18);
      fillStroke(c, '#d6dde2', 2);
      circle(c, 0, 0, 6);
      fillStroke(c, '#8f9aa3', 2);
    } else if (sc.kind === 'pond') {
      c.beginPath();
      c.ellipse(0, 0, 70, 38, 0.2, 0, Math.PI * 2);
      fillStroke(c, '#5bb7e6', 3);
      c.beginPath();
      c.ellipse(-8, -4, 50, 24, 0.2, 0, Math.PI * 2);
      c.fillStyle = '#7fcdf2';
      c.fill();
      // A duck.
      c.translate(20, 6);
      c.beginPath();
      c.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      fillStroke(c, '#fff', 1.5);
      circle(c, 7, -3, 4);
      fillStroke(c, '#1f8a4c', 1.5);
      c.fillStyle = '#f7a325';
      c.fillRect(10, -4, 5, 2.5);
    } else if (sc.kind === 'hay') {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          roundRect(c, -48 + i * 32, -28 + j * 28, 30, 26, 4);
          fillStroke(c, (i + j) % 2 ? '#e6bd55' : '#d9ac45', 2);
        }
      }
    } else if (sc.kind === 'tree') {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      circle(c, 8, 10, 36);
      if (shadows) c.fill();
      circle(c, 0, 0, 36);
      fillStroke(c, '#3f9a3a', 3);
      for (let i = 0; i < 5; i++) {
        circle(c, (rng() - 0.6) * 30, (rng() - 0.6) * 30, 10 + rng() * 6);
        c.fillStyle = 'rgba(120,200,90,0.5)';
        c.fill();
      }
    } else if (sc.kind === 'corn') {
      // A patch of corn in rows.
      roundRect(c, -72, -36, 144, 72, 6);
      fillStroke(c, '#8a6a3d', 2.5);
      for (let row = -28; row <= 28; row += 14) {
        for (let col = -64; col <= 64; col += 11) {
          circle(c, col + (rng() - 0.5) * 3, row + (rng() - 0.5) * 3, 5.5);
          c.fillStyle = rng() < 0.15 ? '#f4c20d' : rng() < 0.5 ? '#5fae3a' : '#4c9a30';
          c.fill();
        }
      }
    } else if (sc.kind === 'windmill') {
      c.fillStyle = 'rgba(0,0,0,0.22)';
      circle(c, 6, 8, 24);
      if (shadows) c.fill();
      circle(c, 0, 0, 24);
      fillStroke(c, '#c9b48a', 3);
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate(0.5 + (i * Math.PI) / 2);
        roundRect(c, 4, -7, 46, 14, 3);
        fillStroke(c, '#fff8e6', 2.5);
        c.strokeStyle = 'rgba(59,42,20,0.4)';
        c.lineWidth = 1;
        for (let k = 14; k < 48; k += 8) {
          c.beginPath();
          c.moveTo(k, -6);
          c.lineTo(k, 6);
          c.stroke();
        }
        c.restore();
      }
      circle(c, 0, 0, 7);
      fillStroke(c, '#8a5a2b', 2);
    } else if (sc.kind === 'sheep') {
      // A small flock grazing.
      for (const [sx, sy, a] of [[-22, -12, 0.4], [14, -18, -2.6], [-6, 14, 1.4], [24, 10, 3.0]]) {
        c.save();
        c.translate(sx, sy);
        c.rotate(a);
        for (const [px, py] of [[-6, 0], [0, -5], [0, 5], [6, 0], [0, 0]]) {
          circle(c, px, py, 6);
          fillStroke(c, '#f6f3ea', 1.5);
        }
        for (const [px, py] of [[-6, 0], [0, -5], [0, 5], [6, 0], [0, 0]]) {
          circle(c, px, py, 5);
          c.fillStyle = '#f6f3ea';
          c.fill();
        }
        c.beginPath();
        c.ellipse(12, 0, 5, 4, 0, 0, Math.PI * 2);
        fillStroke(c, '#2a2a2a', 1.5);
        c.restore();
      }
    } else if (sc.kind === 'pen') {
      roundRect(c, -70, -45, 140, 90, 6);
      c.fillStyle = '#8a6a3d';
      c.fill();
      c.strokeStyle = '#c98f52';
      c.lineWidth = 6;
      c.stroke();
      // Pigs wallowing.
      for (const [px, py, a] of [[-30, -10, 0.3], [20, 15, -2.5], [35, -20, 1.8]]) {
        c.save();
        c.translate(px, py);
        c.rotate(a);
        c.beginPath();
        c.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
        fillStroke(c, '#f7a8bb', 2);
        c.beginPath();
        c.ellipse(14, 0, 3.5, 5, 0, 0, Math.PI * 2);
        fillStroke(c, '#ef8aa3', 1.5);
        c.restore();
      }
    }
    c.restore();
  }

  function drawPickup(ctx, p, now) {
    const bob = Math.sin(now / 200 + p.id) * 3;
    ctx.save();
    ctx.translate(p.x, p.y - (p.elev || 0) * RAISE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(3, 6, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, -6 + bob);
    if (p.type === 'cash') {
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.quadraticCurveTo(-14, -4, -4, -8);
      ctx.lineTo(4, -8);
      ctx.quadraticCurveTo(14, -4, 10, 8);
      ctx.closePath();
      fillStroke(ctx, '#d9b77a', 2);
      ctx.fillStyle = '#7a5a2a';
      ctx.fillRect(-5, -11, 10, 4);
      ctx.fillStyle = '#2e8b3a';
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    } else {
      roundRect(ctx, -6, -11, 12, 20, 4);
      fillStroke(ctx, '#e2412f', 2);
      ctx.fillStyle = '#fff';
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 0, 0);
      ctx.fillStyle = '#555';
      ctx.fillRect(-3, -14, 6, 4);
    }
    ctx.restore();
  }

  // Escaped animals reuse the Hay Bale Derby artwork, a bit smaller.
  const ANIMAL_SCALE = 0.47;
  const ANIMAL_SIDE = { pig: '#c97a8d', sheep: '#bdb6a2', cow: '#8f8f8f' };
  function drawFarmAnimal(ctx, a, now) {
    const art = root.HayRender && root.HayRender.drawAnimal;
    if (!art) return;
    ctx.save();
    ctx.translate(a.x, a.y - (a.elev || 0) * RAISE);
    if (a.z > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(a.z * 0.3, a.z * 0.5, a.r, a.r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, -a.z);
    }
    // Depth: the animal's body seen side-on below its back, legs to the ground.
    const AH = 5;
    ctx.fillStyle = ANIMAL_SIDE[a.kind] || '#999';
    for (let z = 0; z < AH; z += 1) {
      ctx.beginPath();
      ctx.ellipse(0, -z, a.r * 1.05, a.r * 0.78, a.heading, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(0, -AH);
    ctx.scale(ANIMAL_SCALE, ANIMAL_SCALE);
    art(ctx, { ...a, mode: a.mode === 'flee' ? 'walk' : a.mode, x: 0, y: 0, r: a.r / ANIMAL_SCALE, id: a.id + 1 }, now);
    if (a.startle > 0 && a.mode !== 'tumble') {
      // Little dizzy stars after being knocked flying.
      for (let i = 0; i < 3; i++) {
        const t = now / 300 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffd23f';
        ctx.font = `14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('★', Math.cos(t) * 18, -26 + Math.sin(t) * 6);
      }
    }
    ctx.restore();
  }

  function drawShadow(ctx, r) {
    const s = 1 + r.z / 120 + (r.elev || 0) / 160;
    ctx.save();
    ctx.translate(r.x + 4 + r.z * 0.35, r.y + 5 + r.z * 0.6 - (r.elev || 0) * RAISE);
    ctx.rotate(r.heading + (r.drift || 0));
    ctx.globalAlpha = Math.max(0.12, 0.3 - r.z / 300);
    const [sw, sh] = r.vehicle === 'motorbike' ? [34, 12] : r.vehicle === 'quad' ? [32, 24] : [36, 26];
    roundRect(ctx, (-sw / 2) * s, (-sh / 2) * s, sw * s, sh * s, Math.min(8, sh / 2));
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  }

  // Height of each vehicle's sides, and what they look like (facing +x).
  const VEHICLE_DEPTH = {
    tractor: {
      h: 7,
      sides(ctx, r) {
        ctx.fillStyle = '#141414';
        for (const side of [-1, 1]) {
          roundRect(ctx, -17, side * 11.5 - 4.5, 16, 9, 3);
          ctx.fill();
          roundRect(ctx, 6.5, side * 9 - 3, 9, 6, 2);
          ctx.fill();
        }
        ctx.fillStyle = shade(r.color, -0.32);
        roundRect(ctx, -17, -8, 35, 16, 4);
        ctx.fill();
      },
    },
    quad: {
      h: 5,
      sides(ctx, r) {
        ctx.fillStyle = '#141414';
        for (const [x, y] of [[-9, -10], [-9, 10], [11, -9.5], [11, 9.5]]) {
          roundRect(ctx, x - 5, y - 3, 10, 6, 2.4);
          ctx.fill();
        }
        ctx.fillStyle = shade(r.color, -0.32);
        roundRect(ctx, -12, -8, 26, 16, 6);
        ctx.fill();
      },
    },
    motorbike: {
      h: 5,
      sides(ctx, r) {
        ctx.fillStyle = '#141414';
        roundRect(ctx, -19.5, -2.5, 13, 5, 2);
        ctx.fill();
        roundRect(ctx, 8, -2.2, 12, 4.5, 2);
        ctx.fill();
        ctx.fillStyle = shade(r.color, -0.32);
        roundRect(ctx, -8, -4.5, 20, 9, 4);
        ctx.fill();
      },
    },
  };

  // Tractor drawn facing +x: big rear wheels at the back, small steerable fronts.
  function drawTractor(ctx, r, now) {
    // Higher up (in the air, or on a hill) = a little bigger, closer to camera.
    const s = 1 + r.z / 120 + (r.elev || 0) / 160;
    const shake = r.bump > 0 ? Math.sin(now / 18 + r.id) * r.bump * 1.5 : 0;
    const body = r.heading + (r.drift || 0);
    const baseY = r.y - r.z * 0.4 - (r.elev || 0) * RAISE + shake;
    // Depth: the vehicle's sides (tyres and a darker body), stacked up from
    // the ground, then the top-down art on top.
    const depth = VEHICLE_DEPTH[r.vehicle] || VEHICLE_DEPTH.tractor;
    for (let z = 0; z < depth.h; z += 1) {
      ctx.save();
      ctx.translate(r.x, baseY - z * s);
      ctx.rotate(body);
      ctx.scale(s, s);
      depth.sides(ctx, r);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(r.x, baseY - depth.h * s);
    ctx.rotate(body);
    ctx.scale(s, s);
    if (r.vehicle === 'quad' || r.vehicle === 'motorbike') {
      (r.vehicle === 'quad' ? drawQuadBody : drawBikeBody)(ctx, r);
      ctx.restore();
      return;
    }

    // Rear wheels with tread.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(-9, side * 11.5);
      roundRect(ctx, -8, -4.5, 16, 9, 3);
      fillStroke(ctx, '#262626', 2);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      const spin = ((r.progress || 0) / 3) % 4;
      for (let i = -8 + spin; i < 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, -4);
        ctx.lineTo(i + 1.5, 4);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Front wheels turn with steering.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(11, side * 9);
      ctx.rotate(r.steer * 0.45);
      roundRect(ctx, -4.5, -3, 9, 6, 2);
      fillStroke(ctx, '#262626', 1.8);
      ctx.restore();
    }
    // Front axle and hood.
    ctx.fillStyle = '#444';
    ctx.fillRect(10, -8, 2.5, 16);
    roundRect(ctx, -4, -6, 22, 12, 4);
    fillStroke(ctx, r.color, 2.2);
    ctx.fillStyle = shade(r.color, 0.18);
    ctx.fillRect(0, -3, 15, 3);
    // Grille
    ctx.fillStyle = '#ddd';
    ctx.fillRect(16, -4, 2.5, 8);
    // Cab with roof.
    roundRect(ctx, -17, -9, 15, 18, 3);
    fillStroke(ctx, shade(r.color, -0.12), 2.2);
    roundRect(ctx, -15.5, -7.5, 12, 15, 2);
    ctx.fillStyle = '#fff8e6';
    ctx.fill();
    // Exhaust stack
    circle(ctx, 4, -4, 2.4);
    fillStroke(ctx, '#555', 1.5);
    // Driver hat peeking (roof stripe)
    ctx.fillStyle = r.isPlayer ? '#ffd23f' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(-14, -2, 9, 4);
    ctx.restore();
  }

  function tyre(ctx, x, y, w, h, angle, r) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) / 2.5);
    fillStroke(ctx, '#262626', 1.8);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    const spin = ((r.progress || 0) / 2.5) % 3;
    for (let i = -w / 2 + spin; i < w / 2; i += 3) {
      ctx.beginPath();
      ctx.moveTo(i, -h / 2 + 1);
      ctx.lineTo(i, h / 2 - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function rider(ctx, r, x, lean) {
    // Shoulders and arms reaching to the bars, then a helmet with a visor.
    ctx.save();
    ctx.translate(x, lean);
    ctx.beginPath();
    ctx.ellipse(-1, 0, 5, 7.5, 0, 0, Math.PI * 2);
    fillStroke(ctx, r.isPlayer ? '#2f6fd0' : '#4a4a4a', 1.8);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(1, -5);
    ctx.lineTo(9, -6.5 - lean * 0.3);
    ctx.moveTo(1, 5);
    ctx.lineTo(9, 6.5 - lean * 0.3);
    ctx.stroke();
    circle(ctx, 0, 0, 5);
    fillStroke(ctx, r.isPlayer ? '#ffd23f' : r.color, 2);
    ctx.fillStyle = '#263238';
    ctx.fillRect(2.2, -3.2, 2.6, 6.4);
    ctx.restore();
  }

  // Quad bike, facing +x: four fat tyres, a chunky body and racks.
  function drawQuadBody(ctx, r) {
    tyre(ctx, -9, -10, 10, 6, 0, r);
    tyre(ctx, -9, 10, 10, 6, 0, r);
    tyre(ctx, 11, -9.5, 9, 5.5, r.steer * 0.45, r);
    tyre(ctx, 11, 9.5, 9, 5.5, r.steer * 0.45, r);
    // Rear rack, body and front rack.
    roundRect(ctx, -17, -7, 7, 14, 2);
    fillStroke(ctx, '#555', 1.6);
    roundRect(ctx, -12, -8, 26, 16, 6);
    fillStroke(ctx, r.color, 2.2);
    ctx.fillStyle = shade(r.color, 0.18);
    ctx.fillRect(4, -5, 8, 3);
    roundRect(ctx, 13, -6, 5, 12, 2);
    fillStroke(ctx, '#555', 1.6);
    // Seat.
    roundRect(ctx, -9, -4, 10, 8, 3);
    fillStroke(ctx, '#2b2b2b', 1.5);
    // Handlebars turn with the steering.
    ctx.save();
    ctx.translate(8, 0);
    ctx.rotate(r.steer * 0.3);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
    rider(ctx, r, -3, r.steer * 1.5);
  }

  // Motorbike, facing +x: two wheels in line, a slim body, and a rider who
  // leans into the turn.
  function drawBikeBody(ctx, r) {
    const lean = r.steer * 4 + (r.drift || 0) * 3;
    tyre(ctx, -13, 0, 13, 5, 0, r);
    tyre(ctx, 14, 0, 12, 4.5, r.steer * 0.35, r);
    // Swingarm, exhaust and frame.
    ctx.fillStyle = '#555';
    ctx.fillRect(-13, -1.2, 10, 2.4);
    roundRect(ctx, -16, 3, 12, 3, 1.5);
    fillStroke(ctx, '#c9c9c9', 1.2);
    roundRect(ctx, -8, -4.5, 20, 9, 4);
    fillStroke(ctx, r.color, 2);
    // Tank stripe and number plate.
    ctx.fillStyle = shade(r.color, 0.2);
    ctx.fillRect(2, -2.5, 7, 5);
    roundRect(ctx, 9, -3.5, 5, 7, 2);
    fillStroke(ctx, '#fff', 1.4);
    // Bars.
    ctx.save();
    ctx.translate(10, 0);
    ctx.rotate(r.steer * 0.35);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
    rider(ctx, r, -2, lean);
  }

  function drawFlagman(ctx, sim, view, now) {
    const t = sim.track;
    const s0 = t.samples[0];
    const off = t.halfWidth + 30;
    const x = s0.x - s0.nx * off;
    const y = s0.y - s0.ny * off;
    ctx.save();
    ctx.translate(x, y);
    circle(ctx, 0, 0, 9);
    fillStroke(ctx, '#2f7de2', 2);
    circle(ctx, 0, 0, 5);
    fillStroke(ctx, '#f2c9a0', 1.5);
    const wave = Math.sin(now / 120) * 0.6;
    let color = '#2fae4a';
    if (view.countdown > 0) color = view.countdown > 1 ? '#e2412f' : '#f4c20d';
    if (view.finalLap) color = '#fff';
    if (view.chequered) color = 'chequer';
    ctx.rotate(-0.6 + (view.countdown > 0 ? 0 : wave));
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    if (color === 'chequer') {
      for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
        ctx.fillStyle = (i + k) % 2 ? '#222' : '#fff';
        ctx.fillRect(14 + i * 4, 1 + k * 4, 4, 4);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(14, 1, 12, 8);
    }
    ctx.strokeRect(14, 1, 12, 8);
    ctx.restore();
  }

  function drawCountdown(ctx, remaining) {
    const n = Math.ceil(remaining);
    const frac = remaining - Math.floor(remaining);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const sc = 1 + frac * 0.4;
    ctx.scale(sc, sc);
    ctx.font = `130px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 16;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(String(n), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  function drawBanner(ctx, text, t) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = `86px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, W / 2, H / 2);
    ctx.restore();
  }

  root.TractorRender = { createRenderer, drawTractor, shade };
})(typeof globalThis !== 'undefined' ? globalThis : this);
