// Tractor Rally — track definitions and geometry.
// A track is a closed centre line (smoothed with Catmull-Rom) with a width.
// Walls sit at ±width/2. Features are placed by fraction of lap distance.
(function (root) {
  const WORLD = { width: 1200, height: 675 };
  const SAMPLE_STEP = 8; // px between centre-line samples

  const TRACKS = [
    {
      id: 'meadow',
      name: 'Muddy Meadow',
      blurb: 'A gentle loop round the meadow. Mind the mud.',
      laps: 4,
      width: 100,
      aiSkill: 0.0,
      reward: [300, 160, 80, 30],
      unlock: null,
      points: [
        [230, 150], [600, 120], [960, 150], [1080, 300], [1010, 500], [760, 560],
        [600, 450], [440, 430], [300, 560], [140, 480], [130, 280],
      ],
      features: [
        { type: 'jump', at: 0.12 },
        { type: 'mud', at: 0.33, off: 0, len: 90 },
        { type: 'bumps', at: 0.52, len: 70 },
        { type: 'water', at: 0.72, off: -20, len: 70 },
        { type: 'jump', at: 0.86 },
      ],
      scenery: [
        { kind: 'barn', x: 560, y: 260 },
        { kind: 'pond', x: 820, y: 330 },
        { kind: 'hay', x: 330, y: 300 },
        { kind: 'tree', x: 960, y: 330 },
        { kind: 'tree', x: 700, y: 330 },
      ],
    },
    {
      id: 'barnyard',
      name: 'Barnyard Bend',
      blurb: 'Twisty dips and a chicane past the barn. Tyres help here.',
      laps: 4,
      width: 96,
      aiSkill: 0.35,
      reward: [450, 240, 120, 45],
      unlock: { track: 'meadow', place: 3 },
      points: [
        [170, 130], [450, 120], [590, 270], [740, 130], [1060, 140], [1100, 320],
        [890, 320], [860, 460], [1050, 465], [1095, 545], [1000, 610], [700, 595], [600, 450],
        [470, 450], [330, 585], [130, 510], [110, 280],
      ],
      features: [
        { type: 'jump', at: 0.08 },
        { type: 'bumps', at: 0.22, len: 60 },
        { type: 'mud', at: 0.42, off: 10, len: 80 },
        { type: 'jump', at: 0.6 },
        { type: 'water', at: 0.74, off: 0, len: 80 },
        { type: 'mud', at: 0.9, off: -15, len: 70 },
      ],
      scenery: [
        { kind: 'barn', x: 300, y: 300 },
        { kind: 'silo', x: 520, y: 330 },
        { kind: 'hay', x: 700, y: 300 },
        { kind: 'pond', x: 720, y: 450 },
        { kind: 'tree', x: 950, y: 240 },
      ],
    },
    {
      id: 'pigpen',
      name: 'Pig Pen Pass',
      blurb: 'The pros’ track: big jumps, deep slop, fast rivals.',
      laps: 4,
      width: 92,
      aiSkill: 0.7,
      reward: [650, 340, 170, 60],
      unlock: { track: 'barnyard', place: 3 },
      points: [
        [150, 120], [390, 110], [520, 240], [670, 110], [900, 110], [1080, 180],
        [1060, 320], [870, 280], [740, 370], [880, 470], [1080, 480], [1050, 595],
        [720, 580], [600, 470], [470, 580], [250, 590], [100, 490], [270, 370],
        [110, 230],
      ],
      features: [
        { type: 'jump', at: 0.06 },
        { type: 'mud', at: 0.2, off: 0, len: 90 },
        { type: 'bumps', at: 0.33, len: 70 },
        { type: 'jump', at: 0.47 },
        { type: 'water', at: 0.58, off: 15, len: 80 },
        { type: 'jump', at: 0.7 },
        { type: 'mud', at: 0.83, off: -10, len: 90 },
      ],
      scenery: [
        { kind: 'pen', x: 400, y: 380 },
        { kind: 'barn', x: 640, y: 280 },
        { kind: 'hay', x: 860, y: 220 },
        { kind: 'silo', x: 230, y: 470 },
        { kind: 'tree', x: 1000, y: 380 },
      ],
    },
  ];

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return [
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    ];
  }

  // Turn control points into evenly spaced samples with tangents/normals.
  function buildTrack(def) {
    const pts = def.points;
    const n = pts.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      for (let k = 0; k < 40; k++) dense.push(catmullRom(p0, p1, p2, p3, k / 40));
    }
    // Resample at a fixed spacing.
    const samples = [];
    let carry = 0;
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i];
      const b = dense[(i + 1) % dense.length];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = carry;
      while (d < segLen) {
        const t = d / segLen;
        samples.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
        d += SAMPLE_STEP;
      }
      carry = d - segLen;
    }
    const count = samples.length;
    for (let i = 0; i < count; i++) {
      const prev = samples[(i - 1 + count) % count];
      const next = samples[(i + 1) % count];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const s = samples[i];
      s.tx = tx / len;
      s.ty = ty / len;
      s.nx = -s.ty;
      s.ny = s.tx;
      s.angle = Math.atan2(s.ty, s.tx);
      s.dist = i * SAMPLE_STEP;
    }
    const length = count * SAMPLE_STEP;

    const features = def.features.map((f, i) => {
      const idx = Math.floor(f.at * count) % count;
      const s = samples[idx];
      const off = f.off || 0;
      const len = f.len || (f.type === 'jump' ? 30 : 60);
      return {
        id: i,
        type: f.type,
        idx,
        x: s.x + s.nx * off,
        y: s.y + s.ny * off,
        angle: s.angle,
        len,
        // Patches only cover part of the width so there's a line around them.
        halfWidth: f.type === 'jump' || f.type === 'bumps' ? def.width / 2 : def.width * 0.32,
      };
    });

    return {
      ...def,
      samples,
      count,
      length,
      halfWidth: def.width / 2,
      features,
      startIdx: 0,
    };
  }

  // Nearest centre-line sample to (x, y), searching around a hint index.
  function nearest(track, x, y, hint, window = 14) {
    const { samples, count } = track;
    let best = hint;
    let bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (hint + k + count) % count;
      const s = samples[i];
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function nearestGlobal(track, x, y) {
    let best = 0;
    let bestD = Infinity;
    track.samples.forEach((s, i) => {
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  // Position relative to the feature: along = distance along track direction,
  // across = sideways distance. Used for surface checks.
  function inFeature(f, x, y) {
    const dx = x - f.x;
    const dy = y - f.y;
    const along = dx * Math.cos(f.angle) + dy * Math.sin(f.angle);
    const across = -dx * Math.sin(f.angle) + dy * Math.cos(f.angle);
    return Math.abs(along) <= f.len / 2 && Math.abs(across) <= f.halfWidth;
  }

  const api = { WORLD, TRACKS, SAMPLE_STEP, buildTrack, nearest, nearestGlobal, inFeature };
  root.TractorTracks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
