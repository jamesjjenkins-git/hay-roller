// In-app store: Gold packs and "Remove ads".
//
// Real money only ever buys Gold or Remove ads. Gold is spent on cosmetics
// (premium paints) and can never be turned into Hay or used in the casino
// games. Purchases go through a `billing` adapter. In a browser that's a
// TEST MODE that grants items without taking payment; in the iPhone app it's
// Apple in-app purchase (js/monetize/iap.js).
//
// Billing adapter:
//   purchase(product)   -> { ok, transactionId } | { cancelled } | { pending } | { error }
//   restore()           -> ids of entitlements owned
//   testMode            true for the free test adapter
// and, for real payments:
//   loadProducts()      -> { [id]: displayPrice }, the store's own prices
//   finish(txId)        tell the store a purchase has been granted
//   unfinished()        -> [{ transactionId, productId }] paid for, not yet finished
//   entitlements()      -> ids of entitlements owned right now (refunds drop out)
//   onTransaction(fn)   purchases completing outside buy() (Ask to Buy, etc.)
//
// A paid purchase is granted first and finished after, and each transaction
// is granted at most once, so neither a crash nor a repeat delivery can lose
// or double what was paid for.
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

  // How many granted transaction ids to remember (they only need to outlive
  // the store redelivering them).
  const GRANTED_KEEP = 200;

  function createStore({ storage, goldWallet, billing }) {
    let state = load();
    const listeners = new Set();
    const deliveredListeners = new Set();
    let prices = {};
    // Real payments can't be taken until the store's products have loaded.
    let available = !billing.loadProducts;
    let listening = false;

    function load() {
      try {
        const raw = storage && storage.getItem(KEY);
        if (raw) return { owned: [], granted: [], ...JSON.parse(raw) };
      } catch (e) {
        // Fresh state.
      }
      return { owned: [], granted: [] };
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

    // Grant a paid purchase once, then let the store finish it.
    async function deliver(product, transactionId) {
      let granted = false;
      if (!transactionId || !state.granted.includes(transactionId)) {
        grant(product);
        granted = true;
        if (transactionId) {
          state.granted = [...state.granted, transactionId].slice(-GRANTED_KEEP);
          save();
        }
      }
      if (transactionId && billing.finish) {
        try {
          await billing.finish(transactionId);
        } catch (e) {
          // Comes back as unfinished next launch; it won't be granted twice.
        }
      }
      return granted;
    }

    // A purchase that arrived on its own (Ask to Buy approved, or one
    // interrupted last time): grant it and tell the page.
    async function deliverLate(t) {
      const product = PRODUCTS.find((p) => p.id === t.productId);
      if (!product) return;
      if (t.revoked) {
        await syncEntitlements();
        return;
      }
      if (await deliver(product, t.transactionId)) deliveredListeners.forEach((fn) => fn(product));
    }

    // Who owns what is the store's to say: a restore on a new phone adds it,
    // a refund takes it away.
    async function syncEntitlements() {
      if (!billing.entitlements) return;
      let ids;
      try {
        ids = await billing.entitlements();
      } catch (e) {
        return; // Keep what we had.
      }
      const ent = PRODUCTS.filter((p) => p.kind === 'entitlement').map((p) => p.id);
      const owned = [...state.owned.filter((id) => !ent.includes(id)), ...ent.filter((id) => ids.includes(id))];
      if (owned.join() !== state.owned.join()) {
        state.owned = owned;
        save();
      }
    }

    return {
      PRODUCTS,
      get testMode() {
        return !!billing.testMode;
      },
      get available() {
        return available;
      },
      price(id) {
        return prices[id] || PRODUCTS.find((p) => p.id === id).price;
      },
      // Load prices, pick up anything paid for but not granted, and check
      // what's owned. Safe to call more than once.
      async init() {
        if (billing.onTransaction && !listening) {
          listening = true;
          billing.onTransaction((t) => deliverLate(t));
        }
        if (billing.loadProducts) {
          try {
            prices = await billing.loadProducts();
            available = PRODUCTS.every((p) => prices[p.id]);
          } catch (e) {
            available = false;
          }
          listeners.forEach((fn) => fn());
        }
        if (billing.unfinished) {
          try {
            for (const t of await billing.unfinished()) await deliverLate(t);
          } catch (e) {
            // Try again next launch.
          }
        }
        await syncEntitlements();
      },
      owns(id) {
        return state.owned.includes(id);
      },
      async buy(id) {
        const product = PRODUCTS.find((p) => p.id === id);
        if (!product) return { ok: false, error: 'Unknown product' };
        if (product.kind === 'entitlement' && this.owns(id)) return { ok: true, already: true };
        if (!available) return { ok: false, error: 'The store isn\'t available right now.' };
        let result;
        try {
          result = await billing.purchase(product);
        } catch (e) {
          return { ok: false, error: 'The purchase didn\'t go through.' };
        }
        if (result.ok) await deliver(product, result.transactionId);
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
      onDelivered(fn) {
        deliveredListeners.add(fn);
      },
    };
  }

  const api = { PRODUCTS, createStore, testBilling };
  root.FarmStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
