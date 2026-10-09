const test = require('node:test');
const assert = require('node:assert');
const { createWallet, GOLD_KEY } = require('../js/wallet.js');
const { createRewards, AMOUNTS, ADS_PER_DAY } = require('../js/monetize/rewards.js');
const { createStore, testBilling, PRODUCTS } = require('../js/monetize/store.js');
const Garage = require('../js/tractor/garage.js');

function memStore() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)), removeItem: (k) => delete d[k] };
}

test('welcome gift is paid once', () => {
  const s = memStore();
  const hay = createWallet(s);
  const r = createRewards({ storage: s, wallet: hay });
  assert.strictEqual(r.claimWelcome(), AMOUNTS.welcome);
  assert.strictEqual(r.claimWelcome(), 0);
  assert.strictEqual(createRewards({ storage: s, wallet: hay }).claimWelcome(), 0);
  assert.strictEqual(hay.balance, AMOUNTS.welcome);
});

test('daily bonus resets at local midnight', () => {
  const s = memStore();
  const hay = createWallet(s);
  let t = new Date(2026, 9, 9, 23, 0).getTime();
  const r = createRewards({ storage: s, wallet: hay, now: () => t });
  assert.strictEqual(r.claimDaily(), AMOUNTS.daily);
  assert.strictEqual(r.claimDaily(), 0);
  assert.strictEqual(r.msUntilDaily(), 60 * 60 * 1000);
  t += 61 * 60 * 1000;
  assert.strictEqual(r.dailyAvailable(), true);
  assert.strictEqual(r.claimDaily(), AMOUNTS.daily);
  assert.strictEqual(hay.balance, AMOUNTS.daily * 2);
});

test('rewarded ads are capped per day', () => {
  const s = memStore();
  const hay = createWallet(s);
  let t = new Date(2026, 9, 9, 10, 0).getTime();
  const r = createRewards({ storage: s, wallet: hay, now: () => t });
  for (let i = 0; i < ADS_PER_DAY; i++) assert.strictEqual(r.grantAdReward('wallet'), AMOUNTS.ad);
  assert.strictEqual(r.adsRemaining(), 0);
  assert.strictEqual(r.grantAdReward('wallet'), 0);
  assert.strictEqual(r.grantAdReward('double', 300), 0);
  t += 24 * 60 * 60 * 1000;
  assert.strictEqual(r.adsRemaining(), ADS_PER_DAY);
  assert.strictEqual(r.grantAdReward('double', 300), 300);
});

test('store sells Gold packs and Remove ads; cancelling grants nothing', async () => {
  const s = memStore();
  const gold = createWallet(s, { key: GOLD_KEY });
  let answer = true;
  const store = createStore({ storage: s, goldWallet: gold, billing: testBilling(async () => answer) });
  assert.strictEqual(store.testMode, true);
  assert.ok((await store.buy('gold_medium')).ok);
  assert.strictEqual(gold.balance, 550);
  answer = false;
  assert.strictEqual((await store.buy('gold_small')).ok, false);
  assert.strictEqual(gold.balance, 550);
  assert.strictEqual(store.owns('remove_ads'), false);
  answer = true;
  await store.buy('remove_ads');
  assert.strictEqual(store.owns('remove_ads'), true);
  assert.strictEqual(createStore({ storage: s, goldWallet: gold, billing: testBilling(async () => true) }).owns('remove_ads'), true);
});

test('Gold and Hay are separate wallets', () => {
  const s = memStore();
  const hay = createWallet(s);
  const gold = createWallet(s, { key: GOLD_KEY });
  gold.deposit(100, 'test');
  assert.strictEqual(hay.balance, 0);
  assert.throws(() => hay.spend(10));
  // Every real-money product yields Gold or an entitlement, never Hay.
  for (const p of PRODUCTS) assert.ok(p.kind === 'gold' || p.kind === 'entitlement');
});

test('premium paints cost Gold and must be owned before use', () => {
  const s = memStore();
  const gold = createWallet(s, { key: GOLD_KEY });
  const g = Garage.createGarage(s);
  g.setPaint('chrome');
  assert.notStrictEqual(g.state.paint, 'chrome', 'cannot use an unbought paint');
  assert.strictEqual(g.buyPaint('chrome', gold), false);
  gold.deposit(250, 'test');
  assert.strictEqual(g.buyPaint('chrome', gold), true);
  assert.strictEqual(gold.balance, 50);
  assert.strictEqual(g.state.paint, 'chrome');
  assert.strictEqual(g.buyPaint('chrome', gold), true, 'already owned');
  assert.strictEqual(gold.balance, 50, 'not charged twice');
  assert.strictEqual(Garage.createGarage(s).paintOwned('chrome'), true);
});
