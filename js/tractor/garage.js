// Tractor Rally — garage: upgrades, paint, track progress. Persisted locally.
(function (root) {
  const KEY = 'farmCasino.tractor.v1';
  const MAX_LEVEL = 5;

  const UPGRADES = [
    { id: 'accel', name: 'Acceleration', icon: '⚡', desc: 'Get up to speed faster', base: 120 },
    { id: 'speed', name: 'Top Speed', icon: '💨', desc: 'Higher top speed', base: 150 },
    { id: 'handling', name: 'Handling', icon: '🛞', desc: 'Tighter turns, more grip', base: 130 },
    { id: 'boost', name: 'Boosts', icon: '🔥', desc: '+1 nitro boost per race', base: 140 },
  ];

  const PAINTS = [
    { id: 'red', hex: '#e2412f', name: 'Barn Red' },
    { id: 'green', hex: '#2e9e3e', name: 'Field Green' },
    { id: 'blue', hex: '#2f6fe2', name: 'Sky Blue' },
    { id: 'orange', hex: '#f07c1b', name: 'Pumpkin' },
    { id: 'pink', hex: '#f06aa6', name: 'Piggy Pink' },
    { id: 'black', hex: '#3a3a3a', name: 'Midnight' },
  ];

  function upgradeCost(id, level) {
    const u = UPGRADES.find((x) => x.id === id);
    return Math.round((u.base * Math.pow(level + 1, 1.5)) / 10) * 10;
  }

  function defaults() {
    return {
      upgrades: { accel: 0, speed: 0, handling: 0, boost: 0 },
      refund: 0, // credits owed back from retired upgrades, paid by the game
      paint: 'red',
      best: {}, // trackId -> { place, time }
      races: 0,
      wins: 0,
    };
  }

  // Saves from before the upgrade list was simplified used engine/gearbox/
  // tyres/suspension/nitro. Carry levels across; refund suspension in full.
  const OLD_COSTS = { suspension: 110 };
  function migrateUpgrades(p, fresh) {
    const old = p.upgrades || {};
    if (!('engine' in old || 'gearbox' in old || 'tyres' in old || 'suspension' in old || 'nitro' in old)) {
      return { ...fresh, ...old };
    }
    let refund = 0;
    for (let l = 0; l < (old.suspension || 0); l++) {
      refund += Math.round((OLD_COSTS.suspension * Math.pow(l + 1, 1.5)) / 10) * 10;
    }
    p.refund = (p.refund || 0) + refund;
    return {
      accel: old.gearbox || 0,
      speed: old.engine || 0,
      handling: old.tyres || 0,
      boost: old.nitro || 0,
    };
  }

  function createGarage(storage) {
    let store = storage;
    if (!store) {
      try {
        store = root.localStorage;
      } catch (e) {
        store = null;
      }
    }
    let state = load();

    function load() {
      try {
        const raw = store && store.getItem(KEY);
        if (raw) {
          const d = defaults();
          const p = JSON.parse(raw);
          const upgrades = migrateUpgrades(p, d.upgrades); // may add p.refund
          return { ...d, ...p, upgrades, best: p.best || {} };
        }
      } catch (e) {
        // Corrupt save: fall back to a fresh garage.
      }
      return defaults();
    }

    function save() {
      try {
        if (store) store.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        // Ignore storage failures.
      }
    }

    return {
      get state() {
        return state;
      },
      get level() {
        return Object.values(state.upgrades).reduce((a, b) => a + b, 0);
      },
      paintHex() {
        return (PAINTS.find((p) => p.id === state.paint) || PAINTS[0]).hex;
      },
      nextCost(id) {
        const lvl = state.upgrades[id];
        return lvl >= MAX_LEVEL ? null : upgradeCost(id, lvl);
      },
      // Charges the wallet and levels up. Returns false if unaffordable/maxed.
      buy(id, wallet) {
        const cost = this.nextCost(id);
        if (cost == null || !wallet.canAfford(cost)) return false;
        const u = UPGRADES.find((x) => x.id === id);
        wallet.spend(cost, `Tractor upgrade: ${u.name} level ${state.upgrades[id] + 1}`);
        state.upgrades[id]++;
        save();
        return true;
      },
      // Hand any owed refund to the wallet once.
      payRefund(wallet) {
        const n = state.refund || 0;
        if (n > 0) {
          wallet.credit(n, 'Refund: Suspension upgrade retired');
          state.refund = 0;
          save();
        }
        return n;
      },
      setPaint(id) {
        if (PAINTS.some((p) => p.id === id)) {
          state.paint = id;
          save();
        }
      },
      isUnlocked(track) {
        if (!track.unlock) return true;
        const b = state.best[track.unlock.track];
        return !!b && b.place <= track.unlock.place;
      },
      recordResult(trackId, place, time) {
        state.races++;
        if (place === 1) state.wins++;
        const b = state.best[trackId];
        if (!b || place < b.place || (place === b.place && time != null && (b.time == null || time < b.time))) {
          state.best[trackId] = { place, time };
        }
        save();
      },
      reset() {
        state = defaults();
        save();
      },
    };
  }

  const api = { UPGRADES, PAINTS, MAX_LEVEL, upgradeCost, createGarage };
  root.TractorGarage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
