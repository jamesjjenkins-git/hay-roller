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
  // Each vehicle has its own series. Multipliers are on the tractor's
  // stats: `turn`/`grip` shape the feel (quads are twitchy and slidey,
  // motorbikes lean hard into turns), `steerEase` how fast steering responds,
  // `driftKick` how big the drift button's slide is, `knock` how hard walls
  // and animals knock you about, `prize` and `cost` scale the economy.
  const VEHICLES = {
    tractor: { id: 'tractor', name: 'Tractor', series: 'Tractor Cup', icon: '🚜', speed: 1, accel: 1, turn: 1, grip: 1, steerEase: 1, driftKick: 1, rough: 0.35, knock: 1, prize: 1, cost: 1 },
    quad: { id: 'quad', name: 'Quad Bike', series: 'Quad Cup', icon: '🏁', speed: 1.25, accel: 1.3, turn: 1.22, grip: 0.8, steerEase: 1.3, driftKick: 1.25, rough: 0.5, knock: 1.1, prize: 1.6, cost: 2 },
    motorbike: { id: 'motorbike', name: 'Motorbike', series: 'Motorbike Cup', icon: '🏍️', speed: 1.5, accel: 1.55, turn: 1.42, grip: 0.72, steerEase: 1.2, driftKick: 0.8, rough: 0.25, knock: 1.45, prize: 2.4, cost: 3.5 },
  };
  const VEHICLE_ORDER = ['tractor', 'quad', 'motorbike'];

  function statsFor(upgrades, vehicle = 'tractor') {
    const u = { accel: 0, speed: 0, handling: 0, boost: 0, ...upgrades };
    const v = VEHICLES[vehicle] || VEHICLES.tractor;
    return {
      vehicle: v.id,
      topSpeed: (165 + u.speed * 17) * v.speed,
      accel: (150 + u.accel * 26) * v.accel,
      grip: (6.5 + u.handling * 1.3) * v.grip,
      turnRate: (3.5 + u.handling * 0.33) * v.turn,
      // How well it copes with mud and water (0 = badly, 1 = barely notices).
      rough: v.rough,
      steerEase: v.steerEase,
      driftKick: v.driftKick,
      knock: v.knock,
      nitros: 2 + u.boost,
    };
  }

  // Prize money for a track in a given series.
  function prizesFor(track, vehicle = 'tractor') {
    const k = (VEHICLES[vehicle] || VEHICLES.tractor).prize;
    return track.reward.map((r) => Math.round((r * k) / 10) * 10);
  }

  // AI rivals get tougher on later tracks and as the player upgrades.
  // AI rivals get tougher on later tracks and as the player upgrades.
  // `pace` scales their speed: on the first track they are clearly slower than
  // a stock tractor (they drive cleaner lines than a thumb can), reaching full
  // pace (a touch above a stock tractor's) by the last track.
  const AI_PACE_MIN = 0.89;
  const AI_PACE_MAX = 0.96;
  function aiStats(track, playerLevel, index, vehicle = 'tractor') {
    const skill = track.aiSkill + Math.min(0.5, playerLevel * 0.025);
    const spread = [1.0, 0.96, 0.92][index % 3];
    const lv = Math.max(0, Math.min(5, skill * 5 * spread));
    const st = statsFor({ accel: lv, speed: lv, handling: lv, boost: Math.round(lv / 2) }, vehicle);
    // Pace keeps rising a little past skill 1 so late tracks stay a fight
    // for a well-upgraded tractor.
    const pace = (AI_PACE_MIN + (AI_PACE_MAX - AI_PACE_MIN) * Math.min(1.3, skill)) * (0.98 + spread * 0.02);
    st.topSpeed *= pace;
    st.accel *= pace;
    return st;
  }

  // Walls: glance off rather than stick. bounce = fraction of the inward
  // speed reflected; loss = speed lost on a head-on knock (less for a
  // glancing one); scrape = friction per second while touching.
  // deflect = how far (radians) the nose is turned away from the wall on contact.
  // driftKiss = fraction of the usual loss when you slide into the outside
  // wall mid-drift.
  const WALL = { bounce: 0.2, deflect: 0.12, loss: 0.18, scrape: 1.5, driftKiss: 0.35 };

  // Straight-line assist for touch steering (radians, radians/second).
  // Deliberately weak: it only steadies you on straights and can't follow a
  // bend (a bend turns the road faster than `rate`), so you still have to steer.
  const ASSIST = { maxAngle: 0.2, rate: 0.4 };

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

  // Farmyard Frenzy: a bonus round between races. Just you, 100 escaped
  // animals and a minute to pop as many as you can. Every `per` popped pays
  // 5% of the track's winning prize, so popping all 100 matches a race win,
  // and a clean sweep adds a quarter on top.
  const FRENZY = { animals: 100, time: 60, per: 5, share: 0.05, sweepBonus: 0.25, fleeRange: 90, fleeSpeed: 55, notice: 0.45 };

  function frenzyRate(track, vehicle = 'tractor') {
    return Math.max(5, Math.round((prizesFor(track, vehicle)[0] * FRENZY.share) / 5) * 5);
  }

  function frenzyEarnings(s) {
    const popped = s.frenzy.popped;
    const rate = frenzyRate(s.track, s.vehicle);
    const base = Math.floor(popped / FRENZY.per) * rate;
    const sweep = popped >= s.frenzy.total;
    const bonus = sweep ? Math.round((s.frenzy.total / FRENZY.per) * rate * FRENZY.sweepBonus) : 0;
    return { popped, total: s.frenzy.total, rate, per: FRENZY.per, base, sweep, bonus, hay: base + bonus, timeLeft: Math.max(0, s.frenzy.timeLeft) };
  }

  function createRace(trackDef, { seed = 1, playerUpgrades = {}, playerColor, playerLevel = 0, laps, frenzy = false, vehicle = 'tractor' } = {}) {
    const track = trackDef.samples ? trackDef : Tracks.buildTrack(trackDef);
    const rng = FarmRng.mulberry32(seed);
    const start = track.samples[0];
    const totalLaps = frenzy ? 999 : laps || track.laps;

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

    // 2x2 grid behind the start line (just you in a Frenzy round).
    const racers = (frenzy ? DRIVERS.slice(0, 1) : DRIVERS).map((d, i) => {
      const back = 34 + Math.floor(i / 2) * 44;
      const side = (i % 2 ? 1 : -1) * track.halfWidth * 0.45;
      const x = start.x - start.tx * back + start.nx * side;
      const y = start.y - start.ty * back + start.ny * side;
      const isPlayer = i === 0;
      const stats = isPlayer ? statsFor(playerUpgrades, vehicle) : aiStats(track, playerLevel, i - 1, vehicle);
      return {
        id: i,
        name: d.name,
        vehicle,
        color: colors[i],
        isPlayer,
        stats,
        x,
        y,
        vx: 0,
        vy: 0,
        heading: start.angle,
        steer: 0,
        elev: 0,
        climb: 0,
        drift: 0,
        drifting: false,
        driftSide: 1,
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
      vehicle,
      t: 0,
      laps: totalLaps,
      racers,
      pickups: [],
      animals: frenzy ? spawnHerd(track, rng, FRENZY.animals) : spawnAnimals(track, rng),
      frenzy: frenzy ? { timeLeft: FRENZY.time, popped: 0, total: FRENZY.animals } : null,
      nextPickupAt: frenzy ? Infinity : 2,
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

    // Hills: slower up, faster down, and a hop off the crest at speed.
    const el = Tracks.elevationAt(s.track, r.idx);
    const roadDir = s.track.samples[r.idx].angle;
    const slope = el.slope * Math.cos(angleDiff(r.heading, roadDir));
    r.elev = el.h;
    let topMul = 1;
    let gripMul = 1;
    if (r.surface === 'mud') {
      topMul = 0.45 + st.rough * 0.45;
      gripMul = 0.45;
    } else if (r.surface === 'water') {
      topMul = 0.55 + st.rough * 0.35;
      gripMul = 0.35;
    } else if (r.surface === 'bumps') {
      // Rumble strips: cross them straight and you're fine, but steering
      // while you're on them shakes the tractor and costs real speed.
      const turning = Math.min(1, Math.abs(r.steer) / BUMPS.fullAt);
      topMul = 1 - BUMPS.loss * turning;
      gripMul = 1 - 0.4 * turning;
      r.bump = Math.max(r.bump, 0.25 + 0.5 * turning);
    }
    r.catchUp = catchUpBoost(s, r);
    if (r.drifting) topMul *= DRIFT.topMul;
    const top = st.topSpeed * topMul * (boosting ? 1.45 : 1) * (1 + r.catchUp);
    // Coming out of a drift you pick up speed quicker for a moment.
    r.driftExit = Math.max(0, (r.driftExit || 0) - DT);
    const exitBoost = r.driftExit > 0 ? DRIFT.exitAccel : 1;
    const accel = st.accel * (boosting ? 2 : 1) * exitBoost * (1 + r.catchUp);

    if (!r.airborne) {
      vf -= HILLS.gravity * slope * DT;
      if (slope > 0.02) {
        r.climb = Math.max(r.climb || 0, slope);
      } else if ((r.climb || 0) > 0.1) {
        // Over the top: launched if you hit the crest fast enough.
        if (vf > HILLS.launchSpeed) {
          r.airborne = true;
          r.vz = vf * r.climb * HILLS.launch;
          s.events.push({ type: 'jump', id: r.id, crest: true });
        }
        r.climb = 0;
      } else {
        r.climb = 0;
      }
    }
    if (!r.airborne) {
      if (input.throttle > 0) {
        if (vf < top) vf += accel * input.throttle * DT * (1 - Math.max(0, vf) / (top * 1.05));
        else if (!(r.kickT > 0)) vf += (top - vf) * 2 * DT; // a drift kick may run past top speed
      }
      if (input.brake > 0) {
        if (vf > 10) vf -= 320 * input.brake * DT;
        else vf -= 120 * input.brake * DT; // reverse
        vf = Math.max(vf, -st.topSpeed * 0.4);
      }
      if (input.throttle <= 0 && input.brake <= 0) vf -= vf * 1.2 * DT;
      // Grip pulls a drift back in line. On firm ground the slide's speed is
      // carried forward (up to top speed), so a tidy drift doesn't cost you.
      const vlBefore = vl;
      vl *= Math.exp(-st.grip * gripMul * DT);
      if (vf > 0 && r.surface === 'dirt') {
        vf = Math.min(Math.max(vf, top), Math.sqrt(vf * vf + vlBefore * vlBefore - vl * vl));
      }
      // Drift button: throw the tractor sideways. Pick the slide's side from
      // the steering (or the way it's already sliding); steer the other way
      // to swing smoothly into the opposite slide.
      const wasDrifting = r.drifting;
      r.drifting = !!input.drift && vf > DRIFT.minSpeed && r.surface !== 'water' && r.surface !== 'mud';
      if (r.drifting) {
        if (!wasDrifting) {
          r.driftSide = Math.sign(input.steer) || Math.sign(r.steer) || Math.sign(r.drift) || 1;
          s.events.push({ type: 'drift', id: r.id });
        } else if (Math.abs(input.steer) > 0.15 && Math.sign(input.steer) !== r.driftSide) {
          r.driftSide = Math.sign(input.steer);
        }
        r.driftTime = (r.driftTime || 0) + DT;
      } else if (wasDrifting) {
        // A kick out of the slide, but only when you let go of DRIFT — not
        // when mud, water, a jump or a crash cuts the drift short.
        const released = !input.drift;
        if (released) r.driftExit = DRIFT.exitTime;
        if (released && r.driftTime > DRIFT.kickMinTime) {
          const kick = Math.min(DRIFT.kickMax, r.driftTime * DRIFT.kickPerSec);
          // Delivered as a surge over `kickTime` rather than all at once.
          r.kickT = DRIFT.kickTime;
          r.kickRate = kick / DRIFT.kickTime;
          s.events.push({ type: 'driftKick', id: r.id, power: kick });
        }
        r.driftTime = 0;
      }
      if (r.kickT > 0) {
        r.kickT -= DT;
        vf += r.kickRate * DT;
      }
      // Turning scrubs off a little speed, which tightens the line through
      // corners; a drift carries its speed round instead.
      vf -= vf * Math.abs(r.steer) * 0.8 * DT * (r.drifting ? DRIFT.scrub : 1);

      // Turning: tractors can pivot slowly even when stopped.
      const turnFactor = Math.min(1, 0.4 + speed / (st.topSpeed * 0.5));
      const dir = vf < -5 ? -1 : 1;
      // Ease in and out of turns over a few frames so steering feels smooth,
      // but unwind a little quicker than it winds on to avoid overshoot.
      const easing = (Math.abs(input.steer) < Math.abs(r.steer) ? 20 : 15) * (st.steerEase || 1);
      r.steer += (input.steer - r.steer) * Math.min(1, easing * DT);
      const turn = r.steer * st.turnRate * turnFactor * dir * DT * (r.drifting ? DRIFT.turnBoost : 1);
      r.heading += turn;
      // Drift: the travel direction lags a touch behind the nose, and the
      // back end swings out (r.drift, drawn only) in proportion to how hard
      // you're turning at speed, easing back as you straighten up.
      const carry = r.drifting ? DRIFT.slideCarry : DRIFT.carry;
      vl -= vf * Math.sin(turn) * carry;
      vf -= vf * (1 - Math.cos(turn)) * carry;
      let wantDrift = r.surface === 'water' || r.surface === 'mud'
        ? 0
        : r.steer * DRIFT.swing * Math.min(1, Math.max(0, vf) / st.topSpeed) * (1.4 - 0.4 * gripMul);
      if (r.drifting) {
        // Properly sideways: the tail out, a little more the harder you turn.
        wantDrift = r.driftSide * (DRIFT.kick + DRIFT.kickSteer * Math.abs(r.steer)) * (st.driftKick || 1) * Math.min(1, vf / 120);
      }
      r.drift += (wantDrift - r.drift) * Math.min(1, (r.drifting || wasDrifting ? DRIFT.slideEase : DRIFT.ease) * DT);

      // Straight-line assist (player option): with no steering input, nudge
      // the nose toward the direction of the road right here — only when
      // already within ~11 degrees, so it never fights a turn or drives for you.
      if (input.assist && !r.drifting && Math.abs(input.steer) < 0.05 && speed > 30 && dir > 0) {
        const here = s.track.samples[r.idx];
        const err = angleDiff(here.angle, r.heading);
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
        // Glance off: point the nose a little *away* from the wall (past
        // parallel), so you bounce back into the track instead of sticking to
        // it or riding along it.
        const wallDir = Math.atan2(c.ty, c.tx);
        const tangent = Math.abs(angleDiff(wallDir, r.heading)) < Math.PI / 2 ? wallDir : wallDir + Math.PI;
        const intoWall = (Math.cos(r.heading) * c.nx + Math.sin(r.heading) * c.ny) * side > 0;
        if (intoWall) {
          const away = Math.atan2(-c.ny * side, -c.nx * side);
          const turnAway = Math.sign(angleDiff(away, tangent)) * WALL.deflect;
          r.heading = tangent + turnAway;
        }
        // Sliding into the wall on the outside of a drift just kisses it:
        // a much smaller penalty than an ordinary knock.
        const wallLat = -Math.sin(r.heading) * c.nx * side + Math.cos(r.heading) * c.ny * side;
        const kiss = r.drifting && Math.sign(wallLat) === -r.driftSide ? WALL.driftKiss : 1;
        // One small speed penalty per knock, bigger the more head-on it was.
        if (r.wallHit <= 0) {
          const keep = 1 - Math.min(0.6, WALL.loss * (st.knock || 1) * (0.6 + 0.4 * headOn) * kiss);
          r.vx *= keep;
          r.vy *= keep;
          r.wallHit = 0.3;
          if (Math.abs(vn) > 40) {
            s.events.push({ type: 'wall', id: r.id, x: r.x + c.nx * side * RADIUS, y: r.y + c.ny * side * RADIUS, power: Math.abs(vn) });
          }
        } else {
          // Scraping along: a little friction, never a dead stop.
          r.vx *= 1 - WALL.scrape * kiss * DT;
          r.vy *= 1 - WALL.scrape * kiss * DT;
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

  // Drift: `carry` is how much of each turn the travel direction lags behind
  // the nose (0 = on rails, 1 = ice); grip then pulls the slide back in line.
  // `swing` is how far (radians, at full turn and speed) the tail swings out.
  // The drift button: `kick` is the slide angle it throws you into (plus
  // `kickSteer` × steering), `slideCarry` how much the car really slides
  // wide while drifting, `turnBoost` how much tighter you turn, `scrub`
  // how much of the usual cornering speed loss remains, `topMul` the small
  // top-speed cost, all eased in and out at `slideEase` so it stays smooth.
  const DRIFT = {
    carry: 0.08, swing: 0.4, ease: 6,
    kick: 0.66, kickSteer: 0.3, slideCarry: 0.22, turnBoost: 1.3, scrub: 0.4, topMul: 0.94, minSpeed: 50, slideEase: 4,
    exitAccel: 2, exitTime: 1.2, // quicker pick-up for a moment after letting go
    kickPerSec: 70, kickMax: 90, kickMinTime: 0.35, kickTime: 0.8, // speed surge (px/s, over kickTime s) out of a drift
  };

  // Hills: `gravity` is how hard a slope pushes you (px/s² per unit of
  // slope); crest a hill above `launchSpeed` and you take off.
  const HILLS = { gravity: 320, launchSpeed: 105, launch: 1.5 };

  // Rumble strips only cost you if you're turning while on them.
  const BUMPS = { loss: 0.35, fullAt: 0.35 };

  // ---------- Escaped farm animals ----------
  // A few pigs, sheep and cows wander about on the track. Hit one and it goes
  // tumbling off down the track, and you lose a little speed. Early tracks
  // have one; the hardest have three.

  const ANIMAL = {
    kinds: { pig: { r: 9 }, sheep: { r: 9 }, cow: { r: 11 } },
    walk: 18, // px/s while wandering
    slow: 0.4, // fraction of the tractor's speed lost on a hit
    driftSlow: 0.5, // ...multiplied by this when you hit it mid-drift
    kick: 2.2, // the animal flies off at this multiple of the tractor's speed
    friction: 1.1, // per second while tumbling
    cooldown: 1.5, // s before the same animal can be hit again
  };

  function animalCount(track) {
    if (track.animals != null) return track.animals;
    const skill = track.aiSkill || 0;
    return skill < 0.3 ? 1 : skill < 0.5 ? 2 : 3;
  }

  function spawnAnimals(track, rng) {
    const kinds = Object.keys(ANIMAL.kinds);
    const n = animalCount(track);
    const out = [];
    for (let i = 0; i < n; i++) {
      // Spread around the lap, clear of the start line.
      const frac = 0.2 + (0.7 * (i + 0.2 + rng() * 0.6)) / n;
      const idx = Math.floor(frac * track.count) % track.count;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const r = ANIMAL.kinds[kind].r;
      const lat = (rng() - 0.5) * (track.halfWidth - r) * 1.4;
      const sm = track.samples[idx];
      out.push({
        id: i,
        kind,
        r,
        x: sm.x + sm.nx * lat,
        y: sm.y + sm.ny * lat,
        idx,
        home: idx,
        heading: rng() * Math.PI * 2,
        vx: 0,
        vy: 0,
        z: 0,
        vz: 0,
        spin: 0,
        mode: 'pause',
        timer: rng() * 2,
        target: null,
        walkPhase: 0,
        startle: 0,
        hitCooldown: 0,
      });
    }
    return out;
  }

  // A whole herd spread right round the lap (but not on the starting grid).
  function spawnHerd(track, rng, n) {
    const kinds = Object.keys(ANIMAL.kinds);
    const out = [];
    for (let i = 0; i < n; i++) {
      const frac = 0.04 + (0.94 * (i + rng())) / n;
      const idx = Math.floor(frac * track.count) % track.count;
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const r = ANIMAL.kinds[kind].r;
      const lat = (rng() - 0.5) * (track.halfWidth - r) * 1.8;
      const sm = track.samples[idx];
      out.push({
        id: i, kind, r, x: sm.x + sm.nx * lat, y: sm.y + sm.ny * lat, idx, home: idx,
        heading: rng() * Math.PI * 2, vx: 0, vy: 0, z: 0, vz: 0, spin: 0,
        mode: 'pause', timer: rng() * 3, target: null, walkPhase: 0, startle: 0, hitCooldown: 0,
      });
    }
    return out;
  }

  // Keeps an animal on the road, bouncing it off the walls.
  function keepOnTrack(track, a) {
    a.idx = Tracks.nearest(track, a.x, a.y, a.idx);
    const c = track.samples[a.idx];
    const lat = (a.x - c.x) * c.nx + (a.y - c.y) * c.ny;
    const lim = track.halfWidth - a.r;
    if (Math.abs(lat) > lim) {
      const side = Math.sign(lat);
      a.x -= c.nx * (Math.abs(lat) - lim) * side;
      a.y -= c.ny * (Math.abs(lat) - lim) * side;
      const vn = a.vx * c.nx + a.vy * c.ny;
      if (vn * side > 0) {
        a.vx -= c.nx * vn * 1.6;
        a.vy -= c.ny * vn * 1.6;
      }
      return true;
    }
    return false;
  }

  function updateAnimals(s) {
    const { track, rng } = s;
    if (s.frenzy) s.animals = s.animals.filter((a) => !a.popped);
    for (const a of s.animals) {
      a.hitCooldown = Math.max(0, a.hitCooldown - DT);
      a.startle = Math.max(0, a.startle - DT);
      if (s.frenzy && a.mode !== 'tumble') {
        // Some of them notice a tractor bearing down and make a clumsy dash:
        // roughly away, never quite cleanly, for a moment, then they go back
        // to bumbling about. Plenty don't notice at all.
        a.fleeCool = Math.max(0, (a.fleeCool || 0) - DT);
        if (a.fleeT > 0) {
          a.fleeT -= DT;
          a.heading += angleDiff(a.fleeDir, a.heading) * Math.min(1, 6 * DT);
          a.x += Math.cos(a.heading) * FRENZY.fleeSpeed * DT;
          a.y += Math.sin(a.heading) * FRENZY.fleeSpeed * DT;
          a.walkPhase += DT * 14;
          keepOnTrack(track, a);
          if (a.fleeT <= 0) {
            a.mode = 'pause';
            a.timer = 0.4 + rng() * 0.8;
            a.fleeCool = 1.5 + rng() * 1.5;
          }
        }
        const r = s.racers[0];
        const dx = a.x - r.x;
        const dy = a.y - r.y;
        const d = Math.hypot(dx, dy);
        const ahead = (dx * Math.cos(r.heading) + dy * Math.sin(r.heading)) > 0;
        if (!a.fleeCool && d < FRENZY.fleeRange && ahead && Math.hypot(r.vx, r.vy) > 40) {
          if (rng() < FRENZY.notice) {
            a.fleeT = 0.35 + rng() * 0.35;
            a.fleeDir = Math.atan2(dy, dx) + (rng() - 0.5) * 2.2;
            a.mode = 'flee';
          } else {
            a.fleeCool = 2; // didn't notice this time
          }
        }
      }
      if (a.mode === 'tumble') {
        a.x += a.vx * DT;
        a.y += a.vy * DT;
        const k = Math.exp(-ANIMAL.friction * DT * (a.z > 0 ? 0.15 : 1));
        a.vx *= k;
        a.vy *= k;
        a.heading += a.spin * DT;
        a.spin *= k;
        a.vz -= 900 * DT;
        a.z += a.vz * DT;
        if (a.z <= 0) {
          a.z = 0;
          a.vz = a.vz < -120 ? -a.vz * 0.4 : 0;
        }
        keepOnTrack(track, a);
        if (a.z === 0 && Math.hypot(a.vx, a.vy) < 20) {
          // Dazed for a moment, then it wanders about wherever it landed.
          a.mode = 'pause';
          a.timer = 1.2;
          a.startle = 1.2;
          a.home = a.idx;
          a.vx = a.vy = 0;
        }
      } else if (a.mode === 'flee') {
        // Moved above.
      } else if (a.mode === 'pause') {
        a.timer -= DT;
        if (a.timer <= 0) {
          // Amble towards a random spot on the road near where it lives.
          const idx = (a.home + Math.floor((rng() - 0.5) * 16) + track.count) % track.count;
          const c = track.samples[idx];
          // In the Frenzy they mill about the middle of the road rather than
          // hugging the walls.
          const lat = (rng() - 0.5) * (track.halfWidth - a.r) * (s.frenzy ? 1.1 : 1.6);
          a.target = { x: c.x + c.nx * lat, y: c.y + c.ny * lat };
          a.mode = 'walk';
          a.timer = 2 + rng() * 3;
        }
      } else {
        const dx = a.target.x - a.x;
        const dy = a.target.y - a.y;
        const d = Math.hypot(dx, dy);
        a.timer -= DT;
        if (d < 4 || a.timer <= 0) {
          a.mode = 'pause';
          a.timer = s.frenzy ? 0.3 + rng() * 1.2 : 1 + rng() * 2.5;
        } else {
          const want = Math.atan2(dy, dx);
          a.heading += angleDiff(want, a.heading) * Math.min(1, 4 * DT);
          if (s.frenzy) a.heading += (rng() - 0.5) * 0.25; // bumbling, not marching
          a.x += Math.cos(a.heading) * ANIMAL.walk * DT;
          a.y += Math.sin(a.heading) * ANIMAL.walk * DT;
          a.walkPhase += DT * 9;
          if (keepOnTrack(track, a)) a.mode = 'pause';
        }
      }

      if (a.hitCooldown > 0 || a.z > 12) continue;
      for (const r of s.racers) {
        if (r.z > 10) continue;
        const dx = a.x - r.x;
        const dy = a.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d >= RADIUS + a.r) continue;
        if (s.frenzy) {
          // Pop! Like a balloon — no slowdown in the bonus round.
          a.popped = true;
          s.frenzy.popped++;
          s.events.push({ type: 'pop', id: r.id, kind: a.kind, x: a.x, y: a.y, count: s.frenzy.popped });
          break;
        }
        const speed = Math.hypot(r.vx, r.vy);
        // Off it goes: down the track and out to the side it was hit on, so
        // it clears your path rather than getting pushed along.
        const nx = d > 0 ? dx / d : Math.cos(r.heading);
        const ny = d > 0 ? dy / d : Math.sin(r.heading);
        const fx = Math.cos(r.heading);
        const fy = Math.sin(r.heading);
        const side = -fy * nx + fx * ny >= 0 ? 1 : -1;
        const kick = Math.max(160, speed * ANIMAL.kick);
        a.vx = (fx * 0.9 - fy * side * 0.45) * kick;
        a.vy = (fy * 0.9 + fx * side * 0.45) * kick;
        a.vz = 220 + speed * 0.8;
        a.spin = (rng() < 0.5 ? -1 : 1) * (6 + rng() * 6);
        a.mode = 'tumble';
        a.hitCooldown = ANIMAL.cooldown;
        a.x = r.x + nx * (RADIUS + a.r);
        a.y = r.y + ny * (RADIUS + a.r);
        // Sliding into one sideways shoves it aside: it costs less speed.
        const slow = Math.min(0.7, ANIMAL.slow * (r.stats.knock || 1) * (r.drifting ? ANIMAL.driftSlow : 1));
        r.vx *= 1 - slow;
        r.vy *= 1 - slow;
        r.bump = Math.max(r.bump, 0.6);
        s.events.push({ type: 'animal', id: r.id, kind: a.kind, x: a.x, y: a.y, power: speed });
        break;
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
    updateAnimals(s);
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
    if (s.frenzy) {
      // The bonus round ends when the minute is up or every animal is popped.
      s.frenzy.timeLeft -= DT;
      s.animals = s.animals.filter((a) => !a.popped);
      if (!s.done && (s.frenzy.timeLeft <= 0 || !s.animals.length)) {
        player.finished = true;
        player.place = 1;
        s.done = true;
      }
      return s;
    }
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
    const prizes = prizesFor(s.track, s.vehicle);
    const placeReward = prizes[p.place - 1] || 0;
    const fl = fastestLap(s);
    const fastest = !!fl && fl.id === 0;
    // Fastest lap is worth a tenth of the winner's prize.
    const lapBonus = fastest ? Math.round(prizes[0] / 100) * 10 : 0;
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

  const api = { VEHICLES, VEHICLE_ORDER, prizesFor, DT, RADIUS, MAX_TIME, DRIVERS, CATCHUP, ASSIST, WALL, ANIMAL, BUMPS, DRIFT, HILLS, FRENZY, frenzyRate, frenzyEarnings, animalCount, catchUpBoost, aiStats, statsFor, createRace, step, standings, earnings, fastestLap, angleDiff };
  root.TractorSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
