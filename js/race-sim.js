// Hay Bale Derby — deterministic race simulation.
// Everything here is pure: given a field and a seed, a race always plays out
// the same way. The renderer only reads state; it never influences the result.
(function (root) {
  const FarmRng = root.FarmRng || require('./rng.js');

  const WORLD = { width: 1400, height: 760 };
  const TRACK = { startX: 150, finishX: 1250, top: 130, bottom: 670 };
  const LANES = 6;
  const LANE_H = (TRACK.bottom - TRACK.top) / LANES;
  const DT = 1 / 60;
  const MAX_TIME = 60;

  const BALE = { r: 26, w: 46, h: 58, mass: 1.5 };

  const LANE_COLORS = [
    { name: 'Red', hex: '#e2412f' },
    { name: 'Blue', hex: '#2f7de2' },
    { name: 'Yellow', hex: '#f4c20d' },
    { name: 'Green', hex: '#2fae4a' },
    { name: 'Purple', hex: '#8e44c9' },
    { name: 'Orange', hex: '#f07c1b' },
  ];

  const BALE_NAMES = [
    'Big Bertha', 'Rolling Thunder', 'Sir Strawsalot', 'Hay Jude', 'Bale Runner',
    'The Haystack Kid', 'Little Bo Roll', 'Straw Dogg', 'Rolly Parton', 'Hay-zel',
    'Barnaby Bale', 'Clover Rover', 'Tumbleweed Ted', 'Fodder Mucker', 'Hayley Comet',
    'Baler Swift', 'Rick Rollin', 'Mr. Twine', 'Chaff Chaser', 'Golden Gus',
  ];

  // Farmyard wanderers. mass decides how hard a bale gets knocked about.
  const ANIMALS = {
    chicken: { r: 13, mass: 0.35, speed: 58, pauseChance: 0.55, weight: 3, sound: 'BUK-AWK!' },
    duck: { r: 14, mass: 0.45, speed: 46, pauseChance: 0.35, weight: 2, sound: 'QUACK!' },
    sheep: { r: 20, mass: 1.1, speed: 36, pauseChance: 0.45, weight: 2, sound: 'BAAA!' },
    pig: { r: 21, mass: 1.6, speed: 40, pauseChance: 0.4, weight: 2, sound: 'OINK!' },
    cow: { r: 30, mass: 3.2, speed: 26, pauseChance: 0.5, weight: 1, sound: 'MOOO!' },
  };
  const ANIMAL_KINDS = Object.keys(ANIMALS);

  function laneCenter(i) {
    return TRACK.top + LANE_H * (i + 0.5);
  }

  function pickWeighted(rng) {
    const total = ANIMAL_KINDS.reduce((s, k) => s + ANIMALS[k].weight, 0);
    let roll = rng() * total;
    for (const k of ANIMAL_KINDS) {
      roll -= ANIMALS[k].weight;
      if (roll < 0) return k;
    }
    return ANIMAL_KINDS[0];
  }

  // A field is the six bales and their hidden-ish stats for one race.
  function generateField(seed) {
    const rng = FarmRng.mulberry32(seed);
    const names = BALE_NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const field = [];
    for (let i = 0; i < LANES; i++) {
      field.push({
        lane: i,
        number: i + 1,
        name: names[i],
        color: LANE_COLORS[i].hex,
        colorName: LANE_COLORS[i].name,
        topSpeed: 87 + rng() * 7, // px/s on the flat-out roll
        power: 0.8 + rng() * 0.4, // how quickly it gets rolling
        stability: 0.3 + rng() * 0.7, // resists being knocked off course
      });
    }
    return field;
  }

  function createRace(field, seed) {
    const rng = FarmRng.mulberry32(seed);
    const bales = field.map((f, i) => ({
      lane: i,
      x: TRACK.startX - BALE.w / 2 - 6,
      y: laneCenter(i),
      vx: 0,
      vy: 0,
      roll: 0,
      squash: 0,
      hits: 0,
      surge: 1,
      surgeTarget: 1,
      surgeTimer: 0,
      finished: false,
      finishTime: null,
      place: null,
    }));

    const spawns = [];
    const count = 8 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i++) {
      const kind = pickWeighted(rng);
      const fromTop = rng() < 0.5;
      const jitter = (rng() - 0.5) * 0.7;
      spawns.push({
        t: 0.2 + rng() * 12.5,
        kind,
        x: TRACK.startX + 140 + rng() * (TRACK.finishX - TRACK.startX - 200),
        y: fromTop ? TRACK.top - 50 : TRACK.bottom + 50,
        goal: (fromTop ? Math.PI / 2 : -Math.PI / 2) + jitter,
      });
    }
    spawns.sort((a, b) => a.t - b.t);

    return {
      seed,
      field,
      rng,
      t: 0,
      bales,
      animals: [],
      spawns,
      spawnIdx: 0,
      nextAnimalId: 1,
      finishOrder: [],
      done: false,
      events: [],
    };
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function spawnAnimals(s) {
    while (s.spawnIdx < s.spawns.length && s.spawns[s.spawnIdx].t <= s.t) {
      const sp = s.spawns[s.spawnIdx++];
      const def = ANIMALS[sp.kind];
      s.animals.push({
        id: s.nextAnimalId++,
        kind: sp.kind,
        x: sp.x,
        y: sp.y,
        r: def.r,
        mass: def.mass,
        heading: sp.goal,
        goal: sp.goal,
        speed: def.speed * (0.85 + s.rng() * 0.3),
        mode: 'walk',
        timer: 0.6 + s.rng() * 1.5,
        startle: 0,
        walkPhase: s.rng() * 10,
        cooldown: {},
      });
    }
  }

  function updateAnimals(s) {
    const rng = s.rng;
    for (const a of s.animals) {
      const def = ANIMALS[a.kind];
      if (a.startle > 0) a.startle -= DT;
      a.timer -= DT;

      if (a.mode === 'pause') {
        if (a.timer <= 0 || a.startle > 0) {
          a.mode = 'walk';
          a.timer = 0.8 + rng() * 1.8;
        }
        continue;
      }

      if (a.timer <= 0) {
        if (a.startle <= 0 && rng() < def.pauseChance) {
          a.mode = 'pause';
          a.timer = 0.4 + rng() * 1.3;
          continue;
        }
        a.timer = 0.8 + rng() * 1.8;
        a.goal += (rng() - 0.5) * 0.5;
      }

      // Drift back toward the direction they were heading before any fright.
      const turn = a.startle > 0 ? 0.01 : 0.04;
      a.heading += angleDiff(a.goal, a.heading) * turn;
      const speed = a.speed * (a.startle > 0 ? 2.6 : 1);
      a.x += Math.cos(a.heading) * speed * DT;
      a.y += Math.sin(a.heading) * speed * DT;
      a.x = Math.max(TRACK.startX + 30, Math.min(WORLD.width - 20, a.x));
      a.walkPhase += speed * DT * 0.18;
    }
    s.animals = s.animals.filter((a) => a.y > -80 && a.y < WORLD.height + 80);
  }

  function updateBales(s) {
    const rng = s.rng;
    for (const b of s.bales) {
      const f = s.field[b.lane];
      const prevX = b.x;
      if (b.finished) {
        b.vx *= 0.97;
      } else {
        // Bales find and lose momentum as the slope and their shape dictate.
        b.surgeTimer -= DT;
        if (b.surgeTimer <= 0) {
          b.surgeTarget = 0.86 + rng() * 0.28;
          b.surgeTimer = 0.7 + rng() * 1.6;
        }
        b.surge += (b.surgeTarget - b.surge) * 1.5 * DT;
        const accel = 70 * f.power;
        const drag = accel / (f.topSpeed * b.surge);
        b.vx += (accel - drag * b.vx) * DT;
        b.vx += (rng() - 0.5) * 50 * DT;
        // Ruts and divots in the hillside.
        if (rng() < 0.006) {
          b.vx *= 0.86 + rng() * 0.08;
          b.vy += (rng() - 0.5) * 40;
          b.squash = 1;
          s.events.push({ type: 'bump', lane: b.lane, x: b.x, y: b.y });
        }
      }
      b.vy *= 1 - 1.6 * DT;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.roll += b.vx * DT;
      b.squash = Math.max(0, b.squash - DT * 3);

      const minY = TRACK.top + BALE.h / 2;
      const maxY = TRACK.bottom - BALE.h / 2;
      if (b.y < minY) {
        b.y = minY;
        b.vy = Math.abs(b.vy) * 0.5;
      } else if (b.y > maxY) {
        b.y = maxY;
        b.vy = -Math.abs(b.vy) * 0.5;
      }

      const front = b.x + BALE.w / 2;
      if (!b.finished && front >= TRACK.finishX) {
        const prevFront = prevX + BALE.w / 2;
        const frac = b.x === prevX ? 1 : (TRACK.finishX - prevFront) / (b.x - prevX);
        b.finished = true;
        b.finishTime = s.t - DT + DT * Math.max(0, Math.min(1, frac));
        s.finishOrder.push(b.lane);
      }
    }
  }

  function collideBales(s) {
    const bs = s.bales;
    const minD = BALE.r * 2;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (minD - d) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const j2 = -(1 + 0.4) * rel * 0.5;
          a.vx -= j2 * nx;
          a.vy -= j2 * ny;
          b.vx += j2 * nx;
          b.vy += j2 * ny;
          if (rel < -15) s.events.push({ type: 'clack', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }
  }

  function collideAnimals(s) {
    const rng = s.rng;
    for (const b of s.bales) {
      const f = s.field[b.lane];
      for (const a of s.animals) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = BALE.r + a.r;
        if (d >= minD || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const massShare = a.mass / (a.mass + BALE.mass);
        const vn = b.vx * nx + b.vy * ny;
        const fresh = !(a.cooldown[b.lane] > s.t);
        if (vn < 0) {
          const give = 1.25 - f.stability * 0.45;
          const j = (1 + 0.5) * vn * massShare * give;
          b.vx -= j * nx;
          b.vy -= j * ny;
          if (fresh) b.vy += (rng() - 0.5) * 70 * massShare * give + ny * 25 * give;
        }
        if (fresh) {
          a.cooldown[b.lane] = s.t + 0.7;
          a.startle = 1.3;
          a.mode = 'walk';
          a.heading = Math.atan2(-ny, -nx) + (rng() - 0.5) * 0.9;
          b.squash = 1;
          b.hits++;
          s.events.push({ type: 'hit', lane: b.lane, kind: a.kind, x: a.x, y: a.y, animalId: a.id });
        }
        const overlap = minD - d;
        b.x += nx * overlap * massShare;
        b.y += ny * overlap * massShare;
        a.x -= nx * overlap * (1 - massShare);
        a.y -= ny * overlap * (1 - massShare);
      }
    }
  }

  // Physics keeps running after the result is locked so bales can roll out
  // past the line on screen; finishOrder never changes once done.
  function step(s) {
    s.t += DT;
    spawnAnimals(s);
    updateAnimals(s);
    updateBales(s);
    collideBales(s);
    collideAnimals(s);
    if (s.done) return s;

    if (s.finishOrder.length === s.bales.length) {
      s.done = true;
    } else if (s.t >= MAX_TIME) {
      // Safety net: anything still rolling is placed by distance travelled.
      const rest = s.bales.filter((b) => !b.finished).sort((a, b) => b.x - a.x);
      for (const b of rest) {
        b.finished = true;
        b.finishTime = s.t;
        s.finishOrder.push(b.lane);
      }
      s.done = true;
    }
    if (s.done) s.finishOrder.forEach((lane, i) => (s.bales[lane].place = i + 1));
    return s;
  }

  function finish(s) {
    while (!s.done) {
      step(s);
      s.events.length = 0;
    }
    return s;
  }

  function runToEnd(field, seed) {
    return finish(createRace(field, seed));
  }

  // Monte Carlo the field over many independent seeds to price each bale.
  // The live race seed is drawn only when the race starts, so it is never
  // one of these trial seeds and can't be known while betting.
  function createOddsEstimator(field, trialSeed, trials = 300, houseEdge = 0.1) {
    const wins = new Array(field.length).fill(0);
    const rng = FarmRng.mulberry32(trialSeed);
    let done = 0;
    return {
      get progress() {
        return done / trials;
      },
      // Runs up to `batch` trials; returns true once all trials are complete.
      run(batch = trials) {
        const end = Math.min(trials, done + batch);
        for (; done < end; done++) {
          wins[runToEnd(field, Math.floor(rng() * 4294967296)).finishOrder[0]]++;
        }
        return done >= trials;
      },
      result() {
        return wins.map((w) => {
          const p = (w + 0.5) / (trials + 0.5 * field.length);
          return { probability: p, odds: roundOdds((1 - houseEdge) / p) };
        });
      },
    };
  }

  function estimateOdds(field, trialSeed, trials, houseEdge) {
    const est = createOddsEstimator(field, trialSeed, trials, houseEdge);
    est.run();
    return est.result();
  }

  function roundOdds(x) {
    let v;
    if (x < 10) v = Math.round(x * 10) / 10;
    else if (x < 20) v = Math.round(x * 2) / 2;
    else v = Math.round(x);
    return Math.max(1.1, Math.min(60, v));
  }

  // Win-only bets: stake * odds on the winner, rounded down to whole credits.
  function payout(bets, odds, winnerLane) {
    const stake = bets[winnerLane] || 0;
    return Math.floor(stake * odds[winnerLane].odds);
  }

  function leaderboard(s) {
    const finished = s.finishOrder.slice();
    const rolling = s.bales.filter((b) => !b.finished).sort((a, b) => b.x - a.x).map((b) => b.lane);
    return finished.concat(rolling);
  }

  const api = {
    MAX_TIME, WORLD, TRACK, LANES, LANE_H, DT, BALE, LANE_COLORS, ANIMALS,
    laneCenter, generateField, createRace, step, finish, runToEnd, createOddsEstimator, estimateOdds, roundOdds, payout, leaderboard,
  };
  root.HaySim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
