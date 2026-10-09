// Egg Roulette — the hen lays in one of 13 nests: golden 0 and 1–12.
// Like roulette, every bet returns 12/13 (≈92.3%) on average.
(function (root) {
  const BROWN = new Set([1, 3, 5, 8, 10, 12]);
  // Order of nests round the ring, mixed so neighbours differ.
  const RING = [0, 7, 2, 11, 4, 9, 6, 1, 8, 3, 12, 5, 10];

  function colorOf(n) {
    if (n === 0) return 'gold';
    return BROWN.has(n) ? 'brown' : 'white';
  }

  // Bet types: id, label, the nests they cover and the payout (stake included).
  function betSpec(id) {
    if (/^n\d+$/.test(id)) {
      const n = Number(id.slice(1));
      if (n < 0 || n > 12) return null;
      return { id, label: n === 0 ? 'Golden nest' : `Nest ${n}`, covers: [n], pays: 12 };
    }
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const outside = {
      brown: { label: 'Brown eggs', covers: range(1, 12).filter((n) => BROWN.has(n)), pays: 2 },
      white: { label: 'White eggs', covers: range(1, 12).filter((n) => !BROWN.has(n)), pays: 2 },
      odd: { label: 'Odd', covers: range(1, 12).filter((n) => n % 2), pays: 2 },
      even: { label: 'Even', covers: range(1, 12).filter((n) => n % 2 === 0), pays: 2 },
      low: { label: '1–6', covers: range(1, 6), pays: 2 },
      high: { label: '7–12', covers: range(7, 12), pays: 2 },
      coopA: { label: 'Coop A (1–4)', covers: range(1, 4), pays: 3 },
      coopB: { label: 'Coop B (5–8)', covers: range(5, 8), pays: 3 },
      coopC: { label: 'Coop C (9–12)', covers: range(9, 12), pays: 3 },
    };
    return outside[id] ? { id, ...outside[id] } : null;
  }

  const OUTSIDE_BETS = ['brown', 'white', 'odd', 'even', 'low', 'high', 'coopA', 'coopB', 'coopC'];

  function roll(rng) {
    return Math.floor(rng() * 13);
  }

  // bets: { betId: stake }. Returns total paid back and the winning bet ids.
  function settle(bets, nest) {
    let payout = 0;
    const winners = [];
    for (const [id, stake] of Object.entries(bets)) {
      const spec = betSpec(id);
      if (!spec || !stake) continue;
      if (spec.covers.includes(nest)) {
        payout += stake * spec.pays;
        winners.push(id);
      }
    }
    return { payout, winners };
  }

  const api = { RING, BROWN, OUTSIDE_BETS, colorOf, betSpec, roll, settle };
  root.EggRoulette = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
