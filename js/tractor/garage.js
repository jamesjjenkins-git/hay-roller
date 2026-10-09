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
    // Premium paints, bought once with Gold.
    { id: 'mint', hex: '#3fd1b0', name: 'Mint Julep', gold: 60 },
    { id: 'camo', hex: '#5b6b2f', name: 'Hedge Camo', gold: 80 },
    { id: 'royal', hex: '#6a2fc9', name: 'Royal Show', gold: 100 },
    { id: 'goldrush', hex: '#d9a521', name: 'Gold Rush', gold: 150 },
    { id: 'chrome', hex: '#c3ccd6', name: 'Chrome', gold: 200 },
  ];

  const TROPHIES = [
    { id: 'gold', icon: '🥇', name: 'Gold trophy' },
    { id: 'silver', icon: '🥈', name: 'Silver trophy' },
    { id: 'bronze', icon: '🥉', name: 'Bronze trophy' },
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
      ownedPaints: [], // premium paints bought with Gold
      best: {}, // trackId -> { place, time }
      // trackId -> { gold, silver, bronze, fastest, bestLap }
      awards: {},
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
          return { ...d, ...p, upgrades, best: p.best || {}, awards: p.awards || {}, ownedPaints: p.ownedPaints || [] };
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
      paintOwned(id) {
        const p = PAINTS.find((x) => x.id === id);
        return !!p && (!p.gold || state.ownedPaints.includes(id));
      },
      // Spends Gold on a premium paint and applies it. False if unaffordable.
      buyPaint(id, goldWallet) {
        const p = PAINTS.find((x) => x.id === id);
        if (!p || !p.gold) return false;
        if (state.ownedPaints.includes(id)) return true;
        if (!goldWallet.canAfford(p.gold)) return false;
        goldWallet.spend(p.gold, `Premium paint: ${p.name}`);
        state.ownedPaints.push(id);
        state.paint = id;
        save();
        return true;
      },
      setPaint(id) {
        if (this.paintOwned(id)) {
          state.paint = id;
          save();
        }
      },
      // Testing switch: every track is open regardless of results.
      get unlockAll() {
        return !!state.unlockAll;
      },
      setUnlockAll(on) {
        state.unlockAll = !!on;
        save();
      },
      isUnlocked(track) {
        if (!track.unlock || state.unlockAll) return true;
        const b = state.best[track.unlock.track];
        return !!b && b.place <= track.unlock.place;
      },
      // Records a finished race. `extra` carries { fastestLap, bestLap }.
      // Returns what's new so the results screen can celebrate it.
      recordResult(trackId, place, time, extra = {}) {
        state.races++;
        if (place === 1) state.wins++;
        const b = state.best[trackId];
        const betterPlace = !b || place < b.place;
        if (betterPlace || (place === b.place && time != null && (b.time == null || time < b.time))) {
          state.best[trackId] = { place, time };
        }
        const a = (state.awards[trackId] = { gold: 0, silver: 0, bronze: 0, fastest: 0, bestLap: null, ...state.awards[trackId] });
        const trophy = TROPHIES[place - 1];
        if (trophy) a[trophy.id]++;
        if (extra.fastestLap) a.fastest++;
        const lapRecord = extra.bestLap != null && (a.bestLap == null || extra.bestLap < a.bestLap);
        const hadLap = a.bestLap != null;
        if (lapRecord) a.bestLap = extra.bestLap;
        save();
        return {
          trophy: trophy || null,
          newBestTrophy: !!trophy && betterPlace,
          lapRecord: lapRecord && hadLap,
          firstLapTime: lapRecord && !hadLap,
        };
      },
      // Totals across every track for the cabinet header.
      awardTotals() {
        const t = { gold: 0, silver: 0, bronze: 0, fastest: 0 };
        for (const a of Object.values(state.awards)) {
          for (const k of Object.keys(t)) t[k] += a[k] || 0;
        }
        return t;
      },
      reset() {
        state = defaults();
        save();
      },
    };
  }

  const api = { UPGRADES, PAINTS, TROPHIES, MAX_LEVEL, upgradeCost, createGarage };
  root.TractorGarage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
