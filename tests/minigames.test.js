const test = require('node:test');
const assert = require('node:assert');
const Slots = require('../js/slots/slots-logic.js');
const Eggs = require('../js/eggs/egg-logic.js');
const { mulberry32 } = require('../js/rng.js');

test('slots return about 92% and hit about a quarter of the time (exact)', () => {
  const rtp = Slots.rtp();
  assert.ok(rtp > 0.9 && rtp < 0.95, `rtp ${rtp}`);
  const hit = Slots.hitRate();
  assert.ok(hit > 0.2 && hit < 0.3, `hit rate ${hit}`);
});

test('slot lines pay per the paytable, with the pig wild', () => {
  const pay = (l) => Slots.evaluate(l).multiplier;
  assert.strictEqual(pay(['truffle', 'truffle', 'truffle']), Slots.PAYTABLE.truffle);
  assert.strictEqual(pay(['pig', 'pig', 'pig']), Slots.PAYTABLE.pig);
  assert.strictEqual(pay(['egg', 'pig', 'egg']), Slots.PAYTABLE.egg);
  assert.strictEqual(pay(['pig', 'pig', 'apple']), Slots.PAYTABLE.apple);
  assert.strictEqual(pay(['carrot', 'straw', 'carrot']), Slots.PAYTABLE.twoCarrots);
  assert.strictEqual(pay(['carrot', 'pig', 'carrot']), Slots.PAYTABLE.carrot);
  assert.strictEqual(pay(['straw', 'straw', 'straw']), 0);
  assert.strictEqual(pay(['pig', 'straw', 'pig']), 0);
  assert.strictEqual(pay(['corn', 'apple', 'egg']), 0);
});

test('slot spins land on valid strip positions', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) {
    for (const s of Slots.spin(rng)) assert.ok(s >= 0 && s < Slots.STRIP.length);
  }
});

test('every egg roulette bet returns 12/13', () => {
  const ids = [...Array(13).keys()].map((n) => `n${n}`).concat(Eggs.OUTSIDE_BETS);
  for (const id of ids) {
    let back = 0;
    for (let n = 0; n < 13; n++) back += Eggs.settle({ [id]: 1 }, n).payout;
    assert.ok(Math.abs(back / 13 - 12 / 13) < 1e-12, id);
  }
});

test('egg roulette settles multiple bets and the golden nest beats outside bets', () => {
  const bets = { n7: 10, brown: 20, coopB: 5, odd: 4 };
  assert.deepStrictEqual(Eggs.settle(bets, 7), { payout: 10 * 12 + 5 * 3 + 4 * 2, winners: ['n7', 'coopB', 'odd'] });
  assert.deepStrictEqual(Eggs.settle(bets, 0), { payout: 0, winners: [] });
  assert.strictEqual(Eggs.colorOf(0), 'gold');
  assert.strictEqual(Eggs.betSpec('n13'), null);
  assert.strictEqual(new Set(Eggs.RING).size, 13);
});
