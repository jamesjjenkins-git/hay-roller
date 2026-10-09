// Tractor Rally — track definitions and geometry.
// A track is a closed centre line (smoothed with Catmull-Rom) with a width.
// Walls sit at ±width/2. Features are placed by fraction of lap distance.
(function (root) {
  const WORLD = { width: 1200, height: 675 };
  const SAMPLE_STEP = 8; // px between centre-line samples
  // Mud/water patches span this fraction of the road width either side of
  // their centre (0.21 → 42% of the width), leaving a clear lane beside them.
  const PATCH_HALF_WIDTH = 0.21;

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
      aiSkill: 0.1,
      reward: [400, 210, 110, 40],
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
        { kind: 'silo', x: 515, y: 339 },
        { kind: 'hay', x: 730, y: 305 },
        { kind: 'tree', x: 884, y: 216 },
      ],
    },
    {
      id: 'pigpen',
      name: 'Pig Pen Pass',
      blurb: 'Big jumps and deep slop past the pig pen.',
      laps: 4,
      width: 92,
      aiSkill: 0.26,
      reward: [500, 260, 130, 50],
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
        { kind: 'pen', x: 415, y: 380 },
        { kind: 'hay', x: 720, y: 220 },
        { kind: 'silo', x: 273, y: 495 },
        { kind: 'tree', x: 1145, y: 380 },
      ],
    },
    {
      id: 'pond',
      name: 'Duck Pond Dash',
      blurb: 'Fast sweepers round the duck pond, with a splashy chicane.',
      laps: 4,
      width: 94,
      aiSkill: 0.32,
      reward: [600, 320, 160, 60],
      unlock: { track: 'pigpen', place: 3 },
      points: [
        [200, 120], [700, 110], [1040, 160], [1090, 380], [1000, 580], [780, 600],
        [680, 500], [560, 500], [460, 600], [220, 590], [110, 420], [120, 220],
      ],
      features: [
        { type: 'jump', at: 0.15 },
        { type: 'bumps', at: 0.32, len: 70 },
        { type: 'water', at: 0.55, off: 0, len: 90 },
        { type: 'water', at: 0.66, off: 10, len: 70 },
        { type: 'mud', at: 0.85, off: -10, len: 80 },
      ],
      scenery: [
        { kind: 'pond', x: 640, y: 300 },
        { kind: 'pond', x: 860, y: 380 },
        { kind: 'tree', x: 400, y: 330 },
        { kind: 'hay', x: 300, y: 450 },
      ],
    },
    {
      id: 'corn',
      name: 'Cornfield Chase',
      blurb: 'Wind through the corn. Two long straights for your nitro.',
      laps: 3,
      width: 94,
      aiSkill: 0.36,
      reward: [700, 370, 190, 70],
      unlock: { track: 'pond', place: 3 },
      points: [
        [160, 120], [560, 110], [1000, 130], [1090, 270], [950, 300], [640, 290],
        [460, 375], [640, 470], [980, 455], [1095, 525], [990, 615], [700, 605],
        [300, 600], [120, 470], [110, 270],
      ],
      features: [
        { type: 'jump', at: 0.1 },
        { type: 'mud', at: 0.27, off: 0, len: 80 },
        { type: 'bumps', at: 0.4, len: 70 },
        { type: 'jump', at: 0.56 },
        { type: 'water', at: 0.72, off: -10, len: 80 },
        { type: 'mud', at: 0.9, off: 10, len: 70 },
      ],
      scenery: [
        { kind: 'corn', x: 330, y: 280 },
        { kind: 'corn', x: 330, y: 440 },
        { kind: 'silo', x: 220, y: 360 },
      ],
    },
    {
      id: 'sheep',
      name: 'Sheep Dip Slalom',
      blurb: 'Wavy straights through the sheep field. Rhythm is everything.',
      laps: 4,
      width: 92,
      aiSkill: 0.42,
      reward: [800, 420, 210, 80],
      unlock: { track: 'corn', place: 3 },
      points: [
        [150, 150], [330, 110], [510, 190], [690, 110], [870, 190], [1060, 140],
        [1090, 380], [1050, 590], [870, 520], [690, 600], [510, 520], [330, 600],
        [140, 560], [100, 350],
      ],
      features: [
        { type: 'bumps', at: 0.08, len: 60 },
        { type: 'jump', at: 0.22 },
        { type: 'water', at: 0.4, off: 0, len: 80 },
        { type: 'bumps', at: 0.6, len: 60 },
        { type: 'mud', at: 0.75, off: 0, len: 80 },
        { type: 'water', at: 0.92, off: 0, len: 70 },
      ],
      scenery: [
        { kind: 'sheep', x: 600, y: 340 },
        { kind: 'sheep', x: 360, y: 380 },
        { kind: 'pond', x: 850, y: 360 },
        { kind: 'tree', x: 260, y: 300 },
      ],
    },
    {
      id: 'haystack',
      name: 'Haystack Hill',
      blurb: 'A diamond round the haystacks with jumps on every side.',
      laps: 4,
      width: 92,
      aiSkill: 0.44,
      reward: [900, 480, 240, 90],
      unlock: { track: 'sheep', place: 3 },
      points: [
        [600, 105], [880, 160], [1090, 350], [880, 560], [730, 600], [600, 440],
        [470, 600], [320, 560], [110, 350], [320, 160],
      ],
      features: [
        { type: 'jump', at: 0.08 },
        { type: 'mud', at: 0.2, off: 0, len: 70 },
        { type: 'jump', at: 0.32 },
        { type: 'bumps', at: 0.5, len: 60 },
        { type: 'jump', at: 0.66 },
        { type: 'water', at: 0.78, off: 0, len: 70 },
        { type: 'jump', at: 0.9 },
      ],
      scenery: [
        { kind: 'hay', x: 600, y: 270 },
        { kind: 'hay', x: 760, y: 360 },
        { kind: 'hay', x: 440, y: 360 },
        { kind: 'tree', x: 1080, y: 600 },
        { kind: 'tree', x: 110, y: 600 },
      ],
    },
    {
      id: 'windmill',
      name: 'Windmill Way',
      blurb: 'Down the big V past the windmill, then flat out home.',
      laps: 4,
      width: 92,
      aiSkill: 0.42,
      reward: [1000, 530, 270, 100],
      unlock: { track: 'haystack', place: 3 },
      points: [
        [130, 560], [120, 260], [250, 120], [420, 180], [600, 410], [780, 180],
        [950, 120], [1080, 260], [1080, 560], [860, 610], [600, 560], [340, 610],
      ],
      features: [
        { type: 'bumps', at: 0.1, len: 60 },
        { type: 'jump', at: 0.27 },
        { type: 'mud', at: 0.38, off: 0, len: 80 },
        { type: 'jump', at: 0.5 },
        { type: 'water', at: 0.65, off: 0, len: 80 },
        { type: 'jump', at: 0.82 },
        { type: 'mud', at: 0.93, off: 0, len: 70 },
      ],
      scenery: [
        { kind: 'windmill', x: 600, y: 200 },
        { kind: 'barn', x: 300, y: 400 },
        { kind: 'corn', x: 880, y: 400 },
      ],
    },
    {
      id: 'orchard',
      name: 'Orchard Run',
      blurb: 'A long serpentine through the apple trees. Handling wins here.',
      laps: 3,
      width: 92,
      aiSkill: 0.64,
      reward: [1150, 610, 300, 110],
      unlock: { track: 'windmill', place: 3 },
      points: [
        [150, 115], [1000, 115], [1095, 200], [1000, 285], [460, 290], [380, 370],
        [460, 455], [1000, 455], [1095, 535], [1000, 612], [160, 612], [110, 470],
        [110, 250],
      ],
      features: [
        { type: 'jump', at: 0.08 },
        { type: 'bumps', at: 0.2, len: 70 },
        { type: 'mud', at: 0.33, off: 0, len: 80 },
        { type: 'jump', at: 0.48 },
        { type: 'water', at: 0.62, off: 0, len: 80 },
        { type: 'jump', at: 0.78 },
        { type: 'mud', at: 0.9, off: 0, len: 70 },
      ],
      scenery: [
        { kind: 'tree', x: 250, y: 360, scale: 1.4 },
        { kind: 'tree', x: 620, y: 200, scale: 0.55 },
        { kind: 'tree', x: 760, y: 200, scale: 0.55 },
        { kind: 'tree', x: 900, y: 200, scale: 0.55 },
        { kind: 'tree', x: 620, y: 370, scale: 0.55 },
        { kind: 'tree', x: 760, y: 370, scale: 0.55 },
        { kind: 'tree', x: 950, y: 370, scale: 0.55 },
        { kind: 'tree', x: 568, y: 541, scale: 0.55 },
        { kind: 'tree', x: 705, y: 537, scale: 0.55 },
        { kind: 'tree', x: 840, y: 535, scale: 0.55 },
      ],
    },
    {
      id: 'harvest',
      name: 'Harvest Grand Prix',
      blurb: 'The championship: every hazard, the fastest rivals, the biggest prize.',
      laps: 4,
      width: 90,
      aiSkill: 0.62,
      reward: [1400, 740, 370, 140],
      unlock: { track: 'orchard', place: 3 },
      points: [
        [150, 120], [450, 110], [560, 220], [700, 120], [1050, 120], [1090, 280],
        [860, 290], [760, 380], [900, 470], [1080, 460], [1080, 600], [760, 610],
        [600, 510], [450, 610], [200, 610], [95, 520], [300, 380], [95, 240],
      ],
      features: [
        { type: 'jump', at: 0.07 },
        { type: 'mud', at: 0.18, off: 0, len: 80 },
        { type: 'bumps', at: 0.3, len: 60 },
        { type: 'jump', at: 0.42 },
        { type: 'water', at: 0.55, off: 0, len: 80 },
        { type: 'jump', at: 0.67 },
        { type: 'mud', at: 0.8, off: 0, len: 80 },
        { type: 'jump', at: 0.92 },
      ],
      scenery: [
        { kind: 'barn', x: 449, y: 305 },
        { kind: 'silo', x: 620, y: 360 },
        { kind: 'windmill', x: 726, y: 235 },
        { kind: 'corn', x: 399, y: 482 },
        { kind: 'hay', x: 538, y: 406 },
      ],
    },
    {
      id: 'figure8',
      name: 'Figure-8 Frenzy',
      blurb: 'Bonus track! A figure of eight — mind the crossroads in the middle.',
      bonus: true,
      laps: 4,
      width: 92,
      aiSkill: 0.7,
      reward: [1500, 800, 400, 150],
      unlock: { track: 'harvest', place: 3 },
      // The two halves cross here on purpose; walls belong to each stretch
      // of road, so tractors drive straight through (and into each other).
      crossing: { x: 600, y: 365, r: 120 },
      points: [
        [859, 584], [748, 511], [625, 391], [500, 264], [384, 168], [284, 135],
        [211, 175], [169, 275], [162, 404], [190, 521], [252, 587], [341, 584],
        [452, 511], [575, 391], [700, 264], [816, 168], [916, 135], [989, 175],
        [1031, 275], [1038, 404], [1010, 521], [948, 587],
      ],
      features: [
        { type: 'jump', at: 0.18 },
        { type: 'mud', at: 0.36, off: 0, len: 80 },
        { type: 'bumps', at: 0.5, len: 60 },
        { type: 'jump', at: 0.68 },
        { type: 'water', at: 0.86, off: 0, len: 80 },
      ],
      scenery: [
        { kind: 'pond', x: 300, y: 370 },
        { kind: 'barn', x: 900, y: 370 },
        { kind: 'tree', x: 600, y: 120 },
        { kind: 'tree', x: 600, y: 615 },
        { kind: 'hay', x: 100, y: 600 },
        { kind: 'hay', x: 1100, y: 130 },
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

    // Mud and water sit against one side of the road, leaving a clear lane
    // (about two tractors wide) on the other: drive accurately and you never
    // touch them. On bends they alternate between the inside (take the wide
    // line) and the outside (cut the corner tight to keep your speed); on
    // straights they alternate sides. Jumps and bump strips
    // still span the full width.
    let hazardSide = 1;
    let bendSide = -1;
    const features = def.features.map((f, i) => {
      const idx = Math.floor(f.at * count) % count;
      const s = samples[idx];
      const len = f.len || (f.type === 'jump' ? 30 : 60);
      const patch = f.type === 'mud' || f.type === 'water';
      let off = 0;
      let halfWidth = def.width / 2;
      if (patch) {
        halfWidth = def.width * PATCH_HALF_WIDTH;
        const before = samples[(idx - 10 + count) % count].angle;
        const after = samples[(idx + 10) % count].angle;
        let bend = after - before;
        while (bend > Math.PI) bend -= Math.PI * 2;
        while (bend < -Math.PI) bend += Math.PI * 2;
        let side;
        if (Math.abs(bend) > 0.15) side = Math.sign(bend) * (bendSide = -bendSide); // inside, then outside
        else if (f.off) side = Math.sign(f.off);
        else side = (hazardSide = -hazardSide);
        off = side * (def.width / 2 - halfWidth - 2);
      }
      return {
        id: i,
        type: f.type,
        idx,
        x: s.x + s.nx * off,
        y: s.y + s.ny * off,
        angle: s.angle,
        len,
        halfWidth,
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
    if (f.type === 'mud' || f.type === 'water') {
      // Oval patches: only where you can actually see mud or water.
      const a = along / (f.len / 2);
      const b = across / f.halfWidth;
      return a * a + b * b <= 1;
    }
    return Math.abs(along) <= f.len / 2 && Math.abs(across) <= f.halfWidth;
  }

  const api = { WORLD, TRACKS, SAMPLE_STEP, buildTrack, nearest, nearestGlobal, inFeature };
  root.TractorTracks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
