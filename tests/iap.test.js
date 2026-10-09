const test = require('node:test');
const assert = require('node:assert');
const { createWallet, GOLD_KEY } = require('../js/wallet.js');
const { createStore } = require('../js/monetize/store.js');
const { createAppStoreBilling, APPLE_IDS } = require('../js/monetize/iap.js');

function memStore() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)), removeItem: (k) => delete d[k] };
}

// A stand-in for the StoreKit plugin.
function fakeStoreKit({ purchaseStatus = 'purchased', unfinished = [], owned = [], noProducts = false } = {}) {
  let tx = 100;
  const log = [];
  const listeners = [];
  const plugin = {
    log,
    owned,
    unfinishedList: unfinished,
    emit: (t) => listeners.forEach((f) => f(t)),
    async getProducts({ ids }) {
      if (noProducts) throw new Error('offline');
      return { products: ids.map((id) => ({ id, displayPrice: `£${id.length}.99` })) };
    },
    async purchase({ id }) {
      log.push(['purchase', id]);
      if (purchaseStatus !== 'purchased') return { status: purchaseStatus };
      return { status: 'purchased', transactionId: String(++tx), productId: id };
    },
    async finish({ transactionId }) {
      log.push(['finish', transactionId]);
      plugin.unfinishedList = plugin.unfinishedList.filter((t) => t.transactionId !== transactionId);
      return { finished: true };
    },
    async unfinished() {
      return { transactions: plugin.unfinishedList };
    },
    async entitlements() {
      return { productIds: plugin.owned };
    },
    async restore() {
      return { productIds: plugin.owned };
    },
    addListener(ev, f) {
      listeners.push(f);
    },
  };
  return plugin;
}

function setup(opts) {
  const s = memStore();
  const gold = createWallet(s, { key: GOLD_KEY });
  const plugin = fakeStoreKit(opts);
  const billing = createAppStoreBilling({ plugin });
  // Note when Gold lands relative to the store being told it's finished.
  const goldDeposit = gold.deposit.bind(gold);
  gold.deposit = (n, why) => {
    plugin.log.push(['grant', n]);
    return goldDeposit(n, why);
  };
  const store = createStore({ storage: s, goldWallet: gold, billing });
  return { s, gold, plugin, store, billing };
}

test('App Store prices replace the built-in ones', async () => {
  const { store } = setup();
  await store.init();
  assert.ok(store.available);
  assert.strictEqual(store.price('gold_small'), `£${APPLE_IDS.gold_small.length}.99`);
});

test('a paid purchase is granted first, then finished', async () => {
  const { store, gold, plugin } = setup();
  await store.init();
  const r = await store.buy('gold_medium');
  assert.ok(r.ok);
  assert.strictEqual(gold.balance, 550);
  const steps = plugin.log.map((e) => e[0]);
  assert.deepStrictEqual(steps, ['purchase', 'grant', 'finish']);
});

test('a purchase interrupted before it was granted arrives next launch, once', async () => {
  const unfinished = [{ transactionId: '7', productId: APPLE_IDS.gold_large }];
  const { store, gold, plugin, s, billing } = setup({ unfinished });
  const delivered = [];
  store.onDelivered((p) => delivered.push(p.id));
  await store.init();
  assert.strictEqual(gold.balance, 1200);
  assert.deepStrictEqual(delivered, ['gold_large']);
  // Granted but the finish was lost (say the app closed): it comes back,
  // gets finished, and is not granted again.
  plugin.unfinishedList = [{ transactionId: '7', productId: APPLE_IDS.gold_large }];
  const again = createStore({ storage: s, goldWallet: gold, billing });
  await again.init();
  assert.strictEqual(gold.balance, 1200);
  assert.strictEqual(plugin.log.filter((e) => e[0] === 'finish').length, 2);
});

test('Ask to Buy: pending pays nothing until it is approved', async () => {
  const { store, gold, plugin } = setup({ purchaseStatus: 'pending' });
  await store.init();
  const r = await store.buy('gold_small');
  assert.ok(r.pending && !r.ok);
  assert.strictEqual(gold.balance, 0);
  plugin.emit({ transactionId: '55', productId: APPLE_IDS.gold_small });
  await new Promise((res) => setTimeout(res, 0));
  assert.strictEqual(gold.balance, 100);
});

test('cancelling costs nothing and grants nothing', async () => {
  const { store, gold } = setup({ purchaseStatus: 'cancelled' });
  await store.init();
  const r = await store.buy('gold_small');
  assert.ok(r.cancelled);
  assert.strictEqual(gold.balance, 0);
});

test('Remove ads follows what Apple says is owned: restore adds it, a refund takes it away', async () => {
  const { store, plugin } = setup({ owned: [APPLE_IDS.remove_ads] });
  await store.init();
  assert.ok(store.owns('remove_ads'));
  plugin.owned = [];
  plugin.emit({ transactionId: '9', productId: APPLE_IDS.remove_ads, revoked: true });
  await new Promise((res) => setTimeout(res, 0));
  assert.ok(!store.owns('remove_ads'));
  plugin.owned = [APPLE_IDS.remove_ads];
  await store.restore();
  assert.ok(store.owns('remove_ads'));
});

test('no free purchases when the App Store is unreachable', async () => {
  const { store, gold, plugin } = setup({ noProducts: true });
  await store.init();
  assert.ok(!store.available);
  const r = await store.buy('gold_small');
  assert.ok(!r.ok);
  assert.strictEqual(gold.balance, 0);
  assert.ok(!plugin.log.some((e) => e[0] === 'purchase'));
});
