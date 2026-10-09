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
