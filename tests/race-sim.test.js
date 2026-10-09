const test = require('node:test');
const assert = require('node:assert');
const Sim = require('../js/race-sim.js');

test('races are deterministic for a given seed', () => {
  const field = Sim.generateField(42);
  const a = Sim.runToEnd(field, 7);
  const b = Sim.runToEnd(field, 7);
  assert.deepStrictEqual(a.finishOrder, b.finishOrder);
  assert.strictEqual(a.t, b.t);
});

test('every race finishes with all six bales placed', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = Sim.runToEnd(Sim.generateField(seed * 13), seed);
    assert.strictEqual(s.finishOrder.length, 6);
    assert.deepStrictEqual([...s.finishOrder].sort(), [0, 1, 2, 3, 4, 5]);
    assert.ok(s.t < Sim.MAX_TIME, `race ${seed} hit the time limit`);
  }
});

test('animals get in the way', () => {
  let hits = 0;
  for (let seed = 1; seed <= 20; seed++) {
    hits += Sim.runToEnd(Sim.generateField(seed), seed).bales.reduce((n, b) => n + b.hits, 0);
  }
  assert.ok(hits / 20 > 3, `expected collisions, got ${hits / 20} per race`);
});

test('odds carry a house edge and are sensible', () => {
  const odds = Sim.estimateOdds(Sim.generateField(99), 1234, 200);
  const totalP = odds.reduce((s, o) => s + o.probability, 0);
  assert.ok(Math.abs(totalP - 1) < 1e-9);
  for (const o of odds) {
    assert.ok(o.odds >= 1.1 && o.odds <= 60);
    assert.ok(o.probability * o.odds <= 0.95, 'expected return should stay under 95%');
  }
});

test('payout pays stake times odds on the winner only', () => {
  const odds = [2.5, 4, 6, 8, 10, 12].map((o) => ({ odds: o }));
  const bets = [10, 0, 25, 0, 0, 3];
  assert.strictEqual(Sim.payout(bets, odds, 0), 25);
  assert.strictEqual(Sim.payout(bets, odds, 1), 0);
  assert.strictEqual(Sim.payout(bets, odds, 2), 150);
  assert.strictEqual(Sim.payout([0, 0, 0, 0, 0, 7], [1, 1, 1, 1, 1, 3.3].map((o) => ({ odds: o })), 5), 23);
});

test('physics keeps running after the result is locked', () => {
  const s = Sim.runToEnd(Sim.generateField(5), 5);
  const order = s.finishOrder.slice();
  const x = s.bales[0].x;
  for (let i = 0; i < 60; i++) Sim.step(s);
  assert.deepStrictEqual(s.finishOrder, order);
  assert.notStrictEqual(s.bales[0].x, x);
});
