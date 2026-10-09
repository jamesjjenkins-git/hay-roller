// Apple in-app purchases for the iPhone app: a billing adapter for
// js/monetize/store.js over the app's own StoreKit plugin
// (plugins/farm-store). In a browser this does nothing and the store stays
// in test mode.
(function (root) {
  // App Store product ids. Apple never lets an id be reused, even after
  // deleting the product, so these are fixed: create the products in App
  // Store Connect with exactly these ids (and the same in
  // ios/App/App/Products.storekit for local testing).
  const APPLE_IDS = {
    gold_small: 'com.jamesjenkins.farmyardrally.gold.small',
    gold_medium: 'com.jamesjenkins.farmyardrally.gold.medium',
    gold_large: 'com.jamesjenkins.farmyardrally.gold.large',
    remove_ads: 'com.jamesjenkins.farmyardrally.removeads',
  };

  function createAppStoreBilling({ plugin, ids = APPLE_IDS }) {
    const toApple = (id) => ids[id];
    const fromApple = (appleId) => Object.keys(ids).find((k) => ids[k] === appleId);
    const local = (t) => ({ transactionId: t.transactionId, productId: fromApple(t.productId), revoked: !!t.revoked });

    return {
      testMode: false,
      async loadProducts() {
        const { products } = await plugin.getProducts({ ids: Object.values(ids) });
        const prices = {};
        for (const p of products) {
          const id = fromApple(p.id);
          if (id) prices[id] = p.displayPrice;
        }
        return prices;
      },
      async purchase(product) {
        const r = await plugin.purchase({ id: toApple(product.id) });
        if (r.status === 'purchased') return { ok: true, transactionId: r.transactionId };
        if (r.status === 'cancelled') return { ok: false, cancelled: true };
        if (r.status === 'pending') return { ok: false, pending: true };
        return { ok: false, error: "Apple couldn't confirm that purchase." };
      },
      finish(transactionId) {
        return plugin.finish({ transactionId });
      },
      async unfinished() {
        const { transactions } = await plugin.unfinished();
        return transactions.map(local).filter((t) => t.productId);
      },
      async entitlements() {
        const { productIds } = await plugin.entitlements();
        return productIds.map(fromApple).filter(Boolean);
      },
      async restore() {
        const { productIds } = await plugin.restore();
        return productIds.map(fromApple).filter(Boolean);
      },
      onTransaction(fn) {
        plugin.addListener('transaction', (t) => {
          const lt = local(t);
          if (lt.productId) fn(lt);
        });
      },
    };
  }

  // The plugin, when running in the iPhone app.
  function nativePlugin() {
    const cap = root.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable('FarmStore')) {
      return cap.registerPlugin('FarmStore');
    }
    return null;
  }

  const api = { APPLE_IDS, createAppStoreBilling, nativePlugin };
  root.FarmIAP = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
