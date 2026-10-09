// Play-money wallet. Credits have no cash value; they live in localStorage.
(function (root) {
  const STORAGE_KEY = 'farmCasino.wallet.v1';
  const HISTORY_LIMIT = 100;

  function memoryStorage() {
    const data = {};
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => (data[k] = String(v)),
      removeItem: (k) => delete data[k],
    };
  }

  function safeStorage(storage) {
    try {
      const s = storage || root.localStorage;
      const probe = '__farm_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return memoryStorage();
    }
  }

  function createWallet(storage) {
    const store = safeStorage(storage);
    const listeners = new Set();
    let state = load();

    function load() {
      try {
        const raw = store.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Number.isInteger(parsed.balance) && parsed.balance >= 0 && Array.isArray(parsed.history)) {
            return parsed;
          }
        }
      } catch (e) {
        // Corrupt data: start fresh rather than crash.
      }
      return { balance: 0, history: [] };
    }

    function save() {
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // Storage full or blocked; balance still works for this session.
      }
      listeners.forEach((fn) => fn(state.balance));
    }

    function record(type, amount, note) {
      state.history.unshift({ t: Date.now(), type, amount, note, balance: state.balance });
      if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
      save();
    }

    function assertAmount(amount) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive whole number');
    }

    return {
      get balance() {
        return state.balance;
      },
      history() {
        return state.history.slice();
      },
      canAfford(amount) {
        return amount <= state.balance;
      },
      // Top up with free play credits.
      deposit(amount, note = 'Credits added') {
        assertAmount(amount);
        state.balance += amount;
        record('deposit', amount, note);
      },
      // Spend on a bet. Throws if the wallet cannot cover it.
      spend(amount, note = 'Bet placed') {
        assertAmount(amount);
        if (amount > state.balance) throw new Error('Not enough credits');
        state.balance -= amount;
        record('bet', -amount, note);
      },
      // Pay out winnings or refunds.
      credit(amount, note = 'Winnings') {
        assertAmount(amount);
        state.balance += amount;
        record('win', amount, note);
      },
      reset() {
        state = { balance: 0, history: [] };
        save();
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
  }

  const api = { createWallet, STORAGE_KEY };
  root.FarmWallet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
