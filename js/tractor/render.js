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
      buildSignSprite();
      buildDeckSprites();
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

    // Bridge decks, pre-drawn once and drawn each frame in depth order.
    function buildDeckSprites() {
      for (const dk of track.decks || []) {
        const { x, y, w, h } = dk.box;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(w * layerScale);
        cv.height = Math.ceil(h * layerScale);
        const cc = cv.getContext('2d');
        cc.setTransform(layerScale, 0, 0, layerScale, -x * layerScale, -y * layerScale);
        drawDeckSupports(cc, track, dk);
        // The deck's surface runs one step onto the ramp at each end, over
        // the ramp in the background, so there's no seam where they meet.
        const n = track.count;
        const slabIdx = dk.idx.filter(dk.slab);
        const lap = new Set();
        for (const i of slabIdx) {
          for (const j of [(i - 1 + n) % n, (i + 1) % n]) if (!dk.slab(j) && liftAt(track, j) > BRIDGE_SLAB) lap.add(j);
        }
        drawRaisedRoad(cc, track, root.FarmRng.mulberry32(dk.idx[0] + 1), { only: [...slabIdx, ...lap], slab: dk.slab, noBank: lap });
        dk.sprite = cv;
      }
    }

    // The track's name board, drawn over everything in its corner.
    let signSprite = null;
    function buildSignSprite() {
      const sg = track.sign;
      signSprite = document.createElement('canvas');
      const k = sg.k || 1;
      signSprite.width = Math.ceil((sg.w + 20) * k * layerScale);
      signSprite.height = Math.ceil((SIGN.h + SIGN.post + 12) * k * layerScale);
      const sc = signSprite.getContext('2d');
      sc.setTransform(layerScale * k, 0, 0, layerScale * k, 0, 0);
      drawSign(sc, { ...sg, x: 2, y: 2 });
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
          const lift = (r.elev || 0) * RAISE;
          const n0 = particles.length;
          for (let i = 0; i < 5; i++) {
            particles.push({ type: 'flame', x: r.x - fx * 16, y: r.y - fy * 16 - lift, vx: -fx * 120 + (Math.random() - 0.5) * 50, vy: -fy * 120 + (Math.random() - 0.5) * 50, life: 0.3, max: 0.3 });
          }
          for (let i = 0; i < 4; i++) dust(r.x - fx * 12, r.y - fy * 12 - lift, 1.2);
          tagLevel(n0, r);
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

    // Which level of a bridge a racer's particles belong to: up on deck `k`
    // ('k:up'), on the road under or beside it ('k:down'), or neither (null).
    // Those are drawn with the deck, so dust and flames from below never
    // show over it.
    function levelOf(r) {
      for (const dk of track.decks || []) {
        const b = dk.box;
        const high = (r.elev || 0) * RAISE > BRIDGE_SLAB + 4 && r.x > b.x && r.x < b.x + b.w && r.y > b.y && r.y < b.y + b.h;
        if (dk.set.has(r.idx) || high) return `${dk.k}:up`;
        // Under it or behind it (in front of the deck, the normal order is right).
        if (r.x > b.x - 20 && r.x < b.x + b.w + 20 && r.y > b.y - 20 && r.y < dk.key + 10) return `${dk.k}:down`;
      }
      return null;
    }
    function tagLevel(from, r) {
      const lvl = levelOf(r);
      if (lvl) for (let i = from; i < particles.length; i++) particles[i].lvl = lvl;
    }

    function emitFromRacers(sim, dt) {
      const s = skid.getContext('2d');
      for (const r of sim.racers) {
        const n0 = particles.length;
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
        tagLevel(n0, r);

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

    function drawParticles(layer, lvl = null) {
      for (const p of particles) {
        if ((p.lvl || null) !== lvl) continue;
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

      drawParticles('under');
      for (const dk of track.decks || []) drawParticles('under', `${dk.k}:down`);

      // Everything that stands up, back to front: walls, animals, vehicles.
      // Up on a bridge, things are drawn after its deck (shadows too).
      // Up on a deck, or on a ramp right beside it at well above the road
      // below (else the deck's end is drawn over a vehicle just short of it).
      const deckAbove = (i, x, y, lift) => deckOf(track, i) || (track.decks || []).find((dk) => {
        const b = dk.box;
        return lift > BRIDGE_SLAB + 4 && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
      });
      const upOn = (it, i, x, y, lift = 0) => {
        const dk = deckAbove(i, x, y, lift);
        if (dk) {
          it.up = true;
          it.y = Math.max(it.y, dk.key) + 0.001 * (it.y / H);
        }
        return it;
      };
      for (const r of sim.racers) if (!deckAbove(r.idx, r.x, r.y, (r.elev || 0) * RAISE)) drawShadow(ctx, r);
      const items = [];
      for (const dk of track.decks || []) items.push({ y: dk.key, dk });
      const x0 = v.rx - 30;
      const x1 = v.rx + v.rw + 30;
      const y0 = v.ry - 30;
      const y1 = v.ry + v.rh + 60;
      // Where the road runs up or down the screen, a wall piece beside a
      // vehicle (rather than ahead of or behind it) is drawn before it, so
      // the vehicle rubs along the wall instead of alternately going over
      // and under the pieces it passes.
      const besideKey = (w) => {
        let key = w.gy;
        const s = w.si != null ? track.samples[w.si] : null;
        if (!s || Math.abs(s.ny) > 0.6) return key;
        const wl = w.gy - w.y;
        const wdk = deckOf(track, w.si);
        for (const r of sim.racers) {
          // Only vehicles on the same level as the wall: not one up on a
          // bridge beside a wall of the road below, or the other way round.
          if (deckOf(track, r.idx) !== wdk || Math.abs((r.elev || 0) * RAISE - wl) > 8) continue;
          const dx = w.x - r.x;
          const dy = w.gy - r.y;
          const along = dx * s.tx + dy * s.ty;
          const across = dx * s.nx + dy * s.ny;
          if (Math.abs(along) < 40 && Math.abs(across) < 36 && Math.abs(dx) > Math.abs(dy) * 0.7) key = Math.min(key, r.y - 0.5);
        }
        return key;
      };
      for (const w of track.wallItems || []) {
        if (w.x < x0 || w.x > x1 || w.y < y0 || w.y > y1) continue;
        items.push(upOn({ y: besideKey(w), w }, w.si, w.x, w.gy, w.gy - w.y));
      }
      for (const a of sim.animals || []) items.push(upOn({ y: a.y, a }, a.idx, a.x, a.y, (a.elev || 0) * RAISE));
      for (const p of sim.pickups) items.push(upOn({ y: p.y, p }, p.idx, p.x, p.y, (p.elev || 0) * RAISE));
      // Ramps sort a little behind their centre so anything on them is drawn on top.
      for (const f of track.features) if (f.type === 'jump') items.push({ y: f.y - 24, f });
      for (const r of sim.racers) items.push(upOn({ y: r.y + (r.airborne ? 40 : 0), r }, r.idx, r.x, r.y, (r.elev || 0) * RAISE));
      items.push({ y: flagmanSpot(track).y, flag: true });
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        if (it.w) ctx.drawImage(wallSprites.get(wallKey(it.w)), it.w.x - SPR.ox, it.w.y - SPR.oy, SPR.w, SPR.h);
        else if (it.a) drawFarmAnimal(ctx, it.a, now);
        else if (it.p) drawPickup(ctx, it.p, now);
        else if (it.f) drawRamp(ctx, track, it.f);
        else if (it.flag) drawFlagman(ctx, sim, view, now);
        else if (it.dk) {
          drawParticles('over', `${it.dk.k}:down`);
          ctx.drawImage(it.dk.sprite, it.dk.box.x, it.dk.box.y, it.dk.sprite.width / layerScale, it.dk.sprite.height / layerScale);
          drawParticles('under', `${it.dk.k}:up`);
        }
        else {
          if (it.up) drawShadow(ctx, it.r);
          drawTractor(ctx, it.r, now);
        }
      }
      drawParticles('over');
      for (const dk of track.decks || []) drawParticles('over', `${dk.k}:up`);
      const sg = track.sign;
      ctx.drawImage(signSprite, sg.x - 2 * (sg.k || 1), sg.y - 2 * (sg.k || 1), signSprite.width / layerScale, signSprite.height / layerScale);

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

  // Between two colours (`k` 0..1), then lightened or darkened like shade().
  function mixHex(a, b, k, amt = 0) {
    const A = parseInt(a.slice(1), 16);
    const B = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.max(0, Math.min(255, Math.round(((A >> sh) & 255) * (1 - k) + ((B >> sh) & 255) * k + amt * 255)));
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
  }

  const MOWN_W = 80;
  function mownStripe(x, k = 1) {
    return Math.floor(x / MOWN_W) % 2 ? `rgba(255,255,255,${0.05 * k})` : `rgba(0,0,0,${0.03 * k})`;
  }

  // The road's cross-section as bands (extra width over the road, colour),
  // drawn widest first: berm foot, berm top, the ridge at the road's edge,
  // then dirt getting lighter towards the worn middle.
  const TRACK_BANDS = [
    [26, '#7a4f25'],
    [20, '#8f5d2e'],
    [5, '#a8743e'],
    [0, '#c4884b'],
    [-5, '#cc9455'],
    [-10, '#d39b5d'],
    [-16, '#d9a066'],
  ];

  function drawBackground(c, t) {
    const rng = root.FarmRng.mulberry32(t.id.length * 7919 + t.count);

    c.fillStyle = '#6fbf4f';
    c.fillRect(0, 0, W, H);
    // Mown stripes, then raised and sunken ground (Ironman pack) drawn
    // before anything sits on it; it carries the stripes on over raised
    // grass, and lets them fade out down into a dip.
    for (let x = 0; x < W; x += 80) {
      c.fillStyle = mownStripe(x);
      c.fillRect(x, 0, 80, H);
    }
    const groundAt = t.terrain ? (x, y) => root.TractorTracks.terrainHeight(t.terrain, x, y) : () => 0;
    if (t.terrain) drawTerrain(c, t);
    // Tufts.
    c.strokeStyle = 'rgba(30, 100, 30, 0.35)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 700; i++) {
      const x = rng() * W;
      const gy = rng() * H;
      if (groundAt(x, gy) < -1.5) continue; // none on the bare earth of a dip
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
    // Grass trodden down along the outside of the berm.
    c.strokeStyle = 'rgba(95,80,30,0.13)';
    c.lineWidth = t.width + 50;
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = t.width + 34;
    c.save();
    c.translate(4, 6);
    c.stroke();
    c.restore();
    // Berm: a dark foot, its rounded top, and a lighter ridge at the road's
    // edge; then the dirt, worn darker towards the edges in soft steps.
    for (const [w, col] of TRACK_BANDS) {
      c.strokeStyle = col;
      c.lineWidth = t.width + w;
      c.stroke();
    }

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
    t.decks = bridgeDecks(t);
    // Only the timber deck itself is drawn each frame; the earth ramps up to
    // it stay in the background, so a vehicle on a ramp beside the deck is
    // never painted over by it (and there's no seam where they meet).
    const onDeck = new Set();
    for (const dk of t.decks) dk.idx.forEach((i) => dk.slab(i) && onDeck.add(i));
    for (const dk of t.decks) drawDeckShadow(c, t, dk);
    if (t.elev && t.elev.some((h) => Math.abs(h) > 0.3)) drawRaisedRoad(c, t, rng, { skip: onDeck });

    // Features.
    // Mud, water and rumble strips are trimmed to the road (lifted up any
    // hill), so they never spill over the berm and under the walls.
    const patches = document.createElement('canvas');
    patches.width = c.canvas.width;
    patches.height = c.canvas.height;
    const pc = patches.getContext('2d');
    pc.setTransform(c.getTransform());
    for (const f of t.features) if (f.type !== 'jump') drawFeature(pc, f, rng, liftAt(t, f.idx), t);
    pc.globalCompositeOperation = 'destination-in';
    pc.lineJoin = 'round';
    pc.lineCap = 'round';
    pc.lineWidth = t.width + 4;
    pc.strokeStyle = '#000';
    pc.beginPath();
    t.samples.forEach((sm, i) => (i ? pc.lineTo(sm.x, sm.y - liftAt(t, i)) : pc.moveTo(sm.x, sm.y - liftAt(t, i))));
    pc.closePath();
    pc.stroke();
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(patches, 0, 0);
    c.restore();
    patches.width = patches.height = 0; // free it (iOS limits canvas memory)
    for (const f of t.features) if (f.type === 'jump') drawFeature(c, f, rng, liftAt(t, f.idx), t);

    // Start/finish chequers, on the road surface (which may be up a hill).
    const s0 = t.samples[0];
    c.save();
    c.translate(s0.x, s0.y - liftAt(t, 0));
    c.rotate(s0.angle);
    const sq = t.width / 8;
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 2; k++) {
        c.fillStyle = (i + k) % 2 ? '#222' : '#fff';
        c.fillRect(-sq + k * sq, -t.width / 2 + i * sq, sq, sq);
      }
    }
    c.restore();

    t.wallItems = placeWalls(t);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (const w of t.wallItems) drawWallShadow(c, w);


    // Title sign: placed in a corner clear of the road, drawn over
    // everything each frame (see the renderer).
    c.save();
    c.font = `20px ${FONT}`;
    t.sign = placeSign(t, c.measureText(t.name.toUpperCase()).width + 30);
    c.restore();
  }

  // Track name board on two posts. `x`, `y` are the board's top left; the
  // posts stand `SIGN.post` below it.
  const SIGN = { h: 30, post: 7, pad: 8 };
  // World px kept clear of the sign for the race HUD (top) and the touch
  // controls (bottom corners).
  const UI_KEEP_OUT = { top: 70, bottom: 190, left: 250 };
  function placeSignAt(t, w0, k, overScenery) {
    const w = w0 * k;
    const h = (SIGN.h + SIGN.post) * k;
    // Along the bottom edge between the controls, then down either side
    // below the HUD. The corners are under the HUD and the touch controls
    // on a phone, and the top middle is the grandstand.
    const corners = [];
    for (let x = Math.round((W - w) / 2); x >= UI_KEEP_OUT.left; x -= 40) {
      corners.push([x, H - h - 6], [W - w - x, H - h - 6]);
    }
    for (let y = UI_KEEP_OUT.top; y <= H - UI_KEEP_OUT.bottom - h; y += 30) corners.push([14, y], [W - w - 14, y]);
    // Failing those, anywhere on open grass in the field, lowest first.
    for (let y = H - h - 40; y >= UI_KEEP_OUT.top + 20; y -= 20) {
      for (let x = UI_KEEP_OUT.left; x <= W - w - UI_KEEP_OUT.left; x += 20) corners.push([x, y]);
    }
    const lifts = t.samples.map((_, i) => liftAt(t, i));
    // What each piece of scenery covers on screen, from its base: [left,
    // top, right, bottom]. Tall things reach well above their base (a
    // windmill's sails, a tree's canopy), so a point-and-radius isn't enough.
    const SCENERY_BOX = {
      barn: [-64, -66, 72, 46], pen: [-76, -56, 80, 54], corn: [-76, -48, 82, 46], pond: [-80, -46, 80, 46],
      hay: [-64, -44, 66, 38], sheep: [-38, -34, 40, 30], silo: [-30, -74, 46, 28], windmill: [-50, -100, 50, 20],
      tree: [-36, -72, 48, 28],
    };
    const groundAt = (x, y) => (t.terrain ? root.TractorTracks.terrainHeight(t.terrain, x, y) * RAISE : 0);
    let best = null;
    for (const [x, y] of corners) {
      // How far the board is from the nearest road edge (walls included).
      let clear = Infinity;
      t.samples.forEach((s, i) => {
        const sy = s.y - lifts[i];
        const dx = Math.max(x - s.x, 0, s.x - (x + w));
        const dy = Math.max(y - sy, 0, sy - (y + h));
        clear = Math.min(clear, Math.hypot(dx, dy) - (t.halfWidth + 30));
      });
      for (const sc of overScenery ? [] : t.scenery) {
        const [l, tp, r, b] = (SCENERY_BOX[sc.kind] || [-50, -50, 50, 50]).map((v) => v * (sc.scale || 1));
        const by = sc.y - groundAt(sc.x, sc.y);
        const sdx = Math.max(sc.x + l - (x + w), 0, x - (sc.x + r));
        const sdy = Math.max(by + tp - (y + h), 0, y - (by + b));
        clear = Math.min(clear, Math.hypot(sdx, sdy) - 6);
      }
      // Keep clear of the flagman too.
      const fm = flagmanSpot(t);
      const fdx = Math.max(x - fm.x, 0, fm.x - (x + w));
      const fdy = Math.max(y - (fm.y - fm.lift), 0, fm.y - fm.lift - 26 - (y + h));
      clear = Math.min(clear, Math.hypot(fdx, fdy) - 14);
      if (clear >= 0) return { x, y, w: w0, k, clear: 0, label: t.name.toUpperCase() };
      if (!best || clear > best.clear) best = { x, y, w: w0, k, clear, label: t.name.toUpperCase() };
    }
    return best;
  }
  // Always full size, so the name stays readable on a phone. Clear of road,
  // scenery and the flagman where there's room; on crowded tracks it may
  // stand over scenery, but never over the road or walls.
  function placeSign(t, w) {
    const at = placeSignAt(t, w, 1, false);
    if (at.clear >= 0) return at;
    const over = placeSignAt(t, w, 1, true);
    return over.clear > at.clear ? over : at;
  }


  function drawSign(c, sg) {
    const { x, y, w } = sg;
    const h = SIGN.h;
    const foot = y + h + SIGN.post;
    c.save();
    // Shadow on the ground, then posts, then the board with its thickness.
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath();
    c.ellipse(x + w / 2 + 6, foot - 1, w / 2, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6b4423';
    for (const px of [x + 14, x + w - 18]) {
      c.fillRect(px, y + h - 4, 4, SIGN.post + 4);
      c.strokeStyle = OUTLINE;
      c.lineWidth = 1.2 * LINE;
      c.strokeRect(px, y + h - 4, 4, SIGN.post + 4);
    }
    roundRect(c, x, y + 3, w, h, 8);
    c.fillStyle = '#8a5a2b';
    c.fill();
    roundRect(c, x, y, w, h, 8);
    fillStroke(c, '#c98f52', 2.5);
    c.save();
    roundRect(c, x, y, w, h, 8);
    c.clip();
    c.strokeStyle = 'rgba(120,70,30,0.25)';
    c.lineWidth = 1;
    for (const gy of [y + 8, y + 16, y + 23]) {
      c.beginPath();
      c.moveTo(x, gy);
      c.bezierCurveTo(x + w * 0.3, gy - 2, x + w * 0.6, gy + 2, x + w, gy);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,240,210,0.25)';
    c.fillRect(x, y, w, 3);
    c.restore();
    c.font = `20px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(80,45,15,0.6)';
    c.fillText(sg.label, x + w / 2, y + h / 2 + 2.5);
    c.fillStyle = '#fff6dc';
    c.fillText(sg.label, x + w / 2, y + h / 2 + 1);
    c.restore();
  }

  // The ground as raised/sunken land: small cells drawn back to front, each a
  // column from the ground up to its height (a grassy bank where it's higher
  // than the cell in front) with a grass top shaded by the slope.
  const TERRAIN_CX = 2; // cell width
  const TERRAIN_CY = 2; // cell height (fine, so slopes read smooth)
  function drawTerrain(c, t) {
    const cw = TERRAIN_CX;
    const ch = TERRAIN_CY;
    const hAt = (x, y) => root.TractorTracks.terrainHeight(t.terrain, x, y);
    // Only where there's any terrain nearby.
    const cols = Math.ceil(W / cw);
    const rows = Math.ceil(H / ch);
    // Sampled one cell past every screen edge, so cells along the edges are
    // shaded from real neighbours (not flat ground), with no seam there.
    const rowsG = [];
    let any = false;
    for (let j = -1; j <= rows + 1; j++) {
      const row = [];
      for (let i = -1; i <= cols + 1; i++) {
        const h = hAt(i * cw + cw / 2, j * ch + ch / 2);
        if (Math.abs(h) > 0.4) any = true;
        row.push(h);
      }
      rowsG.push(row);
    }
    if (!any) return;
    const G = (j, i) => rowsG[j + 1][i + 1];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const h = G(j, i);
        // Skip flat ground unless it's next to a dip (it has to cover the
        // near edge of the pit).
        const behind = G(j - 1, i);
        if (Math.abs(h) < 0.05 && behind > -0.4) continue;
        const x = i * cw;
        const y = j * ch;
        const lift = h * RAISE;
        // Grass, lit from above: slopes facing the camera a little darker,
        // slopes facing away a little lighter.
        const dx = (G(j, i + 1) - G(j, i - 1)) / (2 * cw);
        const dy = (G(j + 1, i) - behind) / (2 * ch);
        // Faded out at the foot of a slope, so where the drawn ground stops
        // it matches the flat grass around it (else its edge shows in steps).
        const foot = Math.min(1, Math.abs(h) / 0.8);
        const light = Math.max(-0.14, Math.min(0.14, -(dx * 0.6 + dy) * 0.9)) * foot;
        // Sunken ground turns from grass to bare earth as it gets deeper.
        const earth = h < 0 ? Math.max(0, Math.min(1, -h / 3)) : 0;
        const top = earth ? mixHex('#6fbf4f', '#8a6a3d', earth, light) : shade('#6fbf4f', light);
        // Bank below (raised ground) or the far wall of a dip. Where the
        // ground only slopes gently towards the camera, the gap down to the
        // next row is more of the same slope, not a bank (else slopes come
        // out striped).
        const drop = (h - G(j + 1, i)) * RAISE;
        if (h > 0) {
          // Darker the steeper the drop, blended in (a hard switch drew the
          // crease along a bank's corners as 2px stairs).
          c.fillStyle = shade('#6fbf4f', light - 0.14 * Math.max(0, Math.min(1, (drop - 1) / 5)));
          c.fillRect(x, y - lift, cw + 0.5, ch + lift + 0.5);
        } else if (h < 0) {
          // The far wall of a dip, only across the drop from the row behind
          // (drawn from ground level it covered that row's slope in 2px
          // combs), earthier the steeper the drop.
          const fall = (behind - h) * RAISE;
          const top0 = y - Math.max(behind, h) * RAISE;
          const steep = Math.max(0, Math.min(1, (fall - 1) / 4));
          c.fillStyle = steep ? mixHex(earth ? '#8a6a3d' : '#6fbf4f', '#7a5a32', steep, light - 0.04 * steep) : top;
          c.fillRect(x, top0, cw + 0.5, y - lift - top0 + ch + 0.5);
        }
        c.fillStyle = top;
        c.fillRect(x, y - lift, cw + 0.5, ch + 0.5);
        // The mown stripes, on over raised grass, fading out into a dip.
        const mown = h >= 0 ? 1 : Math.max(0, 1 + h / 1.5);
        if (mown > 0) {
          c.fillStyle = mownStripe(x, mown);
          c.fillRect(x, y - lift, cw + 0.5, ch + 0.5);
        }
        // A lighter lip along the crest of a bank (only the top row of a
        // slope, or a steep slope would be striped with them).
        const front = G(j + 1, i);
        if (h > 0.5 && h - front > 0.35 && behind - h < 0.2) {
          c.fillStyle = 'rgba(200,240,150,0.55)';
          c.fillRect(x, y - lift + ch - 1, cw + 0.5, 1.5);
        }
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

  // Kept low so the track stays easy to see.
  const WALL_H = { bale: 6, tyre: 8, barrel: 10 };
  const BARREL_COLORS = ['#2f6fd0', '#e2412f', '#2e9a47'];
  // Round things are seen slightly from the front, so their tops are ovals.
  const OVAL = 0.62;

  // Straw texture: short strokes along the bale, a couple of twine bands.
  function baleTop(c, n) {
    roundRect(c, -12, -7, 24, 14, 3);
    fillStroke(c, n % 2 ? '#e8c35c' : '#ddb44c', 1.6);
    c.save();
    roundRect(c, -12, -7, 24, 14, 3);
    c.clip();
    const rng = root.FarmRng.mulberry32(n * 131 + 7);
    c.lineWidth = 1;
    for (let k = 0; k < 16; k++) {
      const x = -11 + rng() * 22;
      const y = -6 + rng() * 12;
      c.strokeStyle = rng() < 0.5 ? 'rgba(255,245,200,0.75)' : 'rgba(150,105,30,0.55)';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 3 + rng() * 3, y + (rng() - 0.5) * 1.5);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(120,70,25,0.8)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-4.5, -7);
    c.lineTo(-4.5, 7);
    c.moveTo(4.5, -7);
    c.lineTo(4.5, 7);
    c.stroke();
  }

  // Light comes from the top left: a shadow falls this far right and down
  // per px of an object's height.
  const SHADOW = { x: 0.55, y: 0.45 };

  // Walls' shadows go in the background (they never move), so a wall's
  // shadow can't be drawn over a vehicle passing beside it.
  function drawWallShadow(c, w) {
    const h = WALL_H[w.kind];
    c.beginPath();
    c.ellipse(w.x + h * SHADOW.x, w.y + h * SHADOW.y, w.kind === 'bale' ? 13 : 10, 6.5, w.kind === 'bale' ? w.angle : 0, 0, Math.PI * 2);
    c.fill();
  }

  function drawWallSolid(c, w) {
    const h = WALL_H[w.kind];
    if (w.kind === 'bale') {
      solid(c, w.x, w.y, h, '#a8842f', (cc) => {
        cc.rotate(w.angle);
        roundRect(cc, -12, -7, 24, 14, 3);
      });
      // Straw strands down the visible side.
      c.save();
      c.translate(w.x, w.y);
      c.rotate(w.angle);
      roundRect(c, -12, -7, 24, 14, 3);
      c.restore();
      c.strokeStyle = 'rgba(59,42,20,0.45)';
      c.lineWidth = 1;
      c.stroke();
      c.save();
      c.translate(w.x, w.y - h);
      c.rotate(w.angle);
      baleTop(c, w.n);
      c.restore();
    } else if (w.kind === 'tyre') {
      // Tyres stacked: each a dark oval band, the top one showing its hole.
      const R = 8.5;
      for (let k = 0; k < 3; k++) {
        const y = w.y - (k * h) / 3;
        c.beginPath();
        c.ellipse(w.x, y, R, R * OVAL, 0, 0, Math.PI * 2);
        c.fillStyle = '#161616';
        c.fill();
        c.beginPath();
        c.ellipse(w.x, y - h / 6, R, R * OVAL, 0, 0, Math.PI);
        c.fillStyle = '#2b2b2b';
        c.fill();
      }
      const ty = w.y - h;
      c.beginPath();
      c.ellipse(w.x, ty, R, R * OVAL, 0, 0, Math.PI * 2);
      fillStroke(c, '#2a2a2a', 1.6);
      c.beginPath();
      c.ellipse(w.x, ty, R * 0.45, R * 0.45 * OVAL, 0, 0, Math.PI * 2);
      c.fillStyle = w.n % 2 ? '#e2412f' : '#f4f0e6';
      c.fill();
    } else {
      // Oil drum: a cylinder with an oval lid and a rib round the middle.
      const col = BARREL_COLORS[w.n % 3];
      const R = 8.5;
      const ty = w.y - h;
      c.beginPath();
      c.moveTo(w.x - R, ty);
      c.lineTo(w.x - R, w.y);
      c.ellipse(w.x, w.y, R, R * OVAL, 0, Math.PI, 0, true);
      c.lineTo(w.x + R, ty);
      c.closePath();
      const g = c.createLinearGradient(w.x - R, 0, w.x + R, 0);
      g.addColorStop(0, shade(col, -0.3));
      g.addColorStop(0.35, shade(col, 0.05));
      g.addColorStop(1, shade(col, -0.35));
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 1.6 * LINE;
      c.strokeStyle = OUTLINE;
      c.stroke();
      c.strokeStyle = shade(col, -0.45);
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(w.x, w.y - h / 2, R, R * OVAL, 0, 0, Math.PI);
      c.stroke();
      c.beginPath();
      c.ellipse(w.x, ty, R, R * OVAL, 0, 0, Math.PI * 2);
      fillStroke(c, shade(col, 0.12), 1.6);
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(w.x, ty, R * 0.62, R * 0.62 * OVAL, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.ellipse(w.x + 3, ty - 1, 1.6, 1.1, 0, 0, Math.PI * 2);
      c.fillStyle = '#d9d9d9';
      c.fill();
    }
  }

  function drawSceneryDepth(c, sc0, rng, ground = 0) {
    const sc = ground ? { ...sc0, y: sc0.y - ground * RAISE } : sc0;
    const art = SCENERY_ART[sc.kind];
    if (!art) {
      drawScenery(c, sc, rng);
      return;
    }
    const k = sc.scale || 1;
    c.save();
    c.translate(sc.x, sc.y);
    c.scale(k, k);
    art(c, rng);
    c.restore();
  }

  // An upright cylinder seen slightly from the front: side from `y0` (base)
  // up `h`, oval top. Returns the top's centre y.
  function cylinder(c, r, h, col, { top = shade(col, 0.12), rings = [] } = {}) {
    const ty = -h;
    c.beginPath();
    c.moveTo(-r, ty);
    c.lineTo(-r, 0);
    c.ellipse(0, 0, r, r * OVAL, 0, Math.PI, 0, true);
    c.lineTo(r, ty);
    c.closePath();
    const g = c.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, shade(col, -0.22));
    g.addColorStop(0.38, shade(col, 0.08));
    g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2 * LINE;
    c.strokeStyle = OUTLINE;
    c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 1.5;
    for (const f of rings) {
      c.beginPath();
      c.ellipse(0, -h * f, r, r * OVAL, 0, 0, Math.PI);
      c.stroke();
    }
    c.beginPath();
    c.ellipse(0, ty, r, r * OVAL, 0, 0, Math.PI * 2);
    fillStroke(c, top, 2);
    return ty;
  }

  function groundShadow(c, rx, ry, dx = 8, dy = 6) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.beginPath();
    c.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Scenery drawn for our camera: things stand up the screen from their
  // base, round tops are ovals, and you see the front face of buildings.
  const SCENERY_ART = {
    barn(c) {
      const w = 120;
      const d = 70; // depth (top-down)
      const h = 26; // wall height
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(-w / 2 + 10, -d / 2 + 10, w, d);
      // Front wall with big doors and white trim.
      c.fillStyle = '#b8352a';
      c.fillRect(-w / 2, d / 2 - h, w, h);
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.lineWidth = 1.2;
      for (let x = -w / 2 + 8; x < w / 2; x += 8) {
        c.beginPath();
        c.moveTo(x, d / 2 - h);
        c.lineTo(x, d / 2);
        c.stroke();
      }
      c.fillStyle = '#8f2a21';
      c.fillRect(-18, d / 2 - h + 4, 36, h - 4);
      c.strokeStyle = '#fff';
      c.lineWidth = 2.5;
      c.strokeRect(-18, d / 2 - h + 4, 36, h - 4);
      c.beginPath();
      c.moveTo(-18, d / 2 - h + 4);
      c.lineTo(18, d / 2);
      c.moveTo(18, d / 2 - h + 4);
      c.lineTo(-18, d / 2);
      c.stroke();
      c.lineWidth = 2 * LINE;
      c.strokeStyle = OUTLINE;
      c.strokeRect(-w / 2, d / 2 - h, w, h);
      // Roof: two planes either side of the ridge, the near one darker.
      const top = -d / 2 - h;
      const ridge = top + (d * 0.5);
      c.fillStyle = '#6a7079';
      c.beginPath();
      c.rect(-w / 2 - 4, top, w + 8, ridge - top);
      c.fill();
      c.fillStyle = '#545a63';
      c.beginPath();
      c.rect(-w / 2 - 4, ridge, w + 8, d / 2 - h - ridge + 4);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1;
      for (let x = -w / 2; x < w / 2 + 4; x += 7) {
        c.beginPath();
        c.moveTo(x, top);
        c.lineTo(x, d / 2 - h + 4);
        c.stroke();
      }
      c.strokeStyle = '#d9d9d9';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-w / 2 - 4, ridge);
      c.lineTo(w / 2 + 4, ridge);
      c.stroke();
      c.lineWidth = 2 * LINE;
      c.strokeStyle = OUTLINE;
      c.strokeRect(-w / 2 - 4, top, w + 8, d / 2 - h - top + 4);
    },
    silo(c) {
      groundShadow(c, 34, 20, 10, 6);
      const ty = cylinder(c, 26, 52, '#b9c2c9', { top: '#d6dde2', rings: [0.3, 0.6] });
      // Domed cap.
      c.beginPath();
      c.ellipse(0, ty, 16, 16 * OVAL, 0, 0, Math.PI * 2);
      fillStroke(c, '#c9d1d7', 1.5);
      c.beginPath();
      c.ellipse(0, ty - 2, 6, 6 * OVAL, 0, 0, Math.PI * 2);
      fillStroke(c, '#8f9aa3', 1.5);
    },
    windmill(c) {
      groundShadow(c, 30, 16, 10, 6);
      // Tapered tower.
      c.beginPath();
      c.moveTo(-18, 0);
      c.lineTo(-11, -46);
      c.lineTo(11, -46);
      c.lineTo(18, 0);
      c.ellipse(0, 0, 18, 18 * OVAL, 0, 0, Math.PI);
      c.closePath();
      const g = c.createLinearGradient(-18, 0, 18, 0);
      g.addColorStop(0, '#a8946a');
      g.addColorStop(0.4, '#d6c49a');
      g.addColorStop(1, '#9a865c');
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 2 * LINE;
      c.strokeStyle = OUTLINE;
      c.stroke();
      c.fillStyle = '#5a3a1c';
      roundRect(c, -4, -14, 8, 14, 3);
      c.fill();
      // Cap and sails.
      c.beginPath();
      c.ellipse(0, -48, 14, 14 * OVAL, 0, 0, Math.PI * 2);
      fillStroke(c, '#8a5a2b', 2);
      c.save();
      c.translate(0, -50);
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate(0.5 + (i * Math.PI) / 2);
        roundRect(c, 4, -6, 40, 12, 3);
        fillStroke(c, '#fff8e6', 2);
        c.strokeStyle = 'rgba(59,42,20,0.35)';
        c.lineWidth = 1;
        for (let k = 12; k < 42; k += 7) {
          c.beginPath();
          c.moveTo(k, -5);
          c.lineTo(k, 5);
          c.stroke();
        }
        c.restore();
      }
      circle(c, 0, 0, 5);
      fillStroke(c, '#5a3a1c', 1.5);
      c.restore();
    },
    tree(c, rng) {
      groundShadow(c, 34, 18, 12, 8);
      cylinder(c, 6, 16, '#6b4423');
      // Canopy: shaded clumps, darker underneath, lighter on top.
      const clumps = [[0, -38, 30], [-16, -30, 18], [16, -30, 18], [-8, -50, 16], [10, -48, 15]];
      for (const [x, y, r] of clumps) {
        circle(c, x, y + 3, r);
        c.fillStyle = '#2f7a2c';
        c.fill();
      }
      for (const [x, y, r] of clumps) {
        circle(c, x, y, r);
        c.fillStyle = '#4caa44';
        c.fill();
      }
      circle(c, 0, -38, 30);
      c.lineWidth = 2 * LINE;
      c.strokeStyle = 'rgba(30,70,25,0.6)';
      c.stroke();
      for (let i = 0; i < 6; i++) {
        circle(c, (rng() - 0.5) * 34, -44 + (rng() - 0.5) * 22, 4 + rng() * 5);
        c.fillStyle = 'rgba(160,220,120,0.55)';
        c.fill();
      }
    },
    hay(c) {
      groundShadow(c, 56, 26, 8, 10);
      // A stack of square bales: a row of three at the back, three at the
      // front, and two on top - each showing its front face.
      const bale = (x, y, z) => {
        const h = 14;
        c.fillStyle = '#b08a30';
        c.fillRect(x - 15, y - 12 - z, 30, h + 12);
        c.save();
        c.translate(x, y - z - h);
        c.scale(1.25, 0.9);
        baleTop(c, Math.round(x + y));
        c.restore();
        c.strokeStyle = 'rgba(59,42,20,0.5)';
        c.lineWidth = 1;
        c.strokeRect(x - 15, y - z - h + 12, 30, h);
      };
      for (const x of [-32, 0, 32]) bale(x, -12, 0);
      for (const x of [-32, 0, 32]) bale(x, 12, 0);
      for (const x of [-16, 16]) bale(x, 0, 14);
    },
    corn(c, rng) {
      // Tilled patch with its front edge showing, then rows of corn plants
      // standing up, back row first, the odd ripe cob showing.
      groundShadow(c, 74, 34, 8, 8);
      c.fillStyle = '#6b4a26';
      roundRect(c, -72, -32, 144, 72, 6);
      c.fill();
      roundRect(c, -72, -36, 144, 72, 6);
      fillStroke(c, '#8a6a3d', 2.5);
      c.strokeStyle = 'rgba(60,35,15,0.35)';
      c.lineWidth = 2;
      for (let row = -28; row <= 28; row += 14) {
        c.beginPath();
        c.moveTo(-68, row + 3);
        c.lineTo(68, row + 3);
        c.stroke();
      }
      for (let row = -28; row <= 28; row += 14) {
        for (let col = -64; col <= 64; col += 11) {
          const x = col + (rng() - 0.5) * 3;
          const y = row + 2 + (rng() - 0.5) * 2;
          c.strokeStyle = '#3f7a24';
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y - 9);
          c.stroke();
          c.fillStyle = '#3d8a2a';
          c.beginPath();
          c.ellipse(x, y - 9, 6, 4.2, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = rng() < 0.5 ? '#5fae3a' : '#6cc043';
          c.beginPath();
          c.ellipse(x - 0.8, y - 10.5, 4.6, 3, 0, 0, Math.PI * 2);
          c.fill();
          if (rng() < 0.18) {
            c.fillStyle = '#f4c20d';
            c.beginPath();
            c.ellipse(x + 3, y - 7, 1.6, 3, 0.4, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    },
    pen(c) {
      // A muddy pen fenced with posts and rails: the back fence, the pigs,
      // then the front fence over them.
      const w = 140;
      const d = 90;
      const ph = 9; // fence height
      groundShadow(c, 76, 44, 6, 8);
      roundRect(c, -w / 2, -d / 2, w, d, 6);
      c.fillStyle = '#7a5a32';
      c.fill();
      c.fillStyle = 'rgba(60,35,15,0.35)';
      for (const [x, y, rx, ry] of [[-20, 8, 30, 14], [30, -12, 22, 10], [-40, -18, 14, 7]]) {
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
      }
      const fence = (y0, y1, x0, x1, step) => {
        c.strokeStyle = '#a8763c';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(x0, y0 - ph * 0.45);
        c.lineTo(x1, y1 - ph * 0.45);
        c.moveTo(x0, y0 - ph * 0.9);
        c.lineTo(x1, y1 - ph * 0.9);
        c.stroke();
        c.fillStyle = '#7a4f25';
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
        for (let i = 0; i <= n; i++) {
          const x = x0 + ((x1 - x0) * i) / n;
          const y = y0 + ((y1 - y0) * i) / n;
          c.fillRect(x - 1.5, y - ph - 1, 3, ph + 1);
        }
      };
      fence(-d / 2, -d / 2, -w / 2, w / 2, 20);
      fence(-d / 2, d / 2, -w / 2, -w / 2, 18);
      fence(-d / 2, d / 2, w / 2, w / 2, 18);
      for (const [px, py, a] of [[-30, -10, 0.3], [20, 15, -2.5], [35, -20, 1.8]]) {
        c.save();
        c.translate(px, py);
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath();
        c.ellipse(3, 3, 14, 9, a, 0, Math.PI * 2);
        c.fill();
        c.rotate(a);
        c.beginPath();
        c.ellipse(0, 2, 14, 10, 0, 0, Math.PI * 2);
        c.fillStyle = '#c97a8d';
        c.fill();
        c.beginPath();
        c.ellipse(0, -1, 14, 10, 0, 0, Math.PI * 2);
        fillStroke(c, '#f7a8bb', 2);
        c.beginPath();
        c.ellipse(14, -1, 3.5, 5, 0, 0, Math.PI * 2);
        fillStroke(c, '#ef8aa3', 1.5);
        c.restore();
      }
      fence(d / 2, d / 2, -w / 2, w / 2, 20);
    },
    sheep(c) {
      // A small flock grazing, each fleece standing on little dark legs.
      for (const [sx, sy, a] of [[14, -18, -2.6], [-22, -12, 0.4], [24, 10, 3.0], [-6, 14, 1.4]]) {
        c.save();
        c.translate(sx, sy);
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath();
        c.ellipse(3, 3, 12, 8, a, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2a2a2a';
        for (const [lx, ly] of [[-5, -4], [-5, 4], [5, -4], [5, 4]]) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          c.fillRect(lx * ca - ly * sa - 1, lx * sa + ly * ca - 4, 2, 4);
        }
        c.translate(0, -4);
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
    },
    pond(c, rng) {
      // Damp muddy bank fading into the grass, shallows fading into the
      // bank, deeper blue in the middle (soft edges, like the puddles on the
      // track), then a few reeds and lily pads, and a duck.
      c.save();
      c.rotate(0.2);
      softBlob(c, 0, 0, 86, 50, [[0.6, 'rgba(138,106,61,0.85)'], [0.8, 'rgba(120,120,55,0.45)'], [1, 'rgba(110,140,60,0)']]);
      softBlob(c, -4, -2, 74, 40, [[0, '#2f86c4'], [0.55, '#4fa9dc'], [0.82, '#8fd3f2'], [1, 'rgba(160,215,235,0)']]);
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(-20 + i * 18, -10 + i * 6, 10, 3, 0.2, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
      for (const [x, y] of [[40, 14], [-46, -6], [28, -20]]) {
        c.beginPath();
        c.ellipse(x, y, 7, 4, 0.4, 0.3, Math.PI * 2 - 0.3);
        c.lineTo(x, y);
        c.fillStyle = '#5fae3a';
        c.fill();
      }
      c.strokeStyle = '#4c7a2a';
      c.lineWidth = 2;
      for (const x of [-64, -58, -52, 60, 66]) {
        c.beginPath();
        c.moveTo(x, 10);
        c.lineTo(x + (rng() - 0.5) * 4, -6);
        c.stroke();
        c.fillStyle = '#6b4423';
        c.fillRect(x - 1.5, -10, 3, 6);
      }
      // Duck.
      c.save();
      c.translate(10, 6);
      c.beginPath();
      c.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      fillStroke(c, '#fff', 1.5);
      circle(c, 7, -4, 4);
      fillStroke(c, '#1f8a4c', 1.5);
      c.fillStyle = '#f7a325';
      c.fillRect(10, -5, 5, 2.5);
      c.restore();
    },
  };

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

  // `screen`: compare against where the road is drawn (lifted by hills).
  // ---------- Wall placement ----------
  // Walls run round the outline of all the road together (every stretch at
  // once), 7px outside its edge: one continuous line of bales with clean
  // corners at junctions and crossing mouths, and no piece ever on the road.
  const WALL_OFF = 7;
  const WALL_CELL = 4;
  function placeWalls(t) {
    const cs = WALL_CELL;
    const cols = Math.ceil(W / cs) + 3;
    const rows = Math.ceil(H / cs) + 3;
    const ox = -cs;
    const oy = -cs;
    // Distance from the road edge (negative on the road), and the nearest
    // centre-line sample, on a grid.
    const D = new Float32Array(cols * rows);
    const NI = new Int32Array(cols * rows);
    const S = t.samples;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + i * cs;
        const y = oy + j * cs;
        let best = Infinity;
        let bi = 0;
        for (let k = 0; k < S.length; k++) {
          const dx = S[k].x - x;
          const dy = S[k].y - y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bi = k;
          }
        }
        D[j * cols + i] = Math.sqrt(best) - t.halfWidth - WALL_OFF;
        NI[j * cols + i] = bi;
      }
    }
    // Marching squares at D = 0, chaining the pieces into lines.
    const edgePoint = (i0, j0, i1, j1) => {
      const a = D[j0 * cols + i0];
      const b = D[j1 * cols + i1];
      const f = a / (a - b);
      return [ox + (i0 + (i1 - i0) * f) * cs, oy + (j0 + (j1 - j0) * f) * cs];
    };
    const ekey = (i0, j0, i1, j1) => (i0 < i1 || j0 < j1 ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`);
    const links = new Map();
    const link = (k1, p1, k2, p2) => {
      if (!links.has(k1)) links.set(k1, { p: p1, to: [] });
      if (!links.has(k2)) links.set(k2, { p: p2, to: [] });
      links.get(k1).to.push(k2);
      links.get(k2).to.push(k1);
    };
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const v = [D[j * cols + i], D[j * cols + i + 1], D[(j + 1) * cols + i + 1], D[(j + 1) * cols + i]];
        const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const crossings = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e];
          const b = v[(e + 1) % 4];
          if ((a < 0) !== (b < 0)) {
            const [i0, j0] = corners[e];
            const [i1, j1] = corners[(e + 1) % 4];
            crossings.push([ekey(i0, j0, i1, j1), edgePoint(i0, j0, i1, j1)]);
          }
        }
        if (crossings.length === 2) link(crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]);
        else if (crossings.length === 4) {
          link(crossings[0][0], crossings[0][1], crossings[1][0], crossings[1][1]);
          link(crossings[2][0], crossings[2][1], crossings[3][0], crossings[3][1]);
        }
      }
    }
    const lines = [];
    const seen = new Set();
    for (const [start] of links) {
      if (seen.has(start)) continue;
      const line = [];
      let cur = start;
      let prev = null;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const node = links.get(cur);
        line.push(node.p);
        const nxt = node.to.find((k) => k !== prev && !seen.has(k));
        prev = cur;
        cur = nxt;
      }
      if (line.length > 8) lines.push(line);
    }
    // Lift each point with the road beside it, smooth, and lay pieces along.
    const walls = [];
    const SIZE = { bale: 13, tyre: 9, barrel: 10 };
    // Pieces from another stretch of road (where two stretches' walls meet,
    // as at a bridge's end) or at another height need more room, or they
    // look stacked on each other.
    const apart = (a, b) => {
      const d = Math.abs(a - b);
      return Math.min(d, t.count - d) > 12;
    };
    // Points along every deck's railings, where it reaches the ground on
    // screen too (the abutment and railing ends).
    const rails = [];
    for (const dk of t.decks || []) {
      const outerW = t.halfWidth + 13;
      for (const i of dk.idx) {
        if (!dk.slab(i)) continue;
        const s = t.samples[i];
        const L = liftAt(t, i);
        for (const side of [-1, 1]) rails.push([s.x + s.nx * side * (outerW - 2), s.y + s.ny * side * (outerW - 2) - L]);
      }
    }
    const railNear = (x, y, r) => rails.some(([rx, ry]) => Math.hypot(rx - x, ry - y) < r);
    const clashes = (x, y, r, lift = 0, si = -1) => walls.some((w) => Math.hypot(w.x - x, w.y - y) < r + SIZE[w.kind] - 3 + (Math.abs(w.gy - w.y - lift) > 8 || (si >= 0 && apart(w.si, si)) ? 16 : 0));
    let placed = 0;
    for (const raw of lines) {
      const n = raw.length;
      const pts = raw.map((p, k) => {
        // Light smoothing (closed line).
        let sx = 0;
        let sy = 0;
        for (let q = -2; q <= 2; q++) {
          const r = raw[(k + q + n) % n];
          sx += r[0];
          sy += r[1];
        }
        const x = sx / 5;
        const gy = sy / 5;
        const ci = Math.max(0, Math.min(cols - 1, Math.round((x - ox) / cs)));
        const cj = Math.max(0, Math.min(rows - 1, Math.round((gy - oy) / cs)));
        const si = NI[cj * cols + ci];
        // On shaped ground, sit at the height of the ground drawn there;
        // beside a bridge ramp, at the height of the ramp.
        const ramp = (t.bridges || []).some((b) => root.TractorTracks.bridgeProfile(t, b, si) > 0);
        // ...but a wall belongs to its road: where the ground beside the
        // road drops away from it (a pit beside a flat stretch), the wall
        // stays at the road's height, not down in the pit.
        const road = liftAt(t, si);
        const ground = t.terrain ? root.TractorTracks.terrainHeight(t.terrain, x, gy) * RAISE : road;
        const lift = !ramp && Math.abs(ground - road) < 6 ? ground : road;
        return { x, gy, y: gy - lift, si };
      });
      let travelled = 0;
      let nextAt = 0;
      for (let k = 0; k < n; k++) {
        const p = pts[k];
        if (k > 0) travelled += Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y);
        if (travelled < nextAt) continue;
        if (p.x < -10 || p.x > W + 10 || p.gy < -10 || p.gy > H + 10) continue;
        const ahead = pts[(k + 3) % n];
        const behind = pts[(k - 3 + n) % n];
        // Lying along the wall on the ground: a bale on a slope sits higher
        // up the screen but isn't turned by it (turned, the walls zig-zag
        // over every hump).
        const angle = Math.atan2(ahead.gy - behind.gy, ahead.x - behind.x);
        const a0 = pts[(k - 6 + n) % n];
        const a1 = pts[(k + 6) % n];
        let turn = Math.atan2(a1.gy - p.gy, a1.x - p.x) - Math.atan2(p.gy - a0.gy, p.x - a0.x);
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        const span = Math.hypot(a1.x - a0.x, a1.gy - a0.gy);
        const tight = span / Math.max(0.001, Math.abs(turn)) < BARREL_RADIUS * 0.6;
        const kind = placed % 9 === 0 ? 'tyre' : tight ? 'barrel' : 'bale';
        // A bridge deck has railings instead, and the walls stop short of
        // them (and of the stone ends) rather than butting into them.
        const dk = deckOf(t, p.si);
        if (dk && dk.slab(p.si)) continue;
        if (railNear(p.x, p.y, SIZE[kind] + 4)) continue;
        if (clashes(p.x, p.y, SIZE[kind], p.gy - p.y, p.si)) {
          nextAt = travelled + 4;
          continue;
        }
        walls.push({ kind, x: p.x, y: p.y, gy: p.gy, si: p.si, n: kind === 'tyre' ? Math.floor(placed / 9) : placed, angle });
        nextAt = travelled + (kind === 'tyre' ? 20 : kind === 'barrel' ? 18 : 25);
        placed++;
      }
    }
    return walls;
  }

  function nearOtherRoad(t, i, x, y, within, screen) {
    const lim = within * within;
    const skip = Math.ceil((t.width * 1.5) / root.TractorTracks.SAMPLE_STEP);
    for (let k = 0; k < t.count; k++) {
      let d = Math.abs(k - i);
      d = Math.min(d, t.count - d);
      if (d <= skip) continue;
      const s = t.samples[k];
      const dx = s.x - x;
      const dy = s.y - (screen ? liftAt(t, k) : 0) - y;
      if (dx * dx + dy * dy < lim) return true;
    }
    return false;
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

  // Grandstand along the top edge: tiers of benches stepping down towards
  // the camera, each with its riser face showing, the crowd on them, and a
  // front rail hung with bunting, casting a shadow on the grass.
  function drawGrandstand(c, rng) {
    const x0 = 300;
    const x1 = 900;
    const front = 42;
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(x0 + 8, front, x1 - x0, 12);
    c.fillStyle = '#6b4423';
    c.fillRect(x0, 0, x1 - x0, front);
    const shirts = ['#e2412f', '#2f7de2', '#f4c20d', '#2fae4a', '#8e44c9', '#fff', '#f07c1b'];
    const skins = ['#f2c9a0', '#c98e5e', '#8a5a3c'];
    for (let row = 0; row < 3; row++) {
      const top = 2 + row * 13;
      // Bench top, then the riser below it.
      c.fillStyle = row % 2 ? '#b98448' : '#c28d50';
      c.fillRect(x0, top + 5, x1 - x0, 5);
      c.fillStyle = '#82552a';
      c.fillRect(x0, top + 10, x1 - x0, 3);
      for (let x = x0 + 10; x < x1 - 5; x += 13) {
        const px = x + (row % 2) * 6 + (rng() - 0.5) * 2;
        const py = top + 4 + (rng() - 0.5) * 1.5;
        c.fillStyle = shirts[Math.floor(rng() * shirts.length)];
        roundRect(c, px - 5, py, 10, 8, 4);
        c.fill();
        c.fillStyle = skins[Math.floor(rng() * 3)];
        circle(c, px, py - 1, 3.6);
        c.fill();
        // A few arms up, waving.
        if (rng() < 0.12) {
          c.strokeStyle = c.fillStyle;
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(px + 4, py + 2);
          c.lineTo(px + 7, py - 5);
          c.stroke();
        }
      }
    }
    // Front rail with bunting.
    c.fillStyle = '#e8d6b0';
    c.fillRect(x0, front - 3, x1 - x0, 5);
    c.fillStyle = '#c98f52';
    c.fillRect(x0, front + 2, x1 - x0, 3);
    const flags = ['#e2412f', '#f4c20d', '#2f7de2', '#2fae4a'];
    for (let x = x0 + 4, k = 0; x < x1 - 8; x += 12, k++) {
      c.beginPath();
      c.moveTo(x, front + 5);
      c.lineTo(x + 8, front + 5);
      c.lineTo(x + 4, front + 11);
      c.closePath();
      c.fillStyle = flags[k % flags.length];
      c.fill();
    }
    // End walls.
    c.fillStyle = '#5a3a1c';
    c.fillRect(x0 - 4, 0, 6, front + 5);
    c.fillRect(x1 - 2, 0, 6, front + 5);
    c.strokeStyle = OUTLINE;
    c.lineWidth = 2.5 * LINE;
    c.strokeRect(x0 - 4, -3, x1 - x0 + 8, front + 8);
  }


  // Screen px a hill lifts the road per px of height (Super Off Road style:
  // higher ground is drawn further up the screen, with an earth bank below).
  const RAISE = 1.4;
  const liftAt = (t, i) => root.TractorTracks.elevationAt(t, i).h * RAISE;

  // Hills: the road is drawn lifted up the screen by its height, with a
  // bank of earth filling the gap down to the ground, then the raised
  // surface on top — lit on the climb, shaded on the way down, with
  // contour lines.
  function drawRaisedRoad(c, t, rng, opts = {}) {
    const n = t.count;
    const slab = opts.slab || (() => false);
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
    let raised = [];
    for (let i = 0; i < n; i++) if (Math.abs(lift[i]) > 0.3 || Math.abs(lift[(i + 1) % n]) > 0.3) raised.push(i);
    if (opts.only) raised = opts.only;
    else if (opts.skip) raised = raised.filter((i) => !opts.skip.has(i));
    // Bank: stack the road's footprint from the ground to the surface — up
    // for raised ground, down into a pit (where the far bank shows above it).
    for (const i of raised) {
      const la = lift[i];
      const lb = lift[(i + 1) % n];
      const hi = Math.max(0, la, lb);
      if (opts.noBank && opts.noBank.has(i)) continue;
      // Lower than the slab is thick, a deck end needs no slab or bank (it
      // showed as a plank lying across the road).
      if (slab(i) && Math.min(la, lb) < BRIDGE_SLAB) continue;
      if (slab(i)) {
        // A bridge deck: a timber slab with the road running underneath.
        for (let z = Math.min(la, lb) - BRIDGE_SLAB; z < Math.min(la, lb); z += 1) {
          const k = (z - (Math.min(la, lb) - BRIDGE_SLAB)) / BRIDGE_SLAB;
          // A beam: dark along its bottom edge, a groove between planks,
          // lit along the top where it meets the deck.
          const row = Math.floor(k * BRIDGE_SLAB);
          c.fillStyle = row === 0 ? '#3b2a14' : row === BRIDGE_SLAB - 1 ? '#b07a44' : row % 4 === 3 ? '#5a3a1c' : shade('#8a5a30', k * 0.12);
          quad(i, outer, z, z);
          c.fill();
        }
        continue;
      }
      const lo = Math.min(0, la, lb);
      for (let z = lo; z < hi; z += 1) {
        const k = (z - lo) / Math.max(1, hi - lo);
        // Layers of soil every few px of height, darker in a pit.
        const dark = (hi <= 0 ? 0.75 : 1) * (Math.floor(z - lo) % 7 === 5 ? 0.86 : 1);
        c.fillStyle = `rgb(${Math.round((96 + 42 * k) * dark)}, ${Math.round((60 + 30 * k) * dark)}, ${Math.round((28 + 14 * k) * dark)})`;
        const clamp = (l) => (l >= 0 ? Math.min(z, l) : Math.max(z, l));
        quad(i, outer, clamp(la), clamp(lb));
        c.fill();
      }
    }
    // Abutments: where an earth bank meets a bridge deck, the bank ends in
    // a squared stone face across the road (it was cut off on a slant),
    // drawn where it faces the camera.
    if (opts.slab) {
      for (const i of raised) {
        for (const dir of [-1, 1]) {
          const j = (i + dir + n) % n;
          if (!slab(i) || slab(j)) continue;
          // Bank at `j`, deck from `i`: the face looks from j towards i.
          const a = t.samples[j];
          const b = t.samples[i];
          if (b.y - a.y <= 0.5) continue;
          const L = Math.max(lift[i], lift[j]);
          if (L < 4) continue;
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, nx: (a.nx + b.nx) / 2, ny: (a.ny + b.ny) / 2 };
          const P = (w, z) => [m.x + m.nx * w, m.y + m.ny * w - z];
          const face = [P(-outer, L), P(outer, L), P(outer, 0), P(-outer, 0)];
          c.beginPath();
          face.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.closePath();
          c.fillStyle = '#9a8f7c';
          c.fill();
          c.save();
          c.clip();
          // Courses of stone with staggered joints.
          c.strokeStyle = 'rgba(60,45,30,0.45)';
          c.lineWidth = 1;
          for (let z = 0, row = 0; z < L; z += 5, row++) {
            const [x0, y0] = P(-outer, z);
            const [x1, y1] = P(outer, z);
            c.beginPath();
            c.moveTo(x0, y0);
            c.lineTo(x1, y1);
            for (let w = -outer + (row % 2 ? 4 : 9); w < outer; w += 10) {
              const [px, py] = P(w, z);
              c.moveTo(px, py);
              c.lineTo(px, py - 5);
            }
            c.stroke();
          }
          c.fillStyle = 'rgba(0,0,0,0.18)';
          const [gx0, gy0] = P(-outer, 0);
          const [gx1, gy1] = P(outer, 0);
          c.beginPath();
          c.moveTo(gx0, gy0);
          c.lineTo(gx1, gy1);
          c.lineTo(gx1, gy1 - 3);
          c.lineTo(gx0, gy0 - 3);
          c.fill();
          c.restore();
          c.beginPath();
          face.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.closePath();
          c.lineWidth = 1.6 * LINE;
          c.strokeStyle = OUTLINE;
          c.stroke();
        }
      }
    }
    // The raised surface: berm, dirt and the worn centre, like the flat road.
    for (const [w, col] of TRACK_BANDS.map(([bw, bc]) => [t.halfWidth + bw / 2, bc])) {
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 1;
      for (const i of raised) {
        quad(i, w, lift[i], lift[(i + 1) % n]);
        c.fill();
        // (Not where a deck laps over the ramp in the background: the
        // outline would poke past it as a light line.)
        if (!(opts.noBank && opts.noBank.has(i))) c.stroke();
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
      // Contour line (left off on tight curves, where they'd fan out).
      let bend = t.samples[(i + 1) % n].angle - t.samples[i].angle;
      while (bend > Math.PI) bend -= Math.PI * 2;
      while (bend < -Math.PI) bend += Math.PI * 2;
      if (Math.abs(bend) < 0.05 && Math.floor(h / 4) !== Math.floor(h1 / 4)) {
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
    // A sunlit lip along the top of each bank that faces the camera.
    c.strokeStyle = 'rgba(255, 228, 175, 0.6)';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.beginPath();
    for (const i of raised) {
      const a = t.samples[i];
      const b = t.samples[(i + 1) % n];
      if (lift[i] < 3 || lift[(i + 1) % n] < 3) continue;
      for (const side of [-1, 1]) {
        if (side * a.ny < 0.25) continue;
        c.moveTo(a.x + a.nx * side * outer, a.y + a.ny * side * outer - lift[i] + 0.5);
        c.lineTo(b.x + b.nx * side * outer, b.y + b.ny * side * outer - lift[(i + 1) % n] + 0.5);
      }
    }
    c.stroke();
    // Bridge railings along both edges of a deck: posts and a top rail.
    const deck = raised.filter((i) => slab(i));
    if (!deck.length) return;
    const RAIL = 7 * RAISE;
    for (const side of [-1, 1]) {
      const edge = deck.map((i) => {
        const a = t.samples[i];
        return [a.x + a.nx * side * (outer - 2), a.y + a.ny * side * (outer - 2) - lift[i]];
      });
      c.lineCap = 'round';
      c.strokeStyle = OUTLINE;
      c.lineWidth = 3.4 * LINE + 2;
      for (let k = 0; k < edge.length; k += 2) {
        c.beginPath();
        c.moveTo(edge[k][0], edge[k][1]);
        c.lineTo(edge[k][0], edge[k][1] - RAIL);
        c.stroke();
      }
      c.strokeStyle = '#a8743f';
      c.lineWidth = 2.4;
      for (let k = 0; k < edge.length; k += 2) {
        c.beginPath();
        c.moveTo(edge[k][0], edge[k][1]);
        c.lineTo(edge[k][0], edge[k][1] - RAIL);
        c.stroke();
      }
      for (const [w, col] of [[3.4 * LINE + 3, OUTLINE], [3, '#c99258']]) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        edge.forEach(([x, y], k) => (k ? c.lineTo(x, y - RAIL) : c.moveTo(x, y - RAIL)));
        c.stroke();
      }
    }
  }

  // Bridges: the stretch of the upper road that stands over the road
  // underneath (its deck and the ends of its ramps) is drawn each frame in
  // depth order, so vehicles below go under the deck. A deck's `key` is the
  // near (bottom) edge of its slab on the ground: things on the road below
  // and nearer than that are drawn over it, the rest under it.
  const BRIDGE_SLAB = 9;
  function bridgeDecks(t) {
    const TT = root.TractorTracks;
    const n = t.count;
    const outer = t.halfWidth + 13;
    const decks = [];
    for (const b of t.bridges || []) {
      const reach = Math.ceil((b.deck / 2 + TT.BRIDGE.ramp) / TT.SAMPLE_STEP);
      const below = [];
      for (let k = -40; k <= 40; k++) {
        const j = (((b.lower + k) % n) + n) % n;
        below.push([t.samples[j].x, t.samples[j].y - liftAt(t, j)]);
      }
      // The upper road's column, ground to surface, over the road below?
      const over = (i) => {
        const s = t.samples[i];
        const L = liftAt(t, i);
        for (let z = Math.min(0, L); z <= Math.max(0, L) + 6; z += 6) {
          for (const [x, y] of below) if (Math.hypot(s.x - x, s.y - Math.min(z, Math.max(0, L)) - y) < outer * 2) return true;
        }
        return false;
      };
      let lo = 0;
      let hi = 0;
      for (let d = -reach; d <= reach; d++) {
        if (!over((((b.upper + d) % n) + n) % n)) continue;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      const idx = [];
      for (let d = lo - 1; d <= hi + 1; d++) idx.push((((b.upper + d) % n) + n) % n);
      let key = -Infinity;
      for (const i of idx) {
        if (TT.bridgeProfile(t, b, i) < 0.999) continue;
        const s = t.samples[i];
        key = Math.max(key, s.y + Math.abs(s.ny) * outer);
      }
      // Two bridges whose stretches meet are one structure.
      const joined = decks.find((dk) => idx.some((i) => dk.set.has(i)));
      if (joined) {
        for (const i of idx) if (!joined.set.has(i)) joined.idx.push(i);
        idx.forEach((i) => joined.set.add(i));
        joined.key = Math.max(joined.key, key);
        joined.bridges.push(b);
      } else decks.push({ idx, set: new Set(idx), key, bridges: [b] });
    }
    decks.forEach((dk, k) => (dk.k = k));
    for (const dk of decks) {
      // In order along the road.
      const base = dk.bridges[0].upper;
      const rel = (i) => ((((i - base) % n) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
      dk.idx.sort((p, q) => rel(p) - rel(q));
      // The timber deck is only the stretch standing over the road below
      // (on the ground, with a little to spare past its walls); the rest of
      // the upper road at bridge height is an earth bank like any hill.
      // On screen, an earth bank is a column from the ground up to the road;
      // wherever that column would cover the road below (or its walls), the
      // upper road is a timber deck instead.
      const coversLower = (i, b) => {
        const s = t.samples[i];
        const L = liftAt(t, i);
        if (L < 3) return false;
        for (let k = -40; k <= 40; k++) {
          const j = (((b.lower + k) % n) + n) % n;
          const q = t.samples[j];
          const qy = q.y - liftAt(t, j);
          const dx = Math.abs(s.x - q.x) - outer;
          const dy = Math.max(s.y - L - outer - qy, 0, qy - (s.y + outer));
          if (Math.hypot(Math.max(0, dx), dy) < t.halfWidth + 22) return true;
        }
        return false;
      };
      const slabSet = new Set();
      for (const i of dk.idx) if (dk.bridges.some((b) => coversLower(i, b))) slabSet.add(i);
      const isSlab = (i) => slabSet.has(i);
      dk.slab = isSlab;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const i of dk.idx) {
        const s = t.samples[i];
        const L = liftAt(t, i);
        x0 = Math.min(x0, s.x - outer);
        x1 = Math.max(x1, s.x + outer);
        y0 = Math.min(y0, s.y - outer - Math.max(0, L) - 12);
        y1 = Math.max(y1, s.y + outer - Math.min(0, L) + 4);
      }
      dk.box = { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0) + 2, h: Math.ceil(y1 - y0) + 2 };
    }
    return decks;
  }

  // The deck's shadow on the ground and the road beneath, cast like
  // everything else's: the slab's footprint moved right and down by its
  // height.
  function drawDeckShadow(c, t, dk) {
    const outer = t.halfWidth + 13;
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath();
    const n = t.count;
    for (const i of dk.idx) {
      if (!dk.slab(i)) continue;
      const a = t.samples[i];
      const b = t.samples[(i + 1) % n];
      const la = liftAt(t, i);
      const lb = liftAt(t, (i + 1) % n);
      const P = (s, l, w) => [s.x + s.nx * w + l * SHADOW.x, s.y + s.ny * w + l * SHADOW.y];
      const pts = [P(a, la, outer), P(b, lb, outer), P(b, lb, -outer), P(a, la, -outer)];
      // Same winding for every piece, so overlaps don't darken twice.
      const area = pts.reduce((acc, [x, y], k) => acc + x * pts[(k + 1) % 4][1] - pts[(k + 1) % 4][0] * y, 0);
      if (area < 0) pts.reverse();
      pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
    }
    c.fill();
  }

  // Timber trestles holding a deck up: a leg at each edge every few metres,
  // from the ground to the underside of the slab, braced across. None stand
  // on the road below.
  function drawDeckSupports(c, t, dk) {
    const outer = t.halfWidth + 13;
    const slabIdx = dk.idx.filter((i) => dk.slab(i));
    const legs = [];
    for (let k = 0; k < slabIdx.length; k += 5) {
      const i = slabIdx[k];
      const s = t.samples[i];
      const L = liftAt(t, i);
      if (L < BRIDGE_SLAB + 6) continue;
      for (const side of [-1, 1]) {
        const gx = s.x + s.nx * side * (outer - 5);
        const gy = s.y + s.ny * side * (outer - 5);
        if (nearOtherRoad(t, i, gx, gy, t.halfWidth + 24)) continue;
        legs.push({ side, k, x: gx, gy, top: gy - L + BRIDGE_SLAB });
      }
    }
    // Far legs first, so the near ones stand in front.
    legs.sort((p, q) => p.gy - q.gy);
    for (const g of legs) {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.beginPath();
      c.ellipse(g.x + 3, g.gy + 1, 5, 2.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#6b4423';
      c.fillRect(g.x - 2.5, g.top, 5, g.gy - g.top);
      c.fillStyle = 'rgba(255,220,170,0.25)';
      c.fillRect(g.x - 2.5, g.top, 1.6, g.gy - g.top);
      c.strokeStyle = OUTLINE;
      c.lineWidth = 1.4 * LINE;
      c.strokeRect(g.x - 2.5, g.top, 5, g.gy - g.top);
    }
    // Braces between neighbouring legs on the same side.
    c.strokeStyle = '#5a3a1c';
    c.lineWidth = 2;
    for (const g of legs) {
      const next = legs.find((q) => q.side === g.side && q.k === g.k + 5);
      if (!next) continue;
      c.beginPath();
      c.moveTo(g.x, g.top + 2);
      c.lineTo(next.x, next.gy - 4);
      c.moveTo(next.x, next.top + 2);
      c.lineTo(g.x, g.gy - 4);
      c.stroke();
    }
  }

  // Which bridge deck (if any) the thing at sample `i` is up on.
  function deckOf(t, i) {
    if (i === undefined) return null;
    for (const dk of t.decks || []) if (dk.set.has(i)) return dk;
    return null;
  }

  // Jump ramp: a wooden wedge rising towards its lip, with the lip face and
  // the side facing the camera showing.
  const RAMP_H = 8;
  // A point on a ramp: `a` along the road from its centre, `w` across, `h`
  // up. The ramp follows the road's centre line, so on a bend it bends with
  // the road and stays between the walls.
  function rampPoint(t, f) {
    const n = t.count;
    const step = root.TractorTracks.SAMPLE_STEP;
    return (a, w, h = 0) => {
      const u = f.idx + a / step;
      const i0 = Math.floor(u);
      const k = u - i0;
      const s0 = t.samples[((i0 % n) + n) % n];
      const s1 = t.samples[(((i0 + 1) % n) + n) % n];
      const mix = (p, q) => p + (q - p) * k;
      const lift = mix(liftAt(t, ((i0 % n) + n) % n), liftAt(t, (((i0 + 1) % n) + n) % n));
      return [mix(s0.x, s1.x) + mix(s0.nx, s1.nx) * w, mix(s0.y, s1.y) + mix(s0.ny, s1.ny) * w - lift - h * RAISE];
    };
  }
  const RAMP_STEPS = 8;
  // Points along one edge of a ramp from the back to the lip, rising.
  function rampEdge(P, L, w, rise) {
    const pts = [];
    for (let k = 0; k <= RAMP_STEPS; k++) {
      const a = -L / 2 + (L * k) / RAMP_STEPS;
      pts.push(P(a, w, rise ? (RAMP_H * k) / RAMP_STEPS : 0));
    }
    return pts;
  }

  // The ramp's shadow on the road: its footprint plus the lip's shadow,
  // cast the same way as everything else's.
  function drawRampShadow(c, t, f) {
    const L = f.len;
    const hw = f.halfWidth - 2;
    const P = rampPoint(t, f);
    const sh = RAMP_H * RAISE * 1.6;
    const pts = [...rampEdge(P, L, -hw, false), ...rampEdge(P, L, hw, false)];
    for (const w of [-hw, hw]) {
      const [x, y] = P(L / 2, w);
      pts.push([x + sh * SHADOW.x, y + sh * SHADOW.y]);
    }
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    convexHull(pts).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.fill();
  }

  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
      const h = [];
      for (const q of list) {
        while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
        h.push(q);
      }
      h.pop();
      return h;
    };
    return half(p).concat(half(p.slice().reverse()));
  }

  function drawRamp(c, t, f) {
    const L = f.len;
    const hw = f.halfWidth - 2;
    const P = rampPoint(t, f);
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
    // Sides (the near one shows), then the lip face, then the top.
    for (const w of [-hw, hw]) poly([...rampEdge(P, L, w, false), ...rampEdge(P, L, w, true).reverse()], '#7a4f25');
    poly([P(L / 2, -hw, 0), P(L / 2, hw, 0), P(L / 2, hw, RAMP_H), P(L / 2, -hw, RAMP_H)], '#8a5a2b');
    poly([...rampEdge(P, L, -hw, true), ...rampEdge(P, L, hw, true).reverse()], '#d79e5c');
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

  // An ellipse filled with a radial gradient (stops from the centre, 0, to
  // the edge, 1), so it can fade out with no hard rim.
  function softBlob(c, x, y, rx, ry, stops) {
    c.save();
    c.translate(x, y);
    c.scale(rx, ry);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [at, col] of stops) g.addColorStop(at, col);
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawFeature(c, f, rng, lift, t) {
    if (f.type === 'jump') {
      // The ramp itself is drawn each frame, depth-sorted; its shadow is here.
      drawRampShadow(c, t, f);
      return;
    }
    c.save();
    // Sits on the road surface, which may be up a hill.
    c.translate(f.x, f.y - lift);
    c.rotate(f.angle);
    if (f.type === 'mud') {
      const rx = f.len / 2;
      const ry = f.halfWidth;
      // Soft splashed rim fading into the dirt, then the wet mud.
      for (let i = 0; i < 9; i++) {
        const a = rng() * Math.PI * 2;
        const r = 4 + rng() * 5;
        softBlob(c, Math.cos(a) * (rx + 2), Math.sin(a) * (ry + 1), r, r, [[0, 'rgba(100,65,30,0.45)'], [1, 'rgba(100,65,30,0)']]);
      }
      softBlob(c, 0, 0, rx + 10, ry + 8, [[0.6, 'rgba(110,72,36,0.7)'], [1, 'rgba(110,72,36,0)']]);
      softBlob(c, 0, 0, rx + 2, ry + 2, [[0, '#6e4824'], [0.7, '#4a2e14'], [0.88, 'rgba(74,46,20,0.85)'], [1, 'rgba(74,46,20,0)']]);
      c.save();
      c.beginPath();
      c.ellipse(0, 0, rx * 0.85, ry * 0.8, 0, 0, Math.PI * 2);
      c.clip();
      c.strokeStyle = 'rgba(40,22,8,0.55)';
      c.lineWidth = 3;
      for (const w of [-ry * 0.35, ry * 0.3]) {
        c.beginPath();
        c.moveTo(-rx, w);
        c.bezierCurveTo(-rx * 0.3, w + 3, rx * 0.3, w - 3, rx, w);
        c.stroke();
      }
      c.restore();
      c.fillStyle = 'rgba(255,240,220,0.22)';
      c.beginPath();
      c.ellipse(-rx * 0.25, -ry * 0.35, rx * 0.45, ry * 0.18, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,240,220,0.35)';
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        circle(c, (rng() - 0.5) * rx * 1.2, (rng() - 0.5) * ry, 1.5 + rng() * 2);
        c.stroke();
      }
    } else if (f.type === 'water') {
      const rx = f.len / 2;
      const ry = f.halfWidth;
      // Damp muddy bank fading into the dirt, shallows fading into the
      // bank, deeper blue in the middle, ripples and a sparkle.
      softBlob(c, 0, 0, rx + 10, ry + 8, [[0.55, 'rgba(138,106,61,0.85)'], [1, 'rgba(138,106,61,0)']]);
      softBlob(c, 0, 0, rx + 2, ry + 2, [[0, '#2f86c4'], [0.6, '#4fa9dc'], [0.82, '#8fd3f2'], [1, 'rgba(160,215,235,0)']]);
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse((rng() - 0.5) * rx, (rng() - 0.5) * ry * 0.8, 6 + rng() * 6, 2, 0, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.beginPath();
      c.ellipse(-rx * 0.35, -ry * 0.4, 4, 1.5, 0, 0, Math.PI * 2);
      c.fill();
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
    ctx.ellipse(3, 5, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, -6 + bob);
    if (p.type === 'cash') {
      // A fat sack: darker back half below, the front on top, tied at the neck.
      const sack = (dy) => {
        ctx.beginPath();
        ctx.moveTo(-10, 8 + dy);
        ctx.quadraticCurveTo(-14, -4 + dy, -4, -8 + dy);
        ctx.lineTo(4, -8 + dy);
        ctx.quadraticCurveTo(14, -4 + dy, 10, 8 + dy);
        ctx.quadraticCurveTo(0, 12 + dy, -10, 8 + dy);
        ctx.closePath();
      };
      sack(3);
      ctx.fillStyle = '#a8864f';
      ctx.fill();
      sack(0);
      fillStroke(ctx, '#d9b77a', 2);
      ctx.beginPath();
      ctx.ellipse(0, -9, 5, 2.4, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#7a5a2a', 1.4);
      ctx.fillStyle = '#2e8b3a';
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 2);
    } else {
      // Nitro can: a red cylinder with an oval lid and a nozzle.
      const R = 6.5;
      const top = -10;
      const bot = 8;
      ctx.beginPath();
      ctx.moveTo(-R, top);
      ctx.lineTo(-R, bot);
      ctx.ellipse(0, bot, R, R * OVAL, 0, Math.PI, 0, true);
      ctx.lineTo(R, top);
      ctx.closePath();
      const g = ctx.createLinearGradient(-R, 0, R, 0);
      g.addColorStop(0, '#a8281c');
      g.addColorStop(0.35, '#f0503c');
      g.addColorStop(1, '#9a2418');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2 * LINE;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, top, R, R * OVAL, 0, 0, Math.PI * 2);
      fillStroke(ctx, '#ff7a64', 1.6);
      ctx.fillStyle = '#555';
      ctx.fillRect(-2, top - 5, 4, 4);
      ctx.fillStyle = '#fff';
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', 0, 1);
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
    // Cast like everything else's, further away the higher it flies.
    const h = 8 + r.z;
    ctx.translate(r.x + h * SHADOW.x, r.y + h * SHADOW.y - (r.elev || 0) * RAISE);
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
    // Light from the top left of the screen, whichever way the vehicle faces.
    // (The screen's light direction (-0.6, -0.8) turned into its frame.)
    const lit = { x: -0.6 * Math.cos(body) - 0.8 * Math.sin(body), y: 0.6 * Math.sin(body) - 0.8 * Math.cos(body) };
    const art = r.vehicle === 'quad' ? drawQuadBody : r.vehicle === 'motorbike' ? drawBikeBody : drawTractorBody;
    art(ctx, r, lit);
    ctx.restore();
  }

  // A panel filled with `col`, lit from `lit` (a unit vector in the
  // vehicle's own frame pointing towards the light): lighter on that side,
  // darker on the far side. `len` is about half the panel's size.
  function litPaint(ctx, col, lit, len, amt = 0.16, cx = 0, cy = 0) {
    const g = ctx.createLinearGradient(cx + lit.x * len, cy + lit.y * len, cx - lit.x * len, cy - lit.y * len);
    g.addColorStop(0, shade(col, amt));
    g.addColorStop(0.5, col);
    g.addColorStop(1, shade(col, -amt));
    return g;
  }

  // `at` is the panel's centre [x, y], where its gradient is anchored.
  function paint(ctx, col, lit, len, lw = 2.2, amt = 0.16, at = [0, 0]) {
    ctx.fillStyle = litPaint(ctx, col, lit, len, amt, at[0], at[1]);
    ctx.fill();
    ctx.lineWidth = lw * LINE;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  // A chunky tyre seen from above, centred at (x, y), `w` long and `h`
  // wide: dark rubber, chevron lugs that roll with the distance driven,
  // and a lighter sidewall edge on the outside.
  function tyre(ctx, x, y, w, h, angle, r, side = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) / 2.6);
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const step = Math.max(2.6, w / 4.2);
    const spin = ((r.progress || 0) / 2.2) % step;
    ctx.fillStyle = '#4a4a4a';
    for (let i = -w / 2 - step + spin; i < w / 2 + step; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, -h / 2);
      ctx.lineTo(i + step * 0.45, 0);
      ctx.lineTo(i, h / 2);
      ctx.lineTo(i - step * 0.35, h / 2);
      ctx.lineTo(i + step * 0.1, 0);
      ctx.lineTo(i - step * 0.35, -h / 2);
      ctx.closePath();
      ctx.fill();
    }
    // Sidewall: a lighter edge along the outside, shade along the inside.
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(-w / 2, side > 0 ? h / 2 - 1.4 : -h / 2, w, 1.4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-w / 2, side > 0 ? -h / 2 : h / 2 - 1.2, w, 1.2);
    ctx.restore();
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) / 2.6);
    ctx.lineWidth = 1.8 * LINE;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.restore();
  }

  // A glossy highlight: a soft white streak.
  function gloss(ctx, x, y, w, h, a = 0.45) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
    ctx.fill();
  }

  // Tractor, facing +x: big lugged rear wheels under curved mudguards, a cab
  // with a glass front and a white roof, a long bonnet with a grille and
  // headlights, and an exhaust stack.
  function drawTractorBody(ctx, r, lit) {
    const col = r.color;
    for (const side of [-1, 1]) tyre(ctx, -9, side * 11.5, 16, 9, 0, r, side);
    for (const side of [-1, 1]) tyre(ctx, 11, side * 9, 9, 6, r.steer * 0.45, r, side);
    // Front axle.
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(10, -8, 2.5, 16);
    // Bonnet: body colour with a raised centre ridge and louvres.
    roundRect(ctx, -4, -6, 22, 12, 4);
    paint(ctx, col, lit, 9, 2.2, 0.16, [7, 0]);
    ctx.fillStyle = shade(col, 0.2);
    roundRect(ctx, -2, -1.6, 18, 3.2, 1.6);
    ctx.fill();
    // Grille and headlights.
    roundRect(ctx, 15.5, -4.5, 3.5, 9, 1.2);
    ctx.fillStyle = '#3b3b3b';
    ctx.fill();
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 0.7;
    for (const gy of [-3, -1, 1, 3]) {
      ctx.beginPath();
      ctx.moveTo(16, gy);
      ctx.lineTo(18.5, gy);
      ctx.stroke();
    }
    for (const side of [-1, 1]) {
      circle(ctx, 16.8, side * 5.2, 1.7);
      fillStroke(ctx, '#fff6c8', 1.2);
    }
    // Mudguards over the rear wheels, in the body colour.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-14.5, side * 8.5);
      ctx.quadraticCurveTo(-14.5, side * 14.8, -9, side * 15);
      ctx.quadraticCurveTo(-3.5, side * 14.8, -3.5, side * 8.5);
      ctx.closePath();
      paint(ctx, col, lit, 6, 1.8, 0.16, [-9, side * 12]);
      gloss(ctx, -12, side * 12 - 0.8, 5, 1.4, 0.35);
    }
    // Cab: body-coloured base, glass all round, white roof on top.
    roundRect(ctx, -17, -9, 15, 18, 3);
    paint(ctx, shade(col, -0.12), lit, 9, 2.2, 0.16, [-9.5, 0]);
    roundRect(ctx, -15.8, -7.8, 12.6, 15.6, 2.4);
    const glass = ctx.createLinearGradient(-16, -8, -3, 8);
    glass.addColorStop(0, '#bfe6f5');
    glass.addColorStop(1, '#5fa8c8');
    ctx.fillStyle = glass;
    ctx.fill();
    roundRect(ctx, -15.2, -7, 10.8, 14, 2.2);
    ctx.fillStyle = litPaint(ctx, '#f4efe2', lit, 8, 0.1, -9.8, 0);
    ctx.fill();
    ctx.lineWidth = 1.2 * LINE;
    ctx.strokeStyle = 'rgba(59,42,20,0.6)';
    ctx.stroke();
    gloss(ctx, -13.5, -5.5, 6, 2, 0.6);
    // Roof stripe: yellow on yours.
    ctx.fillStyle = r.isPlayer ? '#ffd23f' : shade(col, 0.05);
    roundRect(ctx, -14, -1.6, 8.4, 3.2, 1.4);
    ctx.fill();
    // Exhaust stack: chrome with a dark mouth.
    circle(ctx, 4, -4, 2.5);
    ctx.fillStyle = litPaint(ctx, '#c9c9c9', lit, 2.5, 0.25, 4, -4);
    ctx.fill();
    ctx.lineWidth = 1.4 * LINE;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    circle(ctx, 4, -4, 1.2);
    ctx.fillStyle = '#222';
    ctx.fill();
  }

  function rider(ctx, r, x, lean, lit) {
    // Shoulders and arms reaching to the bars, then a helmet with a stripe
    // and a visor.
    ctx.save();
    ctx.translate(x, lean);
    ctx.beginPath();
    ctx.ellipse(-1, 0, 5, 7.5, 0, 0, Math.PI * 2);
    paint(ctx, r.isPlayer ? '#2f6fd0' : '#4a4a4a', lit, 6, 1.8);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1, -5);
    ctx.lineTo(9, -6.5 - lean * 0.3);
    ctx.moveTo(1, 5);
    ctx.lineTo(9, 6.5 - lean * 0.3);
    ctx.stroke();
    ctx.strokeStyle = r.isPlayer ? '#2f6fd0' : '#5a5a5a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const helmet = r.isPlayer ? '#ffd23f' : r.color;
    circle(ctx, 0, 0, 5);
    paint(ctx, helmet, lit, 5, 2, 0.22);
    ctx.save();
    circle(ctx, 0, 0, 5);
    ctx.clip();
    ctx.fillStyle = r.isPlayer ? '#e2412f' : '#fff';
    ctx.fillRect(-6, -1, 12, 2);
    ctx.restore();
    roundRect(ctx, 2, -3.4, 2.8, 6.8, 1.4);
    ctx.fillStyle = '#263238';
    ctx.fill();
    gloss(ctx, -3, -3.6, 3, 1.4, 0.55);
    ctx.restore();
  }

  // Quad bike, facing +x: four fat tyres under mudguards, a chunky body with
  // a padded seat, tubular racks front and back, and a headlight.
  function drawQuadBody(ctx, r, lit) {
    const col = r.color;
    tyre(ctx, -9, -10, 10, 6, 0, r, -1);
    tyre(ctx, -9, 10, 10, 6, 0, r, 1);
    tyre(ctx, 11, -9.5, 9, 5.5, r.steer * 0.45, r, -1);
    tyre(ctx, 11, 9.5, 9, 5.5, r.steer * 0.45, r, 1);
    // Racks: a frame of tubes.
    for (const [x0, w] of [[-17.5, 7], [12.5, 6]]) {
      roundRect(ctx, x0, -6.5, w, 13, 2);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#8c8c8c';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + w / 2, -6.5);
      ctx.lineTo(x0 + w / 2, 6.5);
      ctx.stroke();
    }
    // Body and the mudguards over each wheel.
    roundRect(ctx, -12, -8, 26, 16, 6);
    paint(ctx, col, lit, 12, 2.2, 0.16, [1, 0]);
    for (const [x, side] of [[-9, -1], [-9, 1], [11, -1], [11, 1]]) {
      ctx.beginPath();
      ctx.ellipse(x, side * 7.6, 5, 2.4, 0, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI : Math.PI * 2);
      ctx.closePath();
      paint(ctx, col, lit, 5, 1.6, 0.16, [x, side * 8.4]);
    }
    gloss(ctx, 4, -5.5, 8, 2, 0.4);
    // Headlight.
    roundRect(ctx, 12, -2.5, 2.4, 5, 1.2);
    fillStroke(ctx, '#fff6c8', 1.2);
    // Seat: padded with a seam.
    roundRect(ctx, -10, -4.2, 11, 8.4, 3.4);
    paint(ctx, '#2b2b2b', lit, 5, 1.5, 0.12, [-4.5, 0]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-8.5, 0);
    ctx.lineTo(-0.5, 0);
    ctx.stroke();
    // Handlebars turn with the steering.
    ctx.save();
    ctx.translate(8, 0);
    ctx.rotate(r.steer * 0.3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.strokeStyle = '#c9c9c9';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = '#1e1e1e';
    for (const gy of [-8, 8]) {
      roundRect(ctx, -1.4, gy - 1.8, 2.8, 3.6, 1);
      ctx.fill();
    }
    ctx.restore();
    rider(ctx, r, -3, r.steer * 1.5, lit);
  }

  // Motorbike, facing +x: two wheels in line under mudguards, a slim body
  // with a shiny tank, a chrome exhaust, and a rider who leans into turns.
  function drawBikeBody(ctx, r, lit) {
    const col = r.color;
    const lean = r.steer * 4 + (r.drift || 0) * 3;
    tyre(ctx, -13, 0, 13, 5, 0, r);
    tyre(ctx, 14, 0, 12, 4.5, r.steer * 0.35, r);
    // Mudguards.
    for (const [x, w] of [[-12, 5.5], [13.5, 5]]) {
      roundRect(ctx, x - w / 2, -2.4, w, 4.8, 2.4);
      paint(ctx, col, lit, 4, 1.4, 0.16, [x, 0]);
    }
    // Swingarm and exhaust.
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(-13, -1.2, 10, 2.4);
    roundRect(ctx, -17, 3, 13, 3.2, 1.6);
    paint(ctx, '#d0d0d0', lit, 6, 1.2, 0.28, [-10.5, 4.6]);
    circle(ctx, -17, 4.6, 1);
    ctx.fillStyle = '#333';
    ctx.fill();
    // Body and tank.
    roundRect(ctx, -8, -4.5, 20, 9, 4);
    paint(ctx, col, lit, 9, 2.2, 0.16, [2, 0]);
    ctx.beginPath();
    ctx.ellipse(5.5, 0, 5, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(col, 0.16);
    ctx.fill();
    gloss(ctx, 3, -2.6, 5, 1.6, 0.6);
    // Number plate.
    roundRect(ctx, 10, -3.5, 4.5, 7, 2);
    fillStroke(ctx, '#fff', 1.3);
    ctx.fillStyle = col;
    ctx.fillRect(11.6, -2.4, 1.4, 4.8);
    // Bars.
    ctx.save();
    ctx.translate(10, 0);
    ctx.rotate(r.steer * 0.35);
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.strokeStyle = '#c9c9c9';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    rider(ctx, r, -2, lean, lit);
  }

  // Where the flagman stands: beside the start line, on whichever side is on
  // screen and clear of road, at the height of the ground there.
  function flagmanSpot(t) {
    if (t.flagman) return t.flagman;
    const s0 = t.samples[0];
    const groundAt = (x, y) => (t.terrain ? root.TractorTracks.terrainHeight(t.terrain, x, y) : 0);
    let best = null;
    for (const side of [-1, 1]) {
      for (const off of [t.halfWidth + 30, t.halfWidth + 40]) {
        const x = s0.x + s0.nx * off * side;
        const y = s0.y + s0.ny * off * side;
        const lift = groundAt(x, y) * RAISE;
        const stand = x > 290 && x < 910 && y - lift < 66; // the grandstand
        const inside = x > 20 && x < W - 20 && y - lift > 40 && y < H - 12 && !stand;
        if (inside && !onSurface(t, x, y, t.halfWidth + 18)) {
          best = { x, y, lift };
          break;
        }
      }
      if (best) break;
    }
    t.flagman = best || { x: s0.x - s0.nx * (t.halfWidth + 30), y: s0.y - s0.ny * (t.halfWidth + 30), lift: 0 };
    return t.flagman;
  }

  function drawFlagman(ctx, sim, view, now) {
    const { x, y, lift } = flagmanSpot(sim.track);
    ctx.save();
    ctx.translate(x, y - lift);
    // Standing figure: shadow, legs, body, then head, seen from above-front.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(3, 2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(-3.5, -7, 3, 7);
    ctx.fillRect(0.5, -7, 3, 7);
    roundRect(ctx, -5.5, -17, 11, 11, 3.5);
    fillStroke(ctx, '#2f7de2', 2);
    circle(ctx, 0, -20, 4.5);
    fillStroke(ctx, '#f2c9a0', 1.5);
    ctx.fillStyle = '#e2412f';
    ctx.beginPath();
    ctx.ellipse(0, -22.5, 4.6, 2.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.translate(4, -14);
    const wave = Math.sin(now / 120) * 0.6;
    let color = '#2fae4a';
    if (view.countdown > 0) color = view.countdown > 1 ? '#e2412f' : '#f4c20d';
    if (view.finalLap) color = '#fff';
    if (view.chequered) color = 'chequer';
    ctx.rotate(-1.1 + (view.countdown > 0 ? 0 : wave * 0.7));
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    if (color === 'chequer') {
      for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
        ctx.fillStyle = (i + k) % 2 ? '#222' : '#fff';
        ctx.fillRect(10 + i * 4, 1 + k * 4, 4, 4);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(10, 1, 12, 8);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeRect(10, 1, 12, 8);
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
