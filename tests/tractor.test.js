const test = require('node:test');
const assert = require('node:assert');
const Tracks = require('../js/tractor/tracks.js');
const Sim = require('../js/tractor/sim.js');
const Garage = require('../js/tractor/garage.js');

// A sample in the middle of the longest straight stretch of a track.
function straightIdx(t) {
  let best = 0;
  let bestRun = 0;
  let run = 0;
  for (let k = 0; k < t.count * 2; k++) {
    const i = k % t.count;
    let d = t.samples[(i + 1) % t.count].angle - t.samples[i].angle;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    run = Math.abs(d) < 0.01 ? run + 1 : 0;
    if (run > bestRun && run < t.count) {
      bestRun = run;
      best = (i - Math.floor(run / 2) + t.count) % t.count;
    }
  }
  return best;
}

function memStore() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)), removeItem: (k) => delete d[k] };
}

// Simple "thumb on the joystick" driver: point at the track a little ahead.
function stickDriver(s) {
  const me = s.racers[0];
  const tg = s.track.samples[(me.idx + 9) % s.track.count];
  const want = Math.atan2(tg.y - me.y, tg.x - me.x);
  return { steer: Math.max(-1, Math.min(1, Sim.angleDiff(want, me.heading) * 2.5)), throttle: 1, brake: 0, nitro: false };
}

test('tracks keep separate stretches apart so walls never merge', () => {
  for (const def of Tracks.TRACKS) {
    const t = Tracks.buildTrack(def);
    for (let i = 0; i < t.count; i += 2) {
      for (let j = i + 1; j < t.count; j += 2) {
        const along = Math.min(j - i, t.count - (j - i)) * Tracks.SAMPLE_STEP;
        if (along < 2 * t.width) continue;
        // A figure-of-8 declares where its halves are meant to cross.
        const cs = def.crossings || (def.crossing ? [def.crossing] : []);
        const nearCross = (p) => cs.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
        if (nearCross(t.samples[i]) || nearCross(t.samples[j])) continue;
        const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].y - t.samples[j].y);
        assert.ok(d >= t.width + 24, `${def.id}: samples ${i}/${j} only ${d.toFixed(0)}px apart`);
      }
    }
  }
});

test('tracks fit on one screen', () => {
  for (const def of Tracks.TRACKS) {
    const t = Tracks.buildTrack(def);
    for (const s of t.samples) {
      assert.ok(s.x - t.halfWidth > 0 && s.x + t.halfWidth < Tracks.WORLD.width, `${def.id} x out of bounds`);
      assert.ok(s.y - t.halfWidth > 40 && s.y + t.halfWidth < Tracks.WORLD.height, `${def.id} y out of bounds`);
    }
  }
});

test('a joystick driver finishes every track and the race ends with four places', () => {
  for (const def of Tracks.TRACKS) {
    const s = Sim.createRace(def, { seed: 11 });
    while (!s.done) {
      Sim.step(s, { 0: stickDriver(s) });
      s.events.length = 0;
    }
    assert.ok(s.t < Sim.MAX_TIME, `${def.id} timed out`);
    assert.ok(s.racers[0].progress >= def.laps * s.track.length);
    assert.deepStrictEqual(s.racers.map((r) => r.place).sort(), [1, 2, 3, 4]);
  }
});

test('upgrades make the tractor faster', () => {
  const time = (lvl) => {
    const up = { accel: lvl, speed: lvl, handling: lvl, boost: 0 };
    let total = 0;
    for (const seed of [1, 2, 3]) {
      const s = Sim.createRace(Tracks.TRACKS[0], { seed, playerUpgrades: up });
      while (!s.done) {
        Sim.step(s, { 0: stickDriver(s) });
        s.events.length = 0;
      }
      total += s.racers[0].finishTime;
    }
    return total;
  };
  assert.ok(time(5) < time(0) * 0.85);
});

test('earnings pay the place prize plus cash bags', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
  s.racers[0].place = 2;
  s.racers[0].cash = 75;
  const e = Sim.earnings(s);
  assert.strictEqual(e.placeReward, Tracks.TRACKS[0].reward[1]);
  assert.strictEqual(e.trophy, 'silver');
  assert.strictEqual(e.fastestLap, false);
  assert.strictEqual(e.total, Tracks.TRACKS[0].reward[1] + 75);
});

test('every completed lap is timed and the fastest lap earns a bonus', () => {
  const def = Tracks.TRACKS[0];
  const s = Sim.createRace(def, { seed: 4, playerUpgrades: { accel: 5, speed: 5, handling: 5 } });
  while (!s.done) {
    Sim.step(s, { 0: stickDriver(s) });
    s.events.length = 0;
  }
  const me = s.racers[0];
  assert.strictEqual(me.lapTimes.length, def.laps);
  for (const t of me.lapTimes) assert.ok(t > 5 && t < 60, `lap time ${t}`);
  const e = Sim.earnings(s);
  const fl = Sim.fastestLap(s);
  assert.ok(fl);
  assert.strictEqual(e.fastestLap, fl.id === 0);
  assert.strictEqual(e.lapBonus, e.fastestLap ? def.reward[0] / 10 : 0);
  assert.strictEqual(e.bestLap, Math.min(...me.lapTimes));
  assert.strictEqual(e.total, e.placeReward + e.cash + e.lapBonus);
});

test('fastest lap goes to whoever set the quickest time', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
  s.racers[0].lapTimes = [15.2, 14.9];
  s.racers[2].lapTimes = [14.5];
  assert.deepStrictEqual(Sim.fastestLap(s), { id: 2, time: 14.5 });
  s.racers[0].place = 1;
  assert.strictEqual(Sim.earnings(s).fastestLap, false);
  assert.strictEqual(Sim.earnings(s).trophy, 'gold');
});

test('garage buys upgrades with wallet credits and caps at max level', () => {
  const store = memStore();
  const g = Garage.createGarage(store);
  let balance = 100000;
  const wallet = {
    canAfford: (n) => n <= balance,
    spend: (n) => { balance -= n; },
  };
  const cost = g.nextCost('speed');
  assert.ok(g.buy('speed', wallet));
  assert.strictEqual(balance, 100000 - cost);
  for (let i = 0; i < 10; i++) g.buy('speed', wallet);
  assert.strictEqual(g.state.upgrades.speed, Garage.MAX_LEVEL);
  assert.strictEqual(g.nextCost('speed'), null);
  assert.strictEqual(Garage.createGarage(store).state.upgrades.speed, Garage.MAX_LEVEL, 'persists');
  const broke = { canAfford: () => false, spend: () => assert.fail('should not spend') };
  assert.strictEqual(g.buy('handling', broke), false);
});

test('tracks unlock by finishing high enough on the previous one', () => {
  const g = Garage.createGarage(memStore());
  const barnyard = Tracks.TRACKS[1];
  assert.strictEqual(g.isUnlocked(Tracks.TRACKS[0]), true);
  assert.strictEqual(g.isUnlocked(barnyard), false);
  g.recordResult('meadow', 4, 70);
  assert.strictEqual(g.isUnlocked(barnyard), false);
  g.recordResult('meadow', 3, 65);
  assert.strictEqual(g.isUnlocked(barnyard), true);
});

test('only the four basic upgrades exist', () => {
  assert.deepStrictEqual(Garage.UPGRADES.map((u) => u.id), ['accel', 'speed', 'handling', 'boost']);
});

test('handling upgrades tighten turning', () => {
  assert.ok(Sim.statsFor({ handling: 5 }).turnRate > Sim.statsFor({}).turnRate * 1.4);
  assert.ok(Sim.statsFor({ handling: 5 }).grip > Sim.statsFor({}).grip);
});

test('old saves carry levels across and refund suspension', () => {
  const store = memStore();
  store.setItem('farmCasino.tractor.v1', JSON.stringify({
    upgrades: { engine: 2, gearbox: 1, tyres: 3, suspension: 2, nitro: 1 }, paint: 'blue', best: {}, races: 3, wins: 1,
  }));
  const g = Garage.createGarage(store);
  assert.deepStrictEqual(g.state.upgrades, { accel: 1, speed: 2, handling: 3, boost: 1 });
  let credited = 0;
  const wallet = { credit: (n) => { credited += n; } };
  assert.strictEqual(g.payRefund(wallet), 110 + 310);
  assert.strictEqual(credited, 420);
  assert.strictEqual(g.payRefund(wallet), 0, 'refund is paid once');
  assert.strictEqual(Garage.createGarage(store).state.refund, 0);
});

test('trophies and fastest-lap awards are counted per track', () => {
  const g = Garage.createGarage(memStore());
  let r = g.recordResult('meadow', 2, 60, { fastestLap: true, bestLap: 14.2 });
  assert.strictEqual(r.trophy.id, 'silver');
  assert.strictEqual(r.newBestTrophy, true);
  assert.strictEqual(r.firstLapTime, true);
  r = g.recordResult('meadow', 1, 58, { fastestLap: false, bestLap: 13.9 });
  assert.strictEqual(r.trophy.id, 'gold');
  assert.strictEqual(r.lapRecord, true);
  r = g.recordResult('meadow', 1, 59, { bestLap: 14.5 });
  assert.strictEqual(r.newBestTrophy, false, 'gold again is not a better trophy');
  assert.strictEqual(r.lapRecord, false);
  r = g.recordResult('meadow', 4, 70, {});
  assert.strictEqual(r.trophy, null);
  assert.deepStrictEqual(g.state.awards.meadow, { gold: 2, silver: 1, bronze: 0, fastest: 1, bestLap: 13.9 });
  g.recordResult('barnyard', 3, 80, { fastestLap: true, bestLap: 18 });
  assert.deepStrictEqual(g.awardTotals(), { gold: 2, silver: 1, bronze: 1, fastest: 2 });
});

test('rivals never share a colour with the player', () => {
  for (const color of ['#2f6fe2', '#2e9e3e', '#e2412f', '#f07c1b']) {
    const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1, playerColor: color });
    const colors = s.racers.map((r) => r.color);
    assert.strictEqual(new Set(colors).size, 4);
    assert.strictEqual(colors[0], color);
  }
});

// A human-ish thumb: re-aims ~6 times a second with a little error.
function humanDriver(seed) {
  const { mulberry32 } = require('../js/rng.js');
  const rng = mulberry32(seed * 7 + 1);
  let n = 0;
  let aim = 0;
  return (s) => {
    const me = s.racers[0];
    if (n++ % 6 === 0) {
      const tg = s.track.samples[(me.idx + 10) % s.track.count];
      aim = Math.atan2(tg.y - me.y, tg.x - me.x) + (rng() - 0.5) * 0.25;
    }
    return { steer: Math.max(-1, Math.min(1, Sim.angleDiff(aim, me.heading) * 2.5)), throttle: 1, brake: 0, nitro: false };
  };
}

test('the first track is winnable with a stock tractor', () => {
  let wins = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = Sim.createRace(Tracks.TRACKS[0], { seed });
    const drive = humanDriver(seed);
    while (!s.done) {
      Sim.step(s, { 0: drive(s) });
      s.events.length = 0;
    }
    if (s.racers[0].place === 1) wins++;
  }
  assert.ok(wins >= 4, `stock tractor won only ${wins}/12 on Muddy Meadow`);
});

test('rivals are slower than a stock tractor on track 1 and match an upgraded one on the last', () => {
  const first = Tracks.TRACKS[0];
  const last = Tracks.TRACKS.find((t) => t.id === 'harvest');
  const stock = Sim.statsFor({});
  assert.ok(Sim.aiStats(first, 0, 0).topSpeed < stock.topSpeed * 0.95);
  assert.ok(Sim.aiStats(last, 0, 0).topSpeed > Sim.statsFor({ speed: 2 }).topSpeed);
});

test('rubber banding only helps the player when well behind the car ahead', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
  const [me, a, b, c] = s.racers;
  a.progress = 1000; b.progress = 900; c.progress = 800;
  me.progress = 700; // 100 behind the next car: no help
  assert.strictEqual(Sim.catchUpBoost(s, me), 0);
  me.progress = 800 - (Sim.CATCHUP.fullGap + 50); // far behind: full help
  assert.strictEqual(Sim.catchUpBoost(s, me), Sim.CATCHUP.maxBoost);
  me.progress = 800 - (Sim.CATCHUP.startGap + Sim.CATCHUP.fullGap) / 2;
  const mid = Sim.catchUpBoost(s, me);
  assert.ok(mid > 0 && mid < Sim.CATCHUP.maxBoost);
  me.progress = 1200; // leading: nothing
  assert.strictEqual(Sim.catchUpBoost(s, me), 0);
  assert.strictEqual(Sim.catchUpBoost(s, a), 0, 'AI never gets it');
});

test('after a crash the player claws back towards the pack', () => {
  // Same race twice; the player stalls for 4s mid-race. Compare the gap to the
  // car ahead 10s later with and without rubber banding.
  const gapLater = (boost) => {
    const saved = Sim.CATCHUP.maxBoost;
    Sim.CATCHUP.maxBoost = boost;
    const s = Sim.createRace(Tracks.TRACKS[0], { seed: 3 });
    const drive = humanDriver(3);
    while (s.t < 30) {
      const stalled = s.t > 12 && s.t < 16;
      const input = drive(s);
      Sim.step(s, { 0: stalled ? { ...input, throttle: 0, brake: 1 } : input });
      s.events.length = 0;
    }
    Sim.CATCHUP.maxBoost = saved;
    const me = s.racers[0];
    const ahead = Math.min(...s.racers.filter((r) => r.progress > me.progress).map((r) => r.progress));
    return ahead - me.progress;
  };
  const withBand = gapLater(0.16);
  const without = gapLater(0);
  assert.ok(withBand < without - 60, `gap with banding ${withBand.toFixed(0)} vs without ${without.toFixed(0)}`);
});

test('the figure-of-8 bonus track really crosses itself and is drivable', () => {
  const def = Tracks.TRACKS.find((t) => t.id === 'figure8');
  const t = Tracks.buildTrack(def);
  const near = t.samples.filter((p) => Math.hypot(p.x - def.crossing.x, p.y - def.crossing.y) < 20).map((p) => p.dist);
  const spread = Math.max(...near) - Math.min(...near);
  assert.ok(spread > t.length / 3, 'two separate stretches pass through the crossroads');
  const s = Sim.createRace(def, { seed: 2 });
  while (!s.done) {
    Sim.step(s, { 0: stickDriver(s) });
    s.events.length = 0;
  }
  assert.ok(s.racers[0].progress >= def.laps * s.track.length, 'laps count correctly through the crossing');
});

test('unlock-all opens every track and can be switched off', () => {
  const g = Garage.createGarage(memStore());
  const locked = Tracks.TRACKS.filter((t) => !g.isUnlocked(t));
  assert.ok(locked.length >= 9);
  g.setUnlockAll(true);
  assert.ok(Tracks.TRACKS.every((t) => g.isUnlocked(t)));
  g.setUnlockAll(false);
  assert.strictEqual(Tracks.TRACKS.filter((t) => !g.isUnlocked(t)).length, locked.length);
});

test('straight-line assist only steadies small drifts and never drives for you', () => {
  const def = Tracks.TRACKS[0];
  const run = (assist, steer, offset) => {
    const s = Sim.createRace(def, { seed: 1 });
    for (let i = 0; i < 90; i++) {
      const me = s.racers[0];
      me.heading = s.track.samples[me.idx].angle;
      Sim.step(s, { 0: { steer: 0, throttle: 1, brake: 0 } });
    }
    const me = s.racers[0];
    me.heading = s.track.samples[me.idx].angle + offset;
    for (let i = 0; i < 30; i++) Sim.step(s, { 0: { steer, throttle: 1, brake: 0, assist } });
    return Math.abs(Sim.angleDiff(s.track.samples[me.idx].angle, me.heading));
  };
  assert.ok(run(true, 0, 0.15) < 0.05, 'a small drift is steadied');
  assert.ok(run(false, 0, 0.15) > run(true, 0, 0.15) + 0.08, 'the assist is what corrected it');
  assert.ok(run(true, 0, 0.4) > 0.3, 'anything bigger is left to the player');
  assert.ok(run(true, 0.55, 0.15) > 0.3, 'no correction while the player is steering');
});

test('letting go of the steering in the lead loses the race', () => {
  const def = Tracks.TRACKS[0];
  let losses = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const s = Sim.createRace(def, { seed });
    while (!s.done && s.t < 200) {
      const me = s.racers[0];
      const input = { steer: 0, throttle: 1, brake: 0, assist: true };
      if (me.lap <= 1) input.steer = stickDriver(s).steer; // race properly for lap 1
      Sim.step(s, { 0: input });
      s.events.length = 0;
    }
    if (s.racers[0].place !== 1) losses++;
  }
  assert.strictEqual(losses, 4, 'coasting hands-off should not win');
});

test('walls glance you off with a small speed loss instead of sticking', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
  for (const r of s.racers.slice(1)) {
    r.stats.topSpeed = 1;
    r.stats.accel = 0;
    r.x = -2000; // parked well out of the way
  }
  s.animals = [];
  const me = s.racers[0];
  me.idx = straightIdx(s.track);
  const sm = s.track.samples[me.idx];
  me.x = sm.x;
  me.y = sm.y;
  me.heading = sm.angle - 0.8; // ~45 degrees straight at the wall
  me.vx = Math.cos(me.heading) * 160;
  me.vy = Math.sin(me.heading) * 160;
  let minSpeed = Infinity;
  for (let i = 0; i < 120; i++) {
    Sim.step(s, { 0: { steer: 0, throttle: 1, brake: 0, assist: true } });
    minSpeed = Math.min(minSpeed, Math.hypot(me.vx, me.vy));
  }
  assert.ok(minSpeed > 60, `dropped to ${minSpeed.toFixed(0)}px/s — that's sticking, not glancing`);
  assert.ok(Math.hypot(me.vx, me.vy) > 120, 'back up to speed within 2s');
  const c = s.track.samples[me.idx];
  assert.ok(Math.abs(Sim.angleDiff(Math.atan2(c.ty, c.tx), me.heading)) < 0.5, 'nose turned to run along the wall');
});

test('every mud patch and pond leaves a clear lane a tractor can drive through', () => {
  for (const def of Tracks.TRACKS) {
    const t = Tracks.buildTrack(def);
    for (const f of t.features.filter((x) => x.type === 'mud' || x.type === 'water')) {
      // Walk along the patch; at each step find the widest gap a tractor's
      // centre can use that is on the road and clear of the patch.
      for (let a = -f.len / 2; a <= f.len / 2; a += 6) {
        const cx = f.x + Math.cos(f.angle) * a;
        const cy = f.y + Math.sin(f.angle) * a;
        const idx = Tracks.nearestGlobal(t, cx, cy);
        const c = t.samples[idx];
        const lim = t.halfWidth - Sim.RADIUS;
        let best = 0;
        let run = 0;
        for (let lat = -lim; lat <= lim; lat += 1) {
          const x = c.x + c.nx * lat;
          const y = c.y + c.ny * lat;
          // The tractor body (not just its centre) must stay out of the patch.
          const hit = [[0, 0], [Sim.RADIUS, 0], [-Sim.RADIUS, 0], [0, Sim.RADIUS], [0, -Sim.RADIUS]]
            .some(([ox, oy]) => Tracks.inFeature(f, x + ox, y + oy));
          run = hit ? 0 : run + 1;
          best = Math.max(best, run);
        }
        assert.ok(best >= 8, `${def.id} ${f.type} #${f.id}: only ${best}px of clear lane`);
      }
    }
  }
});

test('escaped animals: 1 on early tracks, up to 3 on later ones, all on the road', () => {
  const counts = Tracks.TRACKS.map((def) => Sim.createRace(def, { seed: 3 }).animals.length);
  assert.ok(counts.every((n) => n >= 1 && n <= 3), String(counts));
  assert.equal(counts[0], 1);
  assert.equal(counts[counts.length - 1], 3);
  for (let i = 1; i < counts.length; i++) {
    if (!Tracks.TRACKS[i].bonus) assert.ok(counts[i] >= counts[i - 1] || Tracks.TRACKS[i].aiSkill < Tracks.TRACKS[i - 1].aiSkill);
  }
  for (const def of Tracks.TRACKS) {
    const s = Sim.createRace(def, { seed: 5 });
    for (let t = 0; t < 600; t++) Sim.step(s, {});
    for (const a of s.animals) {
      const c = s.track.samples[Tracks.nearestGlobal(s.track, a.x, a.y)];
      const lat = Math.abs((a.x - c.x) * c.nx + (a.y - c.y) * c.ny);
      assert.ok(lat <= s.track.halfWidth - a.r + 1, `${def.id} ${a.kind} off the road`);
    }
  }
});

test('hitting an animal knocks it down the track and costs some speed', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
  const me = s.racers[0];
  const a = s.animals[0];
  const c = s.track.samples[a.idx];
  // Put the player just behind the animal, flat out along the track.
  me.x = a.x - c.tx * 30;
  me.y = a.y - c.ty * 30;
  me.heading = c.angle;
  me.vx = c.tx * 180;
  me.vy = c.ty * 180;
  me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
  a.mode = 'pause';
  a.timer = 10;
  let hit = null;
  for (let t = 0; t < 30 && !hit; t++) {
    Sim.step(s, { 0: { steer: 0, throttle: 1, brake: 0, nitro: false } });
    hit = s.events.find((e) => e.type === 'animal');
    if (!hit) s.events.length = 0;
  }
  assert.ok(hit, 'should hit the animal');
  assert.equal(a.mode, 'tumble');
  assert.ok(a.vx * c.tx + a.vy * c.ty > 100, 'animal flies off down the track');
  assert.ok(Math.hypot(me.vx, me.vy) < 170, 'player loses some speed');
  let settled = false;
  for (let t = 0; t < 600 && !settled; t++) {
    Sim.step(s, {});
    settled = a.mode !== 'tumble';
  }
  assert.ok(settled, 'animal settles again');
});

test('rumble strips only cost speed if you steer while crossing them', () => {
  const def = Tracks.TRACKS.find((d) => d.features.some((f) => f.type === 'bumps'));
  const cross = (steer) => {
    const s = Sim.createRace(def, { seed: 1 });
    s.animals = [];
    const f = s.track.features.find((x) => x.type === 'bumps');
    const me = s.racers[0];
    const c = s.track.samples[f.idx];
    me.x = c.x - c.tx * (f.len / 2 + 2);
    me.y = c.y - c.ty * (f.len / 2 + 2);
    me.heading = c.angle;
    me.vx = c.tx * 160;
    me.vy = c.ty * 160;
    me.steer = steer;
    me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
    for (let t = 0; t < 20; t++) Sim.step(s, { 0: { steer, throttle: 1, brake: 0, nitro: false } });
    return Math.hypot(me.vx, me.vy);
  };
  const straight = cross(0);
  const turning = cross(0.5);
  assert.ok(straight >= 158, `straight across keeps speed (${straight.toFixed(0)})`);
  assert.ok(turning < straight - 20, `turning across costs speed (${turning.toFixed(0)} vs ${straight.toFixed(0)})`);
});

test('Farmyard Frenzy: just you, 100 animals, a minute, and they pop', () => {
  const def = Tracks.TRACKS[0];
  const s = Sim.createRace(def, { seed: 2, frenzy: true });
  assert.equal(s.racers.length, 1);
  assert.equal(s.animals.length, 100);
  assert.equal(s.pickups.length, 0);
  // Drop the tractor onto an animal: it pops, with no slowdown.
  const a = s.animals[10];
  const me = s.racers[0];
  me.x = a.x - 5;
  me.y = a.y;
  me.vx = 150;
  me.vy = 0;
  me.heading = 0;
  me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
  Sim.step(s, {});
  assert.ok(s.events.some((e) => e.type === 'pop'));
  assert.ok(s.frenzy.popped >= 1);
  assert.equal(s.animals.length, 100 - s.frenzy.popped);
  // The round ends after 60 seconds.
  for (let i = 0; i < 60 * 60 + 5 && !s.done; i++) Sim.step(s, { 0: { steer: 0, throttle: 0, brake: 1, nitro: false } });
  assert.ok(s.done);
  assert.ok(s.frenzy.timeLeft <= 0);
});

test('Farmyard Frenzy pays 5% of the winning prize per 5 popped, plus a clean sweep bonus', () => {
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 2, frenzy: true });
  assert.equal(Sim.frenzyRate(s.track), 15); // 300 × 5%
  s.frenzy.popped = 37;
  let e = Sim.frenzyEarnings(s);
  assert.equal(e.base, 7 * 15);
  assert.equal(e.hay, 105);
  assert.ok(!e.sweep);
  s.frenzy.popped = 100;
  e = Sim.frenzyEarnings(s);
  assert.ok(e.sweep);
  assert.equal(e.base, 300); // all 100 = a race win
  assert.equal(e.hay, 375);
  const last = Sim.createRace(Tracks.TRACKS[Tracks.TRACKS.length - 1], { seed: 1, frenzy: true });
  assert.equal(Sim.frenzyRate(last.track), 75);
});

test('vehicles: quads are faster than tractors, motorbikes faster still, and pay more', () => {
  const t = Sim.statsFor({}, 'tractor');
  const q = Sim.statsFor({}, 'quad');
  const m = Sim.statsFor({}, 'motorbike');
  assert.ok(q.topSpeed > t.topSpeed && m.topSpeed > q.topSpeed);
  assert.ok(q.accel > t.accel && m.accel > q.accel);
  const track = Tracks.buildTrack(Tracks.TRACKS[0]);
  const [pt, pq, pm] = ['tractor', 'quad', 'motorbike'].map((v) => Sim.prizesFor(track, v)[0]);
  assert.ok(pq > pt && pm > pq);
  const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1, vehicle: 'motorbike' });
  assert.ok(s.racers.every((r) => r.vehicle === 'motorbike' && r.stats.vehicle === 'motorbike'));
});

test('series: Quad Cup unlocks with a top 3 at the Harvest Grand Prix, with its own upgrades and results', () => {
  const g = Garage.createGarage(memStore());
  assert.equal(g.vehicle, 'tractor');
  assert.ok(!g.seriesUnlocked('quad'));
  assert.ok(!g.setVehicle('quad'));
  g.recordResult('harvest', 3, 100);
  assert.ok(g.seriesUnlocked('quad'));
  assert.ok(!g.seriesUnlocked('motorbike'));
  assert.ok(g.setVehicle('quad'));
  // Fresh upgrades and track progress in the new series, at a higher price.
  assert.equal(g.level, 0);
  assert.ok(g.nextCost('speed') > Garage.upgradeCost('speed', 0));
  assert.equal(g.bestFor('harvest'), undefined);
  assert.ok(!g.isUnlocked(Tracks.TRACKS.find((t) => t.id === 'barnyard')));
  g.recordResult('harvest', 1, 90);
  assert.ok(g.seriesUnlocked('motorbike'));
  g.setVehicle('tractor');
  assert.equal(g.bestFor('harvest').place, 3);
});

test('drifting into an animal costs less speed than hitting it normally', () => {
  const hit = (drift) => {
    const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
    const me = s.racers[0];
    const a = s.animals[0];
    const c = s.track.samples[a.idx];
    me.x = a.x - c.tx * 30;
    me.y = a.y - c.ty * 30;
    me.heading = c.angle;
    me.vx = c.tx * 160;
    me.vy = c.ty * 160;
    me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
    me.drifting = drift;
    a.mode = 'pause';
    a.timer = 10;
    for (let t = 0; t < 30; t++) {
      const before = Math.hypot(me.vx, me.vy);
      Sim.step(s, { 0: { steer: 0, throttle: 1, brake: 0, nitro: false, drift } });
      if (s.events.some((e) => e.type === 'animal')) return 1 - Math.hypot(me.vx, me.vy) / before;
      s.events.length = 0;
    }
    return null;
  };
  const normal = hit(false);
  const drifting = hit(true);
  assert.ok(normal != null && drifting != null);
  assert.ok(drifting < normal * 0.75, `drift loss ${drifting.toFixed(2)} vs normal ${normal.toFixed(2)}`);
});

test('the drift kick only comes from letting go, not from hitting water mid-drift', () => {
  const def = Tracks.TRACKS.find((d) => d.features.some((f) => f.type === 'water'));
  const s = Sim.createRace(def, { seed: 1 });
  s.animals = [];
  const me = s.racers[0];
  const w = s.track.features.find((f) => f.type === 'water');
  // Drifting straight into the middle of the pond.
  const c = s.track.samples[w.idx];
  me.x = w.x - c.tx * (w.len / 2 + 130);
  me.y = w.y - c.ty * (w.len / 2 + 130);
  me.heading = c.angle;
  me.vx = c.tx * 150;
  me.vy = c.ty * 150;
  me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
  const kicks = [];
  let wet = false;
  for (let t = 0; t < 90; t++) {
    const aim = Math.max(-1, Math.min(1, Sim.angleDiff(Math.atan2(w.y - me.y, w.x - me.x), me.heading) * 2));
    Sim.step(s, { 0: { steer: aim, throttle: 1, brake: 0, nitro: false, drift: true } });
    wet = wet || me.surface === 'water';
    kicks.push(...s.events.filter((e) => e.type === 'driftKick'));
    s.events.length = 0;
  }
  assert.ok(wet, 'reached the pond');
  assert.equal(kicks.length, 0, 'no kick from the pond ending the drift');
});

test('sliding into the outside wall mid-drift costs less than a normal knock', () => {
  const knock = (drift, steerSign) => {
    const s = Sim.createRace(Tracks.TRACKS[0], { seed: 1 });
    s.animals = [];
    const me = s.racers[0];
    for (const r of s.racers.slice(1)) r.x = -2000;
    s.animals = [];
    const c = s.track.samples[straightIdx(s.track)];
    me.x = c.x + c.nx * (s.track.halfWidth - 16);
    me.y = c.y + c.ny * (s.track.halfWidth - 16);
    const into = Math.sign(Sim.angleDiff(Math.atan2(c.ny, c.nx), c.angle));
    me.heading = c.angle + 0.35 * into;
    me.vx = Math.cos(me.heading) * 160;
    me.vy = Math.sin(me.heading) * 160;
    me.idx = Tracks.nearestGlobal(s.track, me.x, me.y);
    me.drifting = drift;
    me.driftSide = steerSign * into;
    me.drift = drift ? 0.6 * me.driftSide : 0;
    for (let i = 0; i < 40; i++) {
      const v0 = Math.hypot(me.vx, me.vy);
      const w0 = me.wallHit;
      Sim.step(s, { 0: { steer: 0.2 * me.driftSide, throttle: 1, brake: 0, nitro: false, drift } });
      if (me.wallHit > w0) return 1 - Math.hypot(me.vx, me.vy) / v0;
    }
    return null;
  };
  const normal = knock(false, 1);
  const outside = knock(true, -1);
  const inside = knock(true, 1);
  assert.ok(normal && outside && inside);
  assert.ok(outside < normal * 0.7, `outside ${outside.toFixed(3)} vs normal ${normal.toFixed(3)}`);
  assert.ok(inside > outside, 'the inside wall still bites');
});
