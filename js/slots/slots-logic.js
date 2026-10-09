// Piggy Bank Slots — reel strips, paytable and line evaluation.
// Three reels, one payline (the middle row). The pig is wild.
(function (root) {
  const SYMBOLS = {
    truffle: { icon: '🍄', name: 'Golden Truffle' },
    pig: { icon: '🐷', name: 'Piggy (wild)' },
    egg: { icon: '🥚', name: 'Egg' },
    apple: { icon: '🍎', name: 'Apple' },
    corn: { icon: '🌽', name: 'Corn' },
    carrot: { icon: '🥕', name: 'Carrot' },
    straw: { icon: '🌾', name: 'Straw' },
  };

  // How many times each symbol appears on every reel (same strip on all 3).
  const STRIP_COUNTS = { truffle: 1, pig: 1, egg: 2, apple: 3, corn: 5, carrot: 7, straw: 5 };

  // Payout as a multiple of the stake (the stake itself is included).
  // Tuned so the exact return to player is about 92% with a win on ~23% of spins.
  const PAYTABLE = {
    truffle: 300, // three truffles: the jackpot
    pig: 120, // three wild pigs
    egg: 40,
    apple: 16,
    corn: 8,
    carrot: 4,
    twoCarrots: 2, // any two carrots on the line
  };

  // Interleave symbols so identical ones aren't bunched together.
  function buildStrip() {
    const pool = [];
    for (const [sym, n] of Object.entries(STRIP_COUNTS)) for (let i = 0; i < n; i++) pool.push(sym);
    const strip = [];
    const order = Object.keys(STRIP_COUNTS).sort((a, b) => STRIP_COUNTS[b] - STRIP_COUNTS[a]);
    const left = { ...STRIP_COUNTS };
    while (strip.length < pool.length) {
      for (const sym of order) {
        if (left[sym] > 0) {
          strip.push(sym);
          left[sym]--;
        }
      }
    }
    return strip;
  }
  const STRIP = buildStrip();

  // Returns { multiplier, kind, symbol } for a line of three symbols.
  function evaluate(line) {
    const [a, b, c] = line;
    if (a === 'pig' && b === 'pig' && c === 'pig') return { multiplier: PAYTABLE.pig, kind: 'three', symbol: 'pig' };
    const target = line.find((s) => s !== 'pig');
    if (target !== 'straw' && line.every((s) => s === target || s === 'pig')) {
      return { multiplier: PAYTABLE[target], kind: 'three', symbol: target };
    }
    const carrots = line.filter((s) => s === 'carrot').length;
    if (carrots === 2) return { multiplier: PAYTABLE.twoCarrots, kind: 'two', symbol: 'carrot' };
    return { multiplier: 0, kind: 'none', symbol: null };
  }

  // Each reel stops at a random strip position; the payline shows that symbol.
  function spin(rng) {
    return [0, 1, 2].map(() => Math.floor(rng() * STRIP.length));
  }

  function lineAt(stops) {
    return stops.map((i) => STRIP[i]);
  }

  // Exact return-to-player over every possible stop combination.
  function rtp() {
    const n = STRIP.length;
    let total = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      total += evaluate([STRIP[i], STRIP[j], STRIP[k]]).multiplier;
    }
    return total / (n * n * n);
  }

  function hitRate() {
    const n = STRIP.length;
    let hits = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      if (evaluate([STRIP[i], STRIP[j], STRIP[k]]).multiplier > 0) hits++;
    }
    return hits / (n * n * n);
  }

  const api = { SYMBOLS, STRIP, PAYTABLE, evaluate, spin, lineAt, rtp, hitRate };
  root.PiggySlots = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
