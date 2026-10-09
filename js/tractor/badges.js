// Tractor Rally — badges: challenges for playing again and again. Each badge
// has bronze, silver and gold tiers, reached by doing it more often (or
// better), and each new tier pays Hay. Pure logic; the garage saves it.
(function (root) {
  const TIERS = [
    { id: 'bronze', name: 'Bronze', icon: '🥉', hay: 100 },
    { id: 'silver', name: 'Silver', icon: '🥈', hay: 250 },
    { id: 'gold', name: 'Gold', icon: '🥇', hay: 600 },
  ];

  const races = (n) => (n === 1 ? 'a race' : `${n} races`);
  const times = (n) => (n === 1 ? '' : ` ${n} times`);

  // `kind`: 'count' adds one for each race that qualifies; 'best' keeps the
  // highest value reached. `tiers` are the bronze, silver and gold targets.
  const BADGES = [
    { id: 'streak', icon: '🔥', name: 'On a Roll', kind: 'best', tiers: [3, 5, 10], desc: (n) => `Win ${n} races in a row` },
    { id: 'sides', icon: '🧱', name: "Didn't Touch the Sides", kind: 'count', tiers: [1, 5, 20], desc: (n) => `Finish ${races(n)} without hitting a wall` },
    { id: 'clean', icon: '🧼', name: 'Clean Driver', kind: 'count', tiers: [1, 5, 20], desc: (n) => `Finish ${races(n)} without going through mud or water` },
    { id: 'animals', icon: '🐑', name: 'Animal Lover', kind: 'count', tiers: [1, 5, 20], desc: (n) => `Finish ${races(n)} without hitting an animal` },
    { id: 'bags', icon: '💰', name: 'Money Bags', kind: 'best', tiers: [3, 5, 7], desc: (n) => `Collect ${n} cash bags in one race` },
    { id: 'nitro', icon: '⚡', name: 'Speedy', kind: 'best', tiers: [3, 6, 9], desc: (n) => `Use ${n} nitros in one race` },
    { id: 'flag', icon: '🏁', name: 'Lights to Flag', kind: 'count', tiers: [1, 5, 15], desc: (n) => `Lead every lap and win${times(n)}` },
    { id: 'comeback', icon: '🔙', name: 'Comeback Kid', kind: 'count', tiers: [1, 3, 10], desc: (n) => `Win from last place${times(n)}` },
    { id: 'drift', icon: '🌀', name: 'Drift King', kind: 'best', tiers: [3, 6, 10], desc: (n) => `Get ${n} drift kicks in one race` },
    { id: 'flyer', icon: '🦘', name: 'Frequent Flyer', kind: 'best', tiers: [6, 10, 15], desc: (n) => `Take ${n} jumps in one race` },
    { id: 'laps', icon: '⏱️', name: 'Lap Record', kind: 'count', tiers: [1, 10, 30], desc: (n) => `Beat your best lap on a track${times(n)}` },
    { id: 'sweep', icon: '🎈', name: 'Pest Control', kind: 'count', tiers: [1, 3, 10], desc: (n) => `Pop every animal in Farmyard Frenzy${times(n)}` },
    { id: 'quickpop', icon: '💥', name: 'Quick Pop', kind: 'best', tiers: [40, 60, 80], desc: (n) => `Pop ${n} animals in the first 30 seconds of Farmyard Frenzy` },
    { id: 'farm', icon: '🌾', name: 'Farm Champion', kind: 'best', tiers: [3, 7, 11], desc: (n) => `Win on ${n} different farm tracks` },
    { id: 'iron', icon: '🏜️', name: 'Ironman', kind: 'best', tiers: [2, 5, 8], desc: (n) => `Win on ${n} different Ironman tracks` },
    { id: 'vehicles', icon: '🚜', name: 'All-Rounder', kind: 'best', tiers: [1, 2, 3], desc: (n) => (n === 1 ? 'Win a race' : `Win in ${n} different vehicles`) },
    { id: 'regular', icon: '📅', name: 'Regular', kind: 'best', tiers: [3, 7, 30], desc: (n) => `Race on ${n} different days` },
  ];

  function defaults() {
    return { progress: {}, level: {}, streak: 0, days: 0, lastDay: null, won: { farm: [], ironman: [] }, wonIn: [] };
  }

  // Fill in anything missing from an older save.
  function normalise(b) {
    const d = defaults();
    const out = { ...d, ...(b || {}) };
    out.won = { ...d.won, ...(out.won || {}) };
    for (const k of Object.keys(out.won)) out.won[k] = [...(out.won[k] || [])];
    out.progress = { ...out.progress };
    out.level = { ...out.level };
    out.wonIn = [...(out.wonIn || [])];
    return out;
  }

  function tierFor(badge, value) {
    let t = 0;
    while (t < badge.tiers.length && value >= badge.tiers[t]) t++;
    return t;
  }

  // What this race or Frenzy round counts for, per badge.
  //   race:   { place, trackId, pack, vehicle, laps, tally, lapRecord, day }
  //   frenzy: { frenzy: true, popped, total, in30, day }
  function valuesFor(b, ev) {
    const v = {};
    if (ev.day && ev.day !== b.lastDay) {
      b.days++;
      b.lastDay = ev.day;
    }
    v.regular = b.days;
    if (ev.frenzy) {
      v.sweep = ev.total && ev.popped >= ev.total ? 1 : 0;
      v.quickpop = ev.in30 || 0;
      return v;
    }
    const t = ev.tally || {};
    const won = ev.place === 1;
    b.streak = won ? b.streak + 1 : 0;
    v.streak = b.streak;
    v.sides = t.walls === 0 ? 1 : 0;
    v.clean = t.mud === 0 && t.water === 0 ? 1 : 0;
    v.animals = t.animals === 0 ? 1 : 0;
    v.bags = t.bags || 0;
    v.nitro = t.nitros || 0;
    v.drift = t.driftKicks || 0;
    v.flyer = t.jumps || 0;
    v.flag = won && t.ledLaps >= ev.laps ? 1 : 0;
    v.comeback = won && t.wasLast ? 1 : 0;
    v.laps = ev.lapRecord ? 1 : 0;
    if (won) {
      const pack = ev.pack === 'ironman' ? 'ironman' : 'farm';
      if (!b.won[pack].includes(ev.trackId)) b.won[pack].push(ev.trackId);
      if (ev.vehicle && !b.wonIn.includes(ev.vehicle)) b.wonIn.push(ev.vehicle);
    }
    v.farm = b.won.farm.length;
    v.iron = b.won.ironman.length;
    v.vehicles = b.wonIn.length;
    return v;
  }

  // Applies a finished race (or Frenzy round) to the badge state `b` and
  // returns each newly reached tier: [{ badge, tier, hay }].
  function update(b, ev) {
    const values = valuesFor(b, ev);
    const earned = [];
    for (const badge of BADGES) {
      if (!(badge.id in values)) continue;
      const before = b.progress[badge.id] || 0;
      const after = badge.kind === 'count' ? before + values[badge.id] : Math.max(before, values[badge.id]);
      b.progress[badge.id] = after;
      const was = b.level[badge.id] || 0;
      const now = tierFor(badge, after);
      for (let t = was; t < now; t++) earned.push({ badge, tier: TIERS[t], hay: TIERS[t].hay });
      b.level[badge.id] = Math.max(was, now);
    }
    return earned;
  }

  // For the cabinet: where each badge stands and what the next target is.
  function summary(b) {
    return BADGES.map((badge) => {
      const level = b.level[badge.id] || 0;
      const progress = b.progress[badge.id] || 0;
      const next = level < badge.tiers.length ? badge.tiers[level] : null;
      return { badge, level, tier: level ? TIERS[level - 1] : null, progress, next, desc: badge.desc(next == null ? badge.tiers[badge.tiers.length - 1] : next) };
    });
  }

  // Today's date on this device, for the Regular badge.
  function today(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const api = { TIERS, BADGES, defaults, normalise, update, summary, tierFor, today };
  root.TractorBadges = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
