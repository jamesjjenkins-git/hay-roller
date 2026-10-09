// Tractor Rally — race simulation: tractor physics, walls, surfaces, jumps,
// pickups, AI drivers and lap counting. No DOM here; the renderer only reads.
(function (root) {
  const Tracks = root.TractorTracks || require('./tracks.js');
  const FarmRng = root.FarmRng || require('../rng.js');

  const DT = 1 / 60;
  const RADIUS = 13;
  const MAX_TIME = 240;

  // Base tractor. Four upgrades (0..5 each) improve it:
  // accel, speed (top speed), handling (tighter turns + grip), boost (nitros).
  function statsFor(upgrades) {
    const u = { accel: 0, speed: 0, handling: 0, boost: 0, ...upgrades };
    return {
      topSpeed: 165 + u.speed * 17,
      accel: 150 + u.accel * 26,
      grip: 6.5 + u.handling * 1.3,
      turnRate: 3.5 + u.handling * 0.33,
      // How well it copes with mud, water and bumps (0 = badly, 1 = barely notices).
      rough: 0.35,
      nitros: 2 + u.boost,
    };
  }

  // AI rivals get tougher on later tracks and as the player upgrades.
  // AI rivals get tougher on later tracks and as the player upgrades.
  // `pace` scales their speed: on the first track they are clearly slower than
  // a stock tractor (they drive cleaner lines than a thumb can), reaching full
  // pace (a touch above a stock tractor's) by the last track.
  const AI_PACE_MIN = 0.89;
  const AI_PACE_MAX = 0.96;
  function aiStats(track, playerLevel, index) {
    const skill = track.aiSkill + Math.min(0.5, playerLevel * 0.025);
    const spread = [1.0, 0.96, 0.92][index % 3];
    const lv = Math.max(0, Math.min(5, skill * 5 * spread));
    const st = statsFor({ accel: lv, speed: lv, handling: lv, boost: Math.round(lv / 2) });
    // Pace keeps rising a little past skill 1 so late tracks stay a fight
    // for a well-upgraded tractor.
    const pace = (AI_PACE_MIN + (AI_PACE_MAX - AI_PACE_MIN) * Math.min(1.3, skill)) * (0.98 + spread * 0.02);
    st.topSpeed *= pace;
    st.accel *= pace;
    return st;
  }

  // Walls: glance off rather than stick. bounce = fraction of the inward
  // speed reflected; align = how much the nose turns along the wall per
  // contact frame; loss = speed lost on a head-on knock; scrape = friction
  // per second while sliding along.
  const WALL = { bounce: 0.2, align: 0.35, loss: 0.18, scrape: 0.35 };

  // Straight-line assist for touch steering (radians, radians/second).
  const ASSIST = { maxAngle: 0.5, rate: 1.4 };

  // Rubber banding, player only: if you drop well behind the tractor directly
  // ahead, you get a gentle boost that fades as you close back up behind it.
  // It never helps you past anyone — only back into the fight.
  const CATCHUP = { startGap: 140, fullGap: 420, maxBoost: 0.16 };
  function catchUpBoost(s, r) {
    if (!r.isPlayer || r.finished) return 0;
    let gap = Infinity;
    for (const o of s.racers) {
      if (o === r) continue;
      const ahead = (o.finished ? s.laps * s.track.length : o.progress) - r.progress;
      if (ahead > 0 && ahead < gap) gap = ahead;
    }
    if (!isFinite(gap) || gap <= CATCHUP.startGap) return 0;
    const t = Math.min(1, (gap - CATCHUP.startGap) / (CATCHUP.fullGap - CATCHUP.startGap));
    return CATCHUP.maxBoost * t;
  }

  const DRIVERS = [
    { name: 'You', color: '#e2412f' },
    { name: 'Farmer Giles', color: '#2f7de2' },
    { name: 'Old MacDonald', color: '#2fae4a' },
    { name: 'Daisy Dukes', color: '#f4c20d' },
  ];

  function createRace(trackDef, { seed = 1, playerUpgrades = {}, playerColor, playerLevel = 0, laps } = {}) {
    const track = trackDef.samples ? trackDef : Tracks.buildTrack(trackDef);
    const rng = FarmRng.mulberry32(seed);
    const start = track.samples[0];
    const totalLaps = laps || track.laps;

    // Rivals keep their colours unless one is too close to the player's paint.
    const colors = DRIVERS.map((d) => d.color);
    if (playerColor) {
      colors[0] = playerColor;
      const spare = ['#e2412f', '#8e44c9', '#f07c1b', '#2fae4a', '#f4c20d', '#2f7de2', '#ffffff'];
      for (let i = 1; i < colors.length; i++) {
        if (colorDistance(colors[i], playerColor) < 90) {
          colors[i] = spare.find((c) => colors.every((u) => colorDistance(u, c) >= 90));
        }
      }
    }

    // 2x2 grid behind the start line.
    const racers = DRIVERS.map((d, i) => {
      const back = 34 + Math.floor(i / 2) * 44;
      const side = (i % 2 ? 1 : -1) * track.halfWidth * 0.45;
      const x = start.x - start.tx * back + start.nx * side;
      const y = start.y - start.ty * back + start.ny * side;
      const isPlayer = i === 0;
      const stats = isPlayer ? statsFor(playerUpgrades) : aiStats(track, playerLevel, i - 1);
      return {
        id: i,
        name: d.name,
        color: colors[i],
        isPlayer,
        stats,
        x,
        y,
        vx: 0,
        vy: 0,
        heading: start.angle,
        steer: 0,
        idx: Tracks.nearestGlobal(track, x, y),
        progress: 0,
        lap: 0,
        lapStart: null,
        lapTimes: [],
        finished: false,
        finishTime: null,
        place: null,
        nitros: stats.nitros,
        nitroTime: 0,
        z: 0,
        vz: 0,
        airborne: false,
        surface: 'dirt',
        bump: 0,
        wallHit: 0,
        cash: 0,
        // AI personality
        lineOffset: isPlayer ? 0 : (rng() - 0.5) * track.halfWidth * 0.6,
        mistakeTimer: 1 + rng() * 3,
        wobble: 0,
      };
    });
    // Progress is measured from the start line; the grid sits just behind it.
    for (const r of racers) r.progress = -signedBehind(track, r);

    return {
      track,
      rng,
      t: 0,
      laps: totalLaps,
      racers,
      pickups: [],
      nextPickupAt: 2,
      pickupId: 1,
      finishOrder: [],
      events: [],
      done: false,
    };
  }

  function colorDistance(a, b) {
    const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [n(a), n(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }

  function signedBehind(track, r) {
    const s = track.samples[0];
    return -((r.x - s.x) * s.tx + (r.y - s.y) * s.ty);
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---------- AI ----------

  function aiInput(s, r) {
    const { track } = s;
    const speed = Math.hypot(r.vx, r.vy);
    const look = Math.round((50 + speed * 0.35) / Tracks.SAMPLE_STEP);
    const target = track.samples[(r.idx + look) % track.count];

    // Ease off the racing line near others to avoid pile-ups.
    let offset = r.lineOffset;
    for (const o of s.racers) {
      if (o === r) continue;
      const dx = o.x - r.x;
      const dy = o.y - r.y;
      const d = Math.hypot(dx, dy);
      if (d < 60) {
        const side = dx * target.nx + dy * target.ny;
        offset -= Math.sign(side || 1) * (60 - d) * 0.5;
      }
    }
    offset = Math.max(-track.halfWidth * 0.55, Math.min(track.halfWidth * 0.55, offset));
    const tx = target.x + target.nx * offset;
    const ty = target.y + target.ny * offset;
    const want = Math.atan2(ty - r.y, tx - r.x);
    let steer = Math.max(-1, Math.min(1, angleDiff(want, r.heading) * 2.4));

    // Brake for sharp bends coming up.
    const far = track.samples[(r.idx + Math.round(150 / Tracks.SAMPLE_STEP)) % track.count];
    const bend = Math.abs(angleDiff(far.angle, track.samples[r.idx].angle));
    let throttle = 1;
    if (bend > 1.0 && speed > r.stats.topSpeed * 0.7) throttle = 0.25;
    else if (bend > 0.6 && speed > r.stats.topSpeed * 0.85) throttle = 0.6;

    // Occasional human-ish wobble.
    r.mistakeTimer -= DT;
    if (r.mistakeTimer <= 0) {
      r.wobble = (s.rng() - 0.5) * 0.7;
      r.mistakeTimer = 2 + s.rng() * 4;
    }
    r.wobble *= 0.97;
    steer = Math.max(-1, Math.min(1, steer + r.wobble));

    // Nitro on straights.
    const nitro = r.nitros > 0 && r.nitroTime <= 0 && bend < 0.25 && speed > r.stats.topSpeed * 0.6 && s.rng() < 0.01;
    return { steer, throttle, brake: 0, nitro };
  }

  // ---------- Physics ----------

  function surfaceAt(s, r) {
    for (const f of s.track.features) {
      if ((f.type === 'mud' || f.type === 'water' || f.type === 'bumps') && Tracks.inFeature(f, r.x, r.y)) return f.type;
    }
    return 'dirt';
  }

  function stepRacer(s, r, input) {
    const st = r.stats;
    const fx = Math.cos(r.heading);
    const fy = Math.sin(r.heading);
    let vf = r.vx * fx + r.vy * fy;
    let vl = -r.vx * fy + r.vy * fx;
    const speed = Math.abs(vf);

    if (input.nitro && r.nitros > 0 && r.nitroTime <= 0 && !r.finished) {
      r.nitros--;
      r.nitroTime = 1.6;
      s.events.push({ type: 'nitro', id: r.id });
    }
    const boosting = r.nitroTime > 0;
    if (boosting) r.nitroTime -= DT;

    r.surface = r.airborne ? 'air' : surfaceAt(s, r);
    let topMul = 1;
    let gripMul = 1;
    if (r.surface === 'mud') {
      topMul = 0.45 + st.rough * 0.45;
      gripMul = 0.45;
    } else if (r.surface === 'water') {
      topMul = 0.55 + st.rough * 0.35;
      gripMul = 0.35;
    } else if (r.surface === 'bumps') {
      topMul = 0.75 + st.rough * 0.25;
      r.bump = Math.max(r.bump, 0.6 * (1 - st.rough * 0.7));
    }
    r.catchUp = catchUpBoost(s, r);
    const top = st.topSpeed * topMul * (boosting ? 1.45 : 1) * (1 + r.catchUp);
    const accel = st.accel * (boosting ? 2 : 1) * (1 + r.catchUp);

    if (!r.airborne) {
      if (input.throttle > 0) {
        if (vf < top) vf += accel * input.throttle * DT * (1 - Math.max(0, vf) / (top * 1.05));
        else vf += (top - vf) * 2 * DT;
      }
      if (input.brake > 0) {
        if (vf > 10) vf -= 320 * input.brake * DT;
        else vf -= 120 * input.brake * DT; // reverse
        vf = Math.max(vf, -st.topSpeed * 0.4);
      }
      if (input.throttle <= 0 && input.brake <= 0) vf -= vf * 1.2 * DT;
      vl *= Math.exp(-st.grip * gripMul * DT);
      // Turning scrubs off a little speed, which tightens the line through corners.
      vf -= vf * Math.abs(r.steer) * 0.8 * DT;

      // Turning: tractors can pivot slowly even when stopped.
      const turnFactor = Math.min(1, 0.4 + speed / (st.topSpeed * 0.5));
      const dir = vf < -5 ? -1 : 1;
      // Ease into a turn, but stop turning straight away when the input
      // returns to centre, so there's no carry-over that causes overshoot.
      const easing = Math.abs(input.steer) < Math.abs(r.steer) ? 45 : 32;
      r.steer += (input.steer - r.steer) * Math.min(1, easing * DT);
      r.heading += r.steer * st.turnRate * turnFactor * dir * DT;

      // Straight-line assist (player option): with no steering input, gently
      // line the nose up with the road ahead — only when already nearly
      // aligned, so it never fights a deliberate turn or recovery.
      if (input.assist && Math.abs(input.steer) < 0.05 && speed > 30 && dir > 0) {
        const ahead = s.track.samples[(r.idx + 5) % s.track.count];
        const err = angleDiff(ahead.angle, r.heading);
        if (Math.abs(err) < ASSIST.maxAngle) {
          r.heading += Math.sign(err) * Math.min(Math.abs(err), ASSIST.rate * DT);
        }
      }
    }

    const nfx = Math.cos(r.heading);
    const nfy = Math.sin(r.heading);
    r.vx = nfx * vf - nfy * vl;
    r.vy = nfy * vf + nfx * vl;
    r.x += r.vx * DT;
    r.y += r.vy * DT;

    // Jumps launch you into the air.
    if (!r.airborne) {
      for (const f of s.track.features) {
        if (f.type !== 'jump' || !Tracks.inFeature(f, r.x, r.y)) continue;
        const along = r.vx * Math.cos(f.angle) + r.vy * Math.sin(f.angle);
        if (along > 60) {
          r.airborne = true;
          r.vz = 70 + along * 0.55;
          s.events.push({ type: 'jump', id: r.id });
        }
      }
    }
    if (r.airborne) {
      r.z += r.vz * DT;
      r.vz -= 520 * DT;
      if (r.z <= 0) {
        r.z = 0;
        r.airborne = false;
        const hard = Math.max(0, -r.vz - 120) / 200;
        const loss = 1 - hard * (0.3 - st.rough * 0.25);
        r.vx *= loss;
        r.vy *= loss;
        r.bump = Math.max(r.bump, 0.8);
        s.events.push({ type: 'land', id: r.id, x: r.x, y: r.y });
      }
    }
    r.bump = Math.max(0, r.bump - DT * 3);

    // Walls.
    r.idx = Tracks.nearest(s.track, r.x, r.y, r.idx);
    const c = s.track.samples[r.idx];
    const lat = (r.x - c.x) * c.nx + (r.y - c.y) * c.ny;
    const limit = s.track.halfWidth - RADIUS;
    if (Math.abs(lat) > limit) {
      const side = Math.sign(lat);
      r.x -= c.nx * (lat - side * limit);
      r.y -= c.ny * (lat - side * limit);
      const vn = r.vx * c.nx + r.vy * c.ny;
      if (vn * side > 0) {
        // Glance off: keep the speed along the wall, a small bounce outward.
        const speed = Math.hypot(r.vx, r.vy) || 1;
        const headOn = Math.min(1, Math.abs(vn) / speed); // 0 = grazing, 1 = straight in
        r.vx -= c.nx * vn * (1 + WALL.bounce);
        r.vy -= c.ny * vn * (1 + WALL.bounce);
        // Steer the nose along the wall so the throttle doesn't keep pushing
        // you back into it.
        const along = Math.atan2(c.ty, c.tx);
        const tangent = Math.abs(angleDiff(along, r.heading)) < Math.PI / 2 ? along : along + Math.PI;
        const intoWall = (Math.cos(r.heading) * c.nx + Math.sin(r.heading) * c.ny) * side > 0;
        if (intoWall) r.heading += angleDiff(tangent, r.heading) * WALL.align;
        // One small speed penalty per knock, bigger the more head-on it was.
        if (r.wallHit <= 0) {
          const keep = 1 - WALL.loss * (0.35 + 0.65 * headOn);
          r.vx *= keep;
          r.vy *= keep;
          r.wallHit = 0.3;
          if (Math.abs(vn) > 40) {
            s.events.push({ type: 'wall', id: r.id, x: r.x + c.nx * side * RADIUS, y: r.y + c.ny * side * RADIUS, power: Math.abs(vn) });
          }
        } else {
          // Scraping along: a little friction, never a dead stop.
          r.vx *= 1 - WALL.scrape * DT;
          r.vy *= 1 - WALL.scrape * DT;
        }
      }
    }
    r.wallHit = Math.max(0, r.wallHit - DT);
  }

  function collideRacers(s) {
    const rs = s.racers;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        if (Math.abs(a.z - b.z) > 14) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = RADIUS * 2;
        if (d >= min || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const j2 = -rel * 0.75;
          a.vx -= nx * j2;
          a.vy -= ny * j2;
          b.vx += nx * j2;
          b.vy += ny * j2;
          if (rel < -50) s.events.push({ type: 'bang', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
  }

  // ---------- Pickups ----------

  function updatePickups(s) {
    const { track, rng } = s;
    if (s.t >= s.nextPickupAt && s.pickups.length < 3) {
      const idx = Math.floor(rng() * track.count);
      const sm = track.samples[idx];
      const off = (rng() - 0.5) * track.halfWidth * 1.1;
      s.pickups.push({
        id: s.pickupId++,
        type: rng() < 0.55 ? 'cash' : 'nitro',
        value: 25 + Math.floor(rng() * 4) * 25,
        x: sm.x + sm.nx * off,
        y: sm.y + sm.ny * off,
        born: s.t,
      });
      s.nextPickupAt = s.t + 3 + rng() * 4;
    }
    s.pickups = s.pickups.filter((p) => {
      if (s.t - p.born > 14) return false;
      for (const r of s.racers) {
        if (r.airborne || r.finished) continue;
        if (Math.hypot(r.x - p.x, r.y - p.y) < RADIUS + 12) {
          if (p.type === 'cash') r.cash += p.value;
          else r.nitros = Math.min(9, r.nitros + 1);
          s.events.push({ type: 'pickup', id: r.id, kind: p.type, value: p.value, x: p.x, y: p.y });
          return false;
        }
      }
      return true;
    });
  }

  // ---------- Laps ----------

  function updateProgress(s, r, prevIdx) {
    const { count } = s.track;
    let d = r.idx - prevIdx;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    r.progress += d * Tracks.SAMPLE_STEP;
    const lap = Math.floor(r.progress / s.track.length) + 1;
    if (lap > r.lap && r.progress > 0) {
      r.lap = lap;
      // Laps are timed from crossing the start line, so lap 1 isn't a standing start.
      if (lap > 1 && r.lapStart != null) {
        const time = s.t - r.lapStart;
        r.lapTimes.push(time);
        s.events.push({ type: 'lap', id: r.id, lap: lap - 1, time });
      } else if (lap > 1) {
        s.events.push({ type: 'lap', id: r.id, lap: lap - 1 });
      }
      r.lapStart = s.t;
    }
    if (!r.finished && r.progress >= s.laps * s.track.length) {
      r.finished = true;
      r.finishTime = s.t;
      s.finishOrder.push(r.id);
      r.place = s.finishOrder.length;
      s.events.push({ type: 'finish', id: r.id, place: r.place });
    }
  }

  function standings(s) {
    return s.racers
      .slice()
      .sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      })
      .map((r) => r.id);
  }

  // inputs: { [racerId]: {steer, throttle, brake, nitro} } — missing ids use the AI.
  function step(s, inputs = {}) {
    s.t += DT;
    updatePickups(s);
    for (const r of s.racers) {
      const prev = r.idx;
      let input = inputs[r.id];
      if (!input || r.finished) input = aiInput(s, r);
      if (r.finished) input = { ...input, throttle: input.throttle * 0.5, nitro: false };
      stepRacer(s, r, input);
      updateProgress(s, r, prev);
    }
    collideRacers(s);

    const player = s.racers[0];
    if (!s.done && (player.finished || s.t >= MAX_TIME)) {
      // Once you cross the line the rest are placed by where they are.
      for (const id of standings(s)) {
        const r = s.racers[id];
        if (!r.finished) {
          r.finished = true;
          r.finishTime = null;
          s.finishOrder.push(r.id);
          r.place = s.finishOrder.length;
        }
      }
      s.done = true;
    }
    return s;
  }

  // Quickest completed lap of the race: { id, time } or null.
  function fastestLap(s) {
    let best = null;
    for (const r of s.racers) {
      for (const time of r.lapTimes) {
        if (!best || time < best.time) best = { id: r.id, time };
      }
    }
    return best;
  }

  // Credits and awards for the player at the end of a race.
  function earnings(s) {
    const p = s.racers[0];
    const placeReward = s.track.reward[p.place - 1] || 0;
    const fl = fastestLap(s);
    const fastest = !!fl && fl.id === 0;
    // Fastest lap is worth a tenth of the winner's prize.
    const lapBonus = fastest ? Math.round(s.track.reward[0] / 100) * 10 : 0;
    const bestLap = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    const trophy = p.place <= 3 ? ['gold', 'silver', 'bronze'][p.place - 1] : null;
    return {
      place: p.place,
      placeReward,
      cash: p.cash,
      trophy,
      fastestLap: fastest,
      raceFastestLap: fl,
      lapBonus,
      bestLap,
      total: placeReward + p.cash + lapBonus,
    };
  }

  const api = { DT, RADIUS, MAX_TIME, DRIVERS, CATCHUP, ASSIST, WALL, catchUpBoost, aiStats, statsFor, createRace, step, standings, earnings, fastestLap, angleDiff };
  root.TractorSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
