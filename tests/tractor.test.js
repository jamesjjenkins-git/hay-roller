const test = require('node:test');
const assert = require('node:assert');
const Tracks = require('../js/tractor/tracks.js');
const Sim = require('../js/tractor/sim.js');
const Garage = require('../js/tractor/garage.js');

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
        const c = def.crossing;
        const nearCross = (p) => c && Math.hypot(p.x - c.x, p.y - c.y) < c.r;
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
  }
  const me = s.racers[0];
  const sm = s.track.samples[40];
  me.idx = 40;
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
