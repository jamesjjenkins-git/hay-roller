// Tractor Rally — track definitions and geometry.
// A track is a closed centre line (smoothed with Catmull-Rom) with a width.
// Walls sit at ±width/2. Features are placed by fraction of lap distance.
(function (root) {
  const WORLD = { width: 1200, height: 675 };
  const SAMPLE_STEP = 8; // px between centre-line samples
  // Mud/water patches span this fraction of the road width either side of
  // their centre (0.31 → 62% of the width), leaving a clear lane beside them.
  const PATCH_HALF_WIDTH = 0.31;
  const PATCH_SCALE = 1.25; // mud/water patches are this much longer than listed

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
      start: 0.182,
      points: [
        [230, 150], [600, 120], [960, 150], [1080, 300], [1010, 500], [760, 560],
        [600, 450], [440, 430], [300, 560], [140, 480], [130, 280],
      ],
      features: [
        { type: 'jump', at: 0.12 },
        { type: 'mud', at: 0.33, off: 0, len: 90 },
        { type: 'bumps', at: 0.52, len: 70 },
        { type: 'water', at: 0.72, off: -20, len: 70 },
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
      start: 0.952,
      points: [
        [170, 130], [450, 120], [590, 270], [740, 130], [1060, 140], [1100, 320],
        [890, 320], [860, 460], [1050, 465], [1095, 545], [1000, 610], [700, 595], [600, 450],
        [470, 450], [330, 585], [130, 510], [110, 280],
      ],
      features: [
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
      start: 0.252,
      points: [
        [150, 120], [390, 110], [520, 240], [670, 110], [900, 110], [1080, 180],
        [1060, 320], [870, 280], [740, 370], [880, 470], [1080, 480], [1050, 595],
        [720, 580], [600, 470], [470, 580], [250, 590], [100, 490], [270, 370],
        [110, 230],
      ],
      features: [
        { type: 'mud', at: 0.2, off: 0, len: 90 },
        { type: 'bumps', at: 0.33, len: 70 },
        { type: 'jump', at: 0.618 },
        { type: 'water', at: 0.58, off: 15, len: 80 },
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
      start: 0.096,
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
      start: 0.073,
      points: [
        [160, 120], [560, 110], [1000, 130], [1090, 270], [950, 300], [640, 290],
        [460, 375], [640, 470], [980, 455], [1095, 525], [990, 615], [700, 605],
        [300, 600], [120, 470], [110, 270],
      ],
      features: [
        { type: 'hill', at: 0.150 },
        { type: 'hill', at: 0.777 },
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
      start: 0.465,
      points: [
        [150, 150], [330, 110], [510, 190], [690, 110], [870, 190], [1060, 140],
        [1090, 380], [1050, 590], [870, 520], [690, 600], [510, 520], [330, 600],
        [140, 560], [100, 350],
      ],
      features: [
        { type: 'bumps', at: 0.08, len: 60 },
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
      start: 0.777,
      points: [
        [130, 560], [120, 260], [250, 120], [420, 180], [600, 410], [780, 180],
        [950, 120], [1080, 260], [1080, 560], [860, 610], [600, 560], [340, 610],
      ],
      features: [
        { type: 'bumps', at: 0.1, len: 60 },
        { type: 'jump', at: 0.27 },
        { type: 'mud', at: 0.38, off: 0, len: 80 },
        { type: 'water', at: 0.65, off: 0, len: 80 },
        { type: 'jump', at: 0.876 },
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
      start: 0.054,
      points: [
        [150, 115], [1000, 115], [1095, 200], [1000, 285], [460, 290], [380, 370],
        [460, 455], [1000, 455], [1095, 535], [1000, 612], [160, 612], [110, 470],
        [110, 250],
      ],
      features: [
        { type: 'hill', at: 0.731 },
        { type: 'hill', at: 0.127 },
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
        { kind: 'tree', x: 635, y: 203, scale: 0.55 },
        { kind: 'tree', x: 762, y: 205, scale: 0.55 },
        { kind: 'tree', x: 1095, y: 364, scale: 0.55 },
        { kind: 'tree', x: 428, y: 209, scale: 0.55 },
        { kind: 'tree', x: 1145, y: 370, scale: 0.55 },
        { kind: 'tree', x: 1157, y: 445, scale: 0.55 },
        { kind: 'tree', x: 388, y: 541, scale: 0.55 },
        { kind: 'tree', x: 340, y: 537, scale: 0.55 },
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
      start: 0.044,
      points: [
        [150, 120], [450, 110], [560, 220], [700, 120], [1050, 120], [1090, 280],
        [860, 290], [760, 380], [900, 470], [1080, 460], [1080, 600], [760, 610],
        [600, 510], [450, 610], [200, 610], [95, 520], [300, 380], [95, 240],
      ],
      features: [
        { type: 'jump', at: 0.217 },
        { type: 'mud', at: 0.18, off: 0, len: 80 },
        { type: 'bumps', at: 0.3, len: 60 },
        { type: 'jump', at: 0.346 },
        { type: 'water', at: 0.55, off: 0, len: 80 },
        { type: 'jump', at: 0.604 },
        { type: 'mud', at: 0.8, off: 0, len: 80 },
        { type: 'jump', at: 0.931 },
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
      start: 0.05,
      points: [
        [859, 584], [748, 511], [625, 391], [500, 264], [384, 168], [284, 135],
        [211, 175], [169, 275], [162, 404], [190, 521], [252, 587], [341, 584],
        [452, 511], [575, 391], [700, 264], [816, 168], [916, 135], [989, 175],
        [1031, 275], [1038, 404], [1010, 521], [948, 587],
      ],
      features: [
        // Ramps just before each pass through the crossroads: at racing
        // speed you land right in the middle of it.
        { type: 'jump', at: 0.085 },
        { type: 'mud', at: 0.36, off: 0, len: 80 },
        { type: 'bumps', at: 0.47, len: 60 },
        { type: 'jump', at: 0.583 },
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
    // ---------- Ironman pack ----------
    // Eight tracks traced from the classic NES Super Off Road layouts (as a
    // top-down plan). Finish top 3 at the Harvest Grand Prix to open the pack.
    {
      id: 'iron-fandango',
      pack: 'ironman',
      name: 'Fandango',
      blurb: 'High straights top and bottom, joined by kinks down through the low ground either side.',
      laps: 3,
      width: 88,
      aiSkill: 0.27,
      reward: [1100, 580, 300, 110],
      unlock: { track: 'harvest', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[40, 60], [1160, 60], [1160, 150], [40, 150]], h: 28, fall: 120 },
        { type: 'plateau', poly: [[40, 550], [1160, 550], [1160, 650], [40, 650]], h: 22, fall: 110 },
      ],
      points: [
        [600, 595], [690, 595], [779, 595], [869, 595], [959, 595], [1048, 595],
        [1085, 580], [1100, 543], [1100, 532], [1088, 485], [1060, 447], [999, 396],
        [979, 355], [999, 314], [1057, 266], [1087, 224], [1100, 174], [1100, 161],
        [1084, 121], [1044, 105], [945, 105], [847, 105], [748, 105], [649, 105],
        [551, 105], [452, 105], [353, 105], [255, 105], [156, 105], [116, 121],
        [100, 161], [100, 174], [113, 224], [143, 266], [201, 314], [221, 355],
        [201, 396], [140, 447], [112, 485], [100, 532], [100, 543], [115, 580],
        [152, 595], [241, 595], [331, 595], [421, 595], [510, 595],
      ],
      features: [
        { type: 'jump', at: 0.1 },
        { type: 'mud', at: 0.258, off: 0 },
        { type: 'bumps', at: 0.433 },
        { type: 'water', at: 0.6, off: 0 },
        { type: 'jump', at: 0.883 },
        { type: 'mud', at: 0.933, off: 0 },
      ],
      scenery: [
        { kind: 'barn', x: 600, y: 355 },
        { kind: 'hay', x: 380, y: 280, scale: 0.6 },
        { kind: 'tree', x: 820, y: 430, scale: 0.6 },
        { kind: 'silo', x: 820, y: 260 },
        { kind: 'tree', x: 380, y: 440, scale: 0.6 },
      ],
    },
    {
      id: 'iron-sidewinder',
      pack: 'ironman',
      name: 'Sidewinder',
      blurb: 'A big sweep round a tight hairpin, over the ridge three times a lap.',
      laps: 3,
      width: 88,
      aiSkill: 0.36,
      reward: [1150, 610, 310, 120],
      unlock: { track: 'iron-fandango', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'ridge', a: [700, 470], b: [860, 60], w: 26, h: 26, fall: 60 },
      ],
      start: 0.029,
      points: [
        [300, 595], [392, 595], [484, 595], [576, 595], [668, 595], [760, 595],
        [852, 595], [944, 595], [1036, 595], [1081, 576], [1100, 531], [1100, 494],
        [1081, 449], [1036, 430], [938, 430], [840, 430], [741, 430], [643, 430],
        [598, 412], [580, 367], [580, 353], [598, 308], [643, 290], [741, 290],
        [840, 290], [938, 290], [1036, 290], [1081, 271], [1100, 226], [1100, 169],
        [1081, 124], [1036, 105], [949, 105], [861, 105], [774, 105], [686, 105],
        [599, 105], [511, 105], [424, 105], [367, 119], [319, 154], [260, 226],
        [200, 299], [141, 371], [112, 424], [100, 484], [100, 531], [119, 576],
        [164, 595], [232, 595],
      ],
      features: [
        { type: 'bumps', at: 0.1 },
        { type: 'jump', at: 0.292 },
        { type: 'mud', at: 0.414, off: 0 },
        { type: 'water', at: 0.6, off: 0 },
        { type: 'jump', at: 0.712 },
        { type: 'bumps', at: 0.933 },
      ],
      scenery: [
        { kind: 'windmill', x: 332, y: 353 },
        { kind: 'tree', x: 1118, y: 368, scale: 0.6 },
        { kind: 'hay', x: 285, y: 502, scale: 0.6 },
      ],
    },
    {
      id: 'iron-wipeout',
      pack: 'ironman',
      name: 'Wipeout',
      blurb: 'A figure of eight: high ground across the top and a crossroads in the middle.',
      laps: 3,
      width: 88,
      aiSkill: 0.3,
      reward: [1200, 640, 320, 120],
      unlock: { track: 'iron-sidewinder', place: 3 },
      crossings: [{ x: 623, y: 308, r: 200 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[40, 50], [1160, 50], [1160, 130], [40, 130]], h: 28, fall: 100 },
        { type: 'mound', x: 800, y: 600, r: 22, h: 14, fall: 50 },
        { type: 'mound', x: 230, y: 470, r: 18, h: -10, fall: 40 },
      ],
      points: [
        [600, 595], [687, 595], [774, 595], [860, 595], [947, 595], [996, 585],
        [1040, 561], [1051, 553], [1067, 520], [1050, 488], [1040, 482], [998, 454],
        [952, 432], [862, 398], [771, 364], [681, 330], [590, 296], [500, 262],
        [439, 247], [376, 240], [308, 240], [239, 240], [171, 240], [128, 222],
        [110, 179], [110, 166], [128, 123], [171, 105], [266, 105], [362, 105],
        [457, 105], [552, 105], [648, 105], [743, 105], [838, 105], [934, 105],
        [1029, 105], [1072, 123], [1090, 166], [1090, 179], [1072, 222], [1029, 240],
        [961, 240], [892, 240], [824, 240], [762, 248], [703, 269], [616, 312],
        [530, 355], [444, 398], [357, 441], [298, 462], [236, 470], [166, 470],
        [126, 486], [110, 526], [110, 539], [126, 579], [166, 595], [253, 595],
        [340, 595], [426, 595], [513, 595],
      ],
      features: [
        { type: 'jump', at: 0.163 },
        { type: 'bumps', at: 0.32 },
        { type: 'mud', at: 0.528, off: 0 },
        { type: 'water', at: 0.68, off: 0 },
        { type: 'jump', at: 0.92 },
      ],
      scenery: [
        { kind: 'tree', x: 610, y: 461, scale: 0.6 },
        { kind: 'tree', x: 334, y: 342, scale: 0.6 },
        { kind: 'hay', x: 218, y: 378, scale: 0.6 },
      ],
    },
    {
      id: 'iron-bigdukes',
      pack: 'ironman',
      name: 'Big Dukes',
      blurb: 'Round the humps on the top, then down into the big pit — the two lines cross at the bottom of it.',
      laps: 3,
      width: 88,
      aiSkill: 0.43,
      reward: [1250, 660, 340, 130],
      unlock: { track: 'iron-wipeout', place: 3 },
      crossings: [{ x: 516, y: 440, r: 183 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[430, 380], [600, 380], [600, 500], [430, 500]], h: -26, fall: 90 },
        { type: 'mound', x: 400, y: 105, r: 14, h: 14, fall: 46 },
        { type: 'mound', x: 600, y: 105, r: 14, h: 14, fall: 46 },
        { type: 'mound', x: 800, y: 105, r: 14, h: 14, fall: 46 },
      ],
      start: 0.777,
      points: [
        [700, 595], [782, 595], [864, 595], [946, 595], [991, 576], [1010, 531],
        [1010, 504], [991, 459], [946, 440], [850, 440], [753, 440], [656, 440],
        [560, 440], [464, 440], [367, 440], [270, 440], [174, 440], [129, 421],
        [110, 376], [110, 307], [110, 238], [110, 169], [129, 124], [174, 105],
        [269, 105], [363, 105], [458, 105], [553, 105], [647, 105], [742, 105],
        [837, 105], [931, 105], [1026, 105], [1071, 124], [1090, 169], [1090, 186],
        [1071, 231], [1026, 250], [950, 250], [875, 250], [800, 250], [724, 250],
        [667, 265], [621, 301], [576, 362], [530, 422], [484, 483], [439, 544],
        [430, 580], [464, 595], [543, 595], [621, 595],
      ],
      features: [
        { type: 'jump', at: 0.044 },
        { type: 'bumps', at: 0.12 },
        { type: 'water', at: 0.32, off: 0 },
        { type: 'jump', at: 0.464 },
        { type: 'mud', at: 0.72, off: 0 },
      ],
      scenery: [
        { kind: 'silo', x: 300, y: 280 },
        { kind: 'tree', x: 894, y: 352, scale: 0.6 },
        { kind: 'hay', x: 562, y: 228, scale: 0.6 },
        { kind: 'tree', x: 533, y: 287, scale: 0.6 },
      ],
    },
    {
      id: 'iron-blaster',
      pack: 'ironman',
      name: 'Blaster',
      blurb: 'Over the long ridge again and again, crossing itself twice on the way.',
      laps: 3,
      width: 88,
      aiSkill: 0.42,
      reward: [1300, 690, 350, 130],
      unlock: { track: 'iron-bigdukes', place: 3 },
      crossings: [{ x: 643, y: 420, r: 177 }, { x: 741, y: 280, r: 177 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'ridge', a: [560, 540], b: [830, 150], w: 34, h: 30, fall: 60 },
        { type: 'mound', x: 160, y: 205, r: 10, h: 10, fall: 34 },
        { type: 'mound', x: 250, y: 228, r: 10, h: 10, fall: 34 },
      ],
      start: 0.041,
      points: [
        [150, 420], [247, 420], [345, 420], [442, 420], [539, 420], [637, 420],
        [734, 420], [831, 420], [929, 420], [1026, 420], [1071, 439], [1090, 484],
        [1090, 531], [1071, 576], [1026, 595], [938, 595], [849, 595], [761, 595],
        [672, 595], [584, 595], [549, 580], [557, 543], [610, 467], [663, 391],
        [717, 314], [770, 238], [823, 162], [868, 125], [924, 110], [1026, 110],
        [1071, 129], [1090, 174], [1090, 216], [1071, 261], [1026, 280], [931, 280],
        [837, 280], [742, 280], [648, 280], [553, 280], [459, 280], [364, 280],
        [306, 266], [257, 233], [243, 217], [202, 199], [164, 223], [141, 256],
        [119, 303], [110, 354], [110, 402], [115, 415], [128, 420],
      ],
      features: [
        { type: 'bumps', at: 0.072 },
        { type: 'mud', at: 0.32, off: 0 },
        { type: 'water', at: 0.708, off: 0 },
        { type: 'bumps', at: 0.869 },
      ],
      scenery: [
        { kind: 'tree', x: 462, y: 572, scale: 0.6 },
        { kind: 'hay', x: 300, y: 530, scale: 0.6 },
        { kind: 'tree', x: 718, y: 124, scale: 0.6 },
        { kind: 'pond', x: 388, y: 149 },
      ],
    },
    {
      id: 'iron-cliffhanger',
      pack: 'ironman',
      name: 'Cliffhanger',
      blurb: 'Up the long ramp onto the high rim, then over the cliff into the infield.',
      laps: 3,
      width: 88,
      aiSkill: 0.37,
      reward: [1250, 660, 340, 130],
      unlock: { track: 'iron-blaster', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[40, 50], [1160, 50], [1160, 150], [40, 150]], h: 30, fall: 130 },
        { type: 'ramp', a: [800, 560], b: [1090, 230], w: 36, h0: 0, h1: 30, fall: 60 },
      ],
      start: 0.004,
      points: [
        [400, 595], [499, 595], [597, 595], [696, 595], [754, 581], [803, 548],
        [865, 479], [928, 410], [990, 341], [1052, 272], [1079, 226], [1090, 174],
        [1090, 161], [1074, 121], [1034, 105], [938, 105], [842, 105], [746, 105],
        [650, 105], [554, 105], [458, 105], [363, 105], [267, 105], [171, 105],
        [128, 123], [110, 166], [110, 179], [128, 222], [171, 240], [254, 240],
        [337, 240], [420, 240], [503, 240], [586, 240], [631, 259], [650, 304],
        [650, 366], [631, 411], [586, 430], [504, 430], [421, 430], [339, 430],
        [256, 430], [174, 430], [129, 449], [110, 494], [110, 531], [129, 576],
        [174, 595], [249, 595], [325, 595],
      ],
      features: [
        { type: 'bumps', at: 0.088 },
        { type: 'mud', at: 0.32, off: 0 },
        { type: 'water', at: 0.511, off: 0 },
        { type: 'jump', at: 0.666 },
        { type: 'bumps', at: 0.92 },
      ],
      scenery: [
        { kind: 'silo', x: 856, y: 333 },
        { kind: 'tree', x: 362, y: 347, scale: 0.6 },
        { kind: 'windmill', x: 783, y: 258 },
      ],
    },
    {
      id: 'iron-huevos',
      pack: 'ironman',
      name: 'Huevos Grande',
      blurb: 'Climb onto the egg plateau, splash past the ponds, then drop back down.',
      laps: 3,
      width: 88,
      aiSkill: 0.42,
      reward: [1350, 720, 360, 140],
      unlock: { track: 'iron-cliffhanger', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[300, 250], [1000, 250], [1000, 450], [300, 450]], h: 28, fall: 80 },
      ],
      points: [
        [600, 595], [685, 595], [770, 595], [856, 595], [941, 595], [1026, 595],
        [1071, 576], [1090, 531], [1090, 484], [1071, 439], [1026, 420], [936, 420],
        [845, 420], [755, 420], [664, 420], [574, 420], [483, 420], [393, 420],
        [348, 402], [330, 357], [330, 343], [348, 298], [393, 280], [485, 280],
        [577, 280], [669, 280], [762, 280], [854, 280], [946, 280], [996, 270],
        [1040, 244], [1058, 228], [1081, 196], [1090, 157], [1090, 148], [1078, 117],
        [1047, 105], [950, 105], [852, 105], [754, 105], [657, 105], [559, 105],
        [462, 105], [364, 105], [306, 118], [255, 151], [205, 202], [155, 254],
        [123, 305], [110, 364], [110, 448], [110, 531], [129, 576], [174, 595],
        [259, 595], [344, 595], [430, 595], [515, 595],
      ],
      features: [
        { type: 'jump', at: 0.092 },
        { type: 'water', at: 0.267, off: 0 },
        { type: 'water', at: 0.433, off: 0 },
        { type: 'bumps', at: 0.6 },
        { type: 'mud', at: 0.767, off: 0 },
        { type: 'jump', at: 0.933 },
      ],
      scenery: [
        { kind: 'tree', x: 200, y: 450, scale: 0.6 },
        { kind: 'hay', x: 236, y: 327, scale: 0.6 },
      ],
    },
    {
      id: 'iron-hurricane',
      pack: 'ironman',
      name: 'Hurricane Gulch',
      blurb: 'Off the high ground on the right, across the gulch and through the creek.',
      laps: 3,
      width: 88,
      aiSkill: 0.45,
      reward: [1500, 800, 410, 150],
      unlock: { track: 'iron-huevos', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', poly: [[1000, 60], [1160, 60], [1160, 450], [1000, 450]], h: 30, fall: 130 },
        { type: 'ridge', a: [110, 150], b: [110, 500], w: 26, h: 18, fall: 60 },
        { type: 'mound', x: 560, y: 330, r: 18, h: -8, fall: 40 },
      ],
      start: 0.029,
      points: [
        [600, 595], [679, 595], [757, 595], [836, 595], [894, 582], [945, 549],
        [995, 498], [1045, 446], [1077, 395], [1090, 336], [1090, 252], [1090, 169],
        [1071, 124], [1026, 105], [931, 105], [837, 105], [742, 105], [647, 105],
        [553, 105], [458, 105], [363, 105], [269, 105], [174, 105], [129, 124],
        [110, 169], [110, 246], [110, 323], [110, 400], [110, 477], [128, 522],
        [173, 540], [187, 540], [238, 523], [272, 481], [307, 390], [342, 347],
        [394, 330], [470, 330], [546, 330], [621, 330], [697, 330], [742, 348],
        [760, 393], [760, 407], [742, 452], [697, 470], [623, 470], [550, 470],
        [476, 470], [436, 486], [420, 526], [420, 539], [436, 579], [476, 595],
        [538, 595],
      ],
      features: [
        { type: 'bumps', at: 0.07 },
        { type: 'jump', at: 0.314 },
        { type: 'mud', at: 0.433, off: 0 },
        { type: 'water', at: 0.577, off: 0 },
        { type: 'jump', at: 0.879 },
        { type: 'water', at: 0.933, off: 0 },
      ],
      scenery: [
        { kind: 'barn', x: 850, y: 269 },
        { kind: 'silo', x: 954, y: 309 },
        { kind: 'tree', x: 334, y: 566, scale: 0.6 },
        { kind: 'windmill', x: 231, y: 300 },
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
      const patch = f.type === 'mud' || f.type === 'water';
      let len = (f.len || (f.type === 'jump' ? 40 : f.type === 'hill' ? HILL.len : 60)) * (patch ? PATCH_SCALE : 1);
      let off = 0;
      let halfWidth = def.width / 2;
      if (patch) {
        // Keep a clear lane about 1.5 tractors wide, even on narrow tracks.
        halfWidth = Math.min(def.width * PATCH_HALF_WIDTH, def.width / 2 - 19);
        const before = samples[(idx - 10 + count) % count].angle;
        const after = samples[(idx + 10) % count].angle;
        let bend = after - before;
        while (bend > Math.PI) bend -= Math.PI * 2;
        while (bend < -Math.PI) bend += Math.PI * 2;
        // A straight oval on a tight bend bulges into the lane; shorten it
        // so it bows in by no more than a few pixels.
        const radius = (SAMPLE_STEP * 20) / Math.max(0.01, Math.abs(bend));
        len = Math.min(len, Math.sqrt(80 * radius));
        let side;
        if (Math.abs(bend) > 0.15) side = Math.sign(bend) * (bendSide = -bendSide); // inside, then outside
        else if (f.off) side = Math.sign(f.off);
        else side = (hazardSide = -hazardSide);
        off = side * (def.width / 2 - halfWidth);
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
        // Hills: how high the crest is (world px).
        ...(f.type === 'hill' ? { height: f.height || HILL.height } : {}),
      };
    });

    // A track can move its start line round the lap (`start`, as a fraction)
    // so the grid sits on a straight; features stay where they are.
    let roadSamples = samples;
    const shift = def.start ? Math.round(def.start * count) % count : 0;
    if (shift) {
      roadSamples = samples.slice(shift).concat(samples.slice(0, shift));
      roadSamples.forEach((s, i) => (s.dist = i * SAMPLE_STEP));
      for (const f of features) f.idx = (f.idx - shift + count) % count;
    }

    const track = {
      ...def,
      samples: roadSamples,
      count,
      length,
      halfWidth: def.width / 2,
      features,
      startIdx: 0,
    };
    track.elev = buildElevation(track);
    return track;
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

  // Hills along the road (the 'hill' feature): a smooth bump `height` px
  // high over `len` px of track, centred on the feature.
  const HILL = { len: 240, height: 26 };

  // ---------- Terrain ----------
  // A track can describe its ground as shapes (world px), Super Off Road
  // style: plateaus (polygons), ridges and ramps (thick lines), mounds and
  // pits (circles; negative height). Each is flat at `h` inside and slopes
  // smoothly to the ground over `fall` px. The road's height anywhere is the
  // ground beneath it — so where two stretches cross, they always meet at
  // the same height.
  function shapeDistance(p, x, y) {
    if (p.type === 'mound') return { d: Math.hypot(x - p.x, y - p.y) - p.r, h: p.h };
    if (p.type === 'ridge' || p.type === 'ramp') {
      const [ax, ay] = p.a;
      const [bx, by] = p.b;
      const vx = bx - ax;
      const vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) - p.w;
      return { d, h: p.type === 'ramp' ? p.h0 + (p.h1 - p.h0) * t : p.h };
    }
    // Plateau: 0 inside the polygon, else distance to its edge.
    const pts = p.poly;
    let inside = false;
    let best = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      const vx = xj - xi;
      const vy = yj - yi;
      const t = Math.max(0, Math.min(1, ((x - xi) * vx + (y - yi) * vy) / (vx * vx + vy * vy)));
      best = Math.min(best, Math.hypot(x - (xi + vx * t), y - (yi + vy * t)));
    }
    return { d: inside ? 0 : best, h: p.h };
  }

  function terrainHeight(terrain, x, y) {
    let up = 0;
    let down = 0;
    for (const p of terrain) {
      const { d, h } = shapeDistance(p, x, y);
      if (d >= p.fall) continue;
      const k = d <= 0 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * d) / p.fall);
      if (h >= 0) up = Math.max(up, h * k);
      else down = Math.min(down, h * k);
    }
    return up + down;
  }

  function buildElevation(track) {
    const n = track.count;
    const raw = track.samples.map((s, i) => {
      let h = track.terrain ? terrainHeight(track.terrain, s.x, s.y) : 0;
      for (const f of track.features) {
        if (f.type !== 'hill') continue;
        let d = i - f.idx;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const along = d * SAMPLE_STEP;
        if (Math.abs(along) < f.len / 2) h += f.height * Math.cos((Math.PI / f.len) * along) ** 2;
      }
      return h;
    });
    // A light smoothing along the road takes out any kinks.
    const out = raw.map((_, i) => {
      let sum = 0;
      for (let k = -3; k <= 3; k++) sum += raw[(i + k + n) % n];
      return sum / 7;
    });
    return out;
  }

  // Height of the road at sample `idx`, and its slope (rise per px) in the
  // direction of travel round the lap.
  function elevationAt(track, idx) {
    if (!track.elev) return { h: 0, slope: 0 };
    const n = track.count;
    const i = ((idx % n) + n) % n;
    const h = track.elev[i];
    const slope = (track.elev[(i + 1) % n] - track.elev[(i - 1 + n) % n]) / (2 * SAMPLE_STEP);
    return { h, slope };
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

  const api = { WORLD, TRACKS, SAMPLE_STEP, HILL, buildTrack, nearest, nearestGlobal, inFeature, elevationAt, terrainHeight };
  root.TractorTracks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
