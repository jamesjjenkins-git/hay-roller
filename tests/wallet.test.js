const test = require('node:test');
const assert = require('node:assert');
const { createWallet } = require('../js/wallet.js');

function memStore() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)), removeItem: (k) => delete d[k] };
}

test('starts empty and accepts deposits', () => {
  const w = createWallet(memStore());
  assert.strictEqual(w.balance, 0);
  w.deposit(500);
  assert.strictEqual(w.balance, 500);
  assert.strictEqual(w.history()[0].type, 'deposit');
});

test('spend refuses to overdraw', () => {
  const w = createWallet(memStore());
  w.deposit(100);
  assert.throws(() => w.spend(101), /Not enough credits/);
  w.spend(40);
  assert.strictEqual(w.balance, 60);
});

test('rejects non-integer or non-positive amounts', () => {
  const w = createWallet(memStore());
  for (const bad of [0, -5, 1.5, NaN, '10']) assert.throws(() => w.deposit(bad));
});

test('persists across instances and survives corrupt data', () => {
  const store = memStore();
  createWallet(store).deposit(250);
  assert.strictEqual(createWallet(store).balance, 250);
  store.setItem('farmCasino.wallet.v1', '{not json');
  assert.strictEqual(createWallet(store).balance, 0);
});

test('notifies subscribers', () => {
  const w = createWallet(memStore());
  const seen = [];
  w.subscribe((b) => seen.push(b));
  w.deposit(10);
  w.credit(5);
  assert.deepStrictEqual(seen, [10, 15]);
});
