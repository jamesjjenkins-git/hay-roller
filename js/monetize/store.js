// In-app store: Gold packs and "Remove ads".
//
// Real money only ever buys Gold or Remove ads. Gold is spent on cosmetics
// (premium paints) and can never be turned into Hay or used in the casino
// games. Purchases go through a `billing` adapter. The default adapter is a
// TEST MODE that grants items without taking payment; on the App Store it is
// replaced by an Apple in-app purchase adapter (see README).
(function (root) {
  const KEY = 'farmCasino.store.v1';

  const PRODUCTS = [
    { id: 'gold_small', kind: 'gold', gold: 100, price: '£0.99', name: 'Pocket of Gold' },
    { id: 'gold_medium', kind: 'gold', gold: 550, price: '£4.99', name: 'Pail of Gold', tag: '+10%' },
    { id: 'gold_large', kind: 'gold', gold: 1200, price: '£9.99', name: 'Barrow of Gold', tag: '+20%' },
    { id: 'remove_ads', kind: 'entitlement', price: '£2.99', name: 'Remove ads', desc: 'Hides the home page banner for good. Optional reward videos stay available.' },
  ];

  // Test-mode billing: asks for confirmation, then "succeeds" without payment.
  function testBilling(confirmFn) {
    return {
      testMode: true,
      async purchase(product) {
        const ok = await confirmFn(product);
        return ok ? { ok: true, transactionId: `test-${Date.now()}` } : { ok: false, cancelled: true };
      },
      async restore() {
        return [];
      },
    };
  }

  function createStore({ storage, goldWallet, billing }) {
    let state = load();
    const listeners = new Set();

    function load() {
      try {
        const raw = storage && storage.getItem(KEY);
        if (raw) return { owned: [], ...JSON.parse(raw) };
      } catch (e) {
        // Fresh state.
      }
      return { owned: [] };
    }

    function save() {
      try {
        if (storage) storage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        // Ignore.
      }
      listeners.forEach((fn) => fn());
    }

    function grant(product) {
      if (product.kind === 'gold') goldWallet.deposit(product.gold, `Bought ${product.name}`);
      else if (!state.owned.includes(product.id)) {
        state.owned.push(product.id);
        save();
      }
    }

    return {
      PRODUCTS,
      get testMode() {
        return !!billing.testMode;
      },
      owns(id) {
        return state.owned.includes(id);
      },
      async buy(id) {
        const product = PRODUCTS.find((p) => p.id === id);
        if (!product) return { ok: false, error: 'Unknown product' };
        if (product.kind === 'entitlement' && this.owns(id)) return { ok: true, already: true };
        const result = await billing.purchase(product);
        if (result.ok) grant(product);
        return result;
      },
      async restore() {
        const ids = await billing.restore();
        for (const id of ids) {
          const p = PRODUCTS.find((x) => x.id === id && x.kind === 'entitlement');
          if (p) grant(p);
        }
        return ids;
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }

  const api = { PRODUCTS, createStore, testBilling };
  root.FarmStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
