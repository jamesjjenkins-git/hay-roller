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
      blurb: 'High straights top and bottom, joined by two S-bends down through the low ground in the middle.',
      laps: 3,
      width: 88,
      aiSkill: 0.22,
      reward: [1100, 580, 300, 110],
      unlock: { track: 'harvest', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 120, poly: [[-9, 44], [1219, 44], [1219, 153], [-9, 153]], h: 28 },
        { type: 'plateau', fall: 110, poly: [[47, 549], [1192, 549], [1192, 677], [47, 677]], h: 22 },
      ],
      points: [
        [606, 583], [654, 585], [702, 589], [749, 593], [797, 597], [845, 601],
        [893, 604], [941, 605], [988, 597], [1027, 570], [1033, 524], [1004, 487],
        [961, 465], [917, 447], [874, 425], [841, 390], [833, 344], [852, 301],
        [888, 270], [930, 245], [970, 220], [1000, 183], [995, 137], [955, 111],
        [908, 104], [860, 104], [812, 104], [764, 105], [716, 105], [668, 105],
        [620, 105], [572, 105], [524, 104], [476, 103], [428, 103], [380, 102],
        [332, 103], [284, 105], [237, 112], [195, 134], [180, 178], [209, 215],
        [253, 234], [299, 247], [345, 261], [388, 282], [421, 315], [433, 361],
        [415, 405], [378, 436], [335, 455], [289, 469], [243, 484], [203, 510],
        [189, 554], [218, 590], [264, 602], [312, 601], [360, 596], [408, 590],
        [456, 586], [504, 583], [551, 582], [599, 583],
      ],
      features: [
        { type: 'jump', at: 0.1 },
        { type: 'mud', at: 0.267, off: 0 },
        { type: 'bumps', at: 0.433 },
        { type: 'water', at: 0.6, off: 0 },
        { type: 'jump', at: 0.795 },
        { type: 'mud', at: 0.933, off: 0 },
      ],
      scenery: [
        { kind: 'barn', x: 600, y: 370 },
        { kind: 'hay', x: 600, y: 220 },
        { kind: 'tree', x: 594, y: 486 },
        { kind: 'silo', x: 1080, y: 360 },
        { kind: 'tree', x: 120, y: 360, scale: 0.6 },
      ],
    },
    {
      id: 'iron-sidewinder',
      pack: 'ironman',
      name: 'Sidewinder',
      blurb: 'A big C wrapped round a hairpin, over the ridge three times a lap.',
      laps: 3,
      width: 88,
      aiSkill: 0.36,
      reward: [1150, 610, 310, 120],
      unlock: { track: 'iron-fandango', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'ridge', fall: 60, a: [460, 792], b: [817, 58], w: 26, h: 26 },
      ],
      points: [
        [230, 586], [278, 585], [326, 585], [374, 585], [422, 585], [470, 586],
        [518, 588], [566, 591], [614, 594], [662, 597], [710, 601], [758, 605],
        [806, 608], [853, 610], [901, 610], [949, 612], [997, 615], [1045, 616],
        [1092, 605], [1125, 571], [1133, 524], [1105, 487], [1061, 469], [1014, 459],
        [967, 451], [919, 443], [872, 437], [824, 433], [776, 432], [728, 432],
        [680, 433], [632, 435], [584, 433], [537, 424], [498, 398], [489, 352],
        [510, 310], [551, 286], [598, 283], [646, 287], [694, 292], [742, 295],
        [790, 296], [838, 296], [886, 295], [933, 288], [977, 271], [1012, 237],
        [1026, 193], [998, 156], [954, 136], [908, 122], [861, 113], [813, 108],
        [765, 103], [718, 100], [670, 100], [622, 100], [574, 100], [526, 100],
        [478, 100], [430, 100], [382, 101], [334, 105], [288, 119], [249, 147],
        [216, 182], [188, 221], [162, 261], [138, 302], [115, 344], [96, 389],
        [83, 435], [72, 481], [66, 529], [86, 570], [132, 582], [180, 585],
        [228, 586],
      ],
      features: [
        { type: 'bumps', at: 0.1 },
        { type: 'jump', at: 0.291 },
        { type: 'mud', at: 0.433, off: 0 },
        { type: 'water', at: 0.6, off: 0 },
        { type: 'jump', at: 0.767 },
        { type: 'bumps', at: 0.933 },
      ],
      scenery: [
        { kind: 'windmill', x: 232, y: 360 },
        { kind: 'tree', x: 695, y: 210, scale: 0.6 },
        { kind: 'hay', x: 750, y: 517, scale: 0.5 },
        { kind: 'pond', x: 1109, y: 330 },
      ],
    },
    {
      id: 'iron-wipeout',
      pack: 'ironman',
      name: 'Wipeout',
      blurb: 'A figure of eight: high ground across the top and a crossroads in the middle.',
      laps: 3,
      width: 88,
      aiSkill: 0.32,
      reward: [1200, 640, 320, 120],
      unlock: { track: 'iron-sidewinder', place: 3 },
      crossings: [{ x: 713, y: 323, r: 300 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 120, poly: [[41, 77], [1377, 77], [1377, 173], [41, 173]], h: 28 },
        { type: 'mound', fall: 50, x: 882, y: 604, r: 22, h: 14 },
        { type: 'mound', fall: 40, x: 155, y: 252, r: 18, h: -10 },
      ],
      points: [
        [696, 612], [744, 608], [791, 600], [837, 586], [876, 560], [902, 519],
        [905, 472], [888, 427], [858, 390], [820, 361], [776, 341], [730, 327],
        [683, 318], [636, 311], [588, 305], [540, 299], [493, 294], [445, 288],
        [397, 282], [350, 277], [302, 271], [255, 263], [208, 252], [167, 228],
        [148, 185], [169, 143], [210, 120], [257, 109], [305, 104], [353, 102],
        [401, 102], [449, 103], [497, 105], [544, 106], [592, 108], [640, 108],
        [688, 109], [736, 109], [784, 110], [832, 110], [880, 109], [928, 108],
        [976, 107], [1023, 118], [1051, 154], [1036, 198], [997, 226], [953, 245],
        [908, 262], [863, 278], [817, 294], [772, 308], [725, 320], [679, 332],
        [632, 344], [586, 355], [539, 367], [493, 379], [446, 391], [400, 403],
        [353, 413], [306, 423], [259, 434], [213, 448], [170, 468], [137, 502],
        [134, 549], [166, 583], [211, 600], [258, 606], [306, 609], [354, 611],
        [402, 612], [450, 614], [498, 614], [546, 615], [594, 615], [642, 614],
        [690, 612],
      ],
      features: [
        { type: 'jump', at: 0.228 },
        { type: 'bumps', at: 0.32 },
        { type: 'mud', at: 0.528, off: 0 },
        { type: 'water', at: 0.752, off: 0 },
        { type: 'jump', at: 0.92 },
      ],
      scenery: [
        { kind: 'barn', x: 629, y: 480 },
        { kind: 'tree', x: 320, y: 520, scale: 0.6 },
        { kind: 'pond', x: 1050, y: 430 },
        { kind: 'hay', x: 397, y: 187, scale: 0.5 },
      ],
    },
    {
      id: 'iron-bigdukes',
      pack: 'ironman',
      name: 'Big Dukes',
      blurb: 'Round the humps on the top, then down into the big pit — the two lines cross at the bottom of it.',
      laps: 3,
      width: 88,
      aiSkill: 0.38,
      reward: [1250, 660, 340, 130],
      unlock: { track: 'iron-wipeout', place: 3 },
      crossings: [{ x: 397, y: 428, r: 182 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 90, poly: [[340, 357], [678, 357], [661, 487], [356, 487]], h: -26 },
        { type: 'mound', fall: 46, x: 404, y: 91, r: 14, h: 14 },
        { type: 'mound', fall: 46, x: 726, y: 91, r: 14, h: 14 },
        { type: 'mound', fall: 46, x: 1032, y: 91, r: 14, h: 14 },
      ],
      points: [
        [775, 614], [823, 613], [871, 612], [919, 611], [967, 610], [1015, 607],
        [1062, 599], [1106, 580], [1132, 541], [1125, 495], [1089, 464], [1045, 444],
        [998, 434], [951, 431], [903, 431], [855, 431], [807, 432], [759, 432],
        [711, 431], [663, 431], [615, 430], [567, 430], [519, 430], [471, 430],
        [423, 429], [375, 428], [327, 427], [279, 427], [231, 427], [183, 427],
        [135, 423], [91, 405], [71, 362], [66, 314], [67, 266], [77, 220],
        [110, 185], [154, 167], [201, 156], [248, 149], [296, 142], [343, 136],
        [391, 131], [439, 125], [486, 118], [533, 111], [581, 105], [629, 103],
        [677, 102], [725, 102], [773, 102], [821, 101], [869, 101], [917, 100],
        [965, 100], [1013, 101], [1061, 106], [1102, 129], [1102, 175], [1076, 216],
        [1035, 238], [987, 244], [939, 243], [891, 240], [843, 238], [796, 236],
        [748, 234], [700, 232], [652, 232], [604, 236], [559, 252], [520, 280],
        [488, 316], [458, 353], [428, 390], [397, 428], [370, 467], [353, 512],
        [354, 559], [385, 595], [431, 607], [478, 613], [526, 615], [574, 616],
        [622, 616], [670, 616], [718, 615], [766, 615],
      ],
      features: [
        { type: 'bumps', at: 0.12 },
        { type: 'water', at: 0.336, off: 0 },
        { type: 'jump', at: 0.52 },
        { type: 'mud', at: 0.72, off: 0 },
        { type: 'jump', at: 0.94 },
      ],
      scenery: [
        { kind: 'silo', x: 872, y: 521 },
        { kind: 'tree', x: 713, y: 314, scale: 0.6 },
        { kind: 'hay', x: 800, y: 520, scale: 0.5 },
        { kind: 'tree', x: 120, y: 600, scale: 0.6 },
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
      crossings: [{ x: 542, y: 398, r: 186 }, { x: 662, y: 246, r: 204 }],
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'ridge', fall: 60, a: [401, 602], b: [726, 78], w: 34, h: 30 },
        { type: 'mound', fall: 34, x: 254, y: 226, r: 10, h: 10 },
        { type: 'mound', fall: 34, x: 310, y: 278, r: 10, h: 10 },
        { type: 'mound', fall: 34, x: 221, y: 310, r: 10, h: 10 },
      ],
      points: [
        [179, 391], [227, 393], [275, 394], [323, 395], [371, 395], [419, 395],
        [467, 395], [515, 397], [563, 400], [610, 405], [658, 409], [706, 413],
        [754, 418], [802, 421], [850, 423], [898, 424], [946, 424], [994, 426],
        [1041, 433], [1085, 451], [1121, 482], [1132, 528], [1114, 572], [1078, 602],
        [1031, 613], [983, 616], [935, 615], [887, 613], [840, 608], [792, 601],
        [745, 593], [697, 586], [650, 576], [605, 562], [561, 542], [523, 513],
        [504, 470], [520, 426], [550, 389], [579, 351], [606, 311], [636, 273],
        [669, 239], [703, 205], [737, 171], [774, 141], [815, 116], [861, 102],
        [909, 102], [956, 112], [1002, 127], [1045, 147], [1078, 181], [1069, 226],
        [1031, 254], [984, 266], [936, 265], [889, 259], [841, 253], [793, 250],
        [745, 249], [697, 247], [649, 246], [601, 244], [553, 244], [505, 243],
        [457, 243], [410, 238], [367, 217], [340, 178], [295, 171], [250, 188],
        [206, 206], [164, 230], [129, 263], [98, 299], [71, 338], [90, 376],
        [137, 387],
      ],
      features: [
        { type: 'bumps', at: 0.176 },
        { type: 'mud', at: 0.32, off: 0 },
        { type: 'jump', at: 0.624 },
        { type: 'water', at: 0.716, off: 0 },
        { type: 'bumps', at: 0.92 },
      ],
      scenery: [
        { kind: 'tree', x: 700, y: 96, scale: 0.6 },
        { kind: 'hay', x: 300, y: 560, scale: 0.5 },
        { kind: 'tree', x: 101, y: 177, scale: 0.6 },
      ],
    },
    {
      id: 'iron-cliffhanger',
      pack: 'ironman',
      name: 'Cliffhanger',
      blurb: 'Up the long ramp onto the high rim, then over the cliff into the infield.',
      laps: 3,
      width: 88,
      aiSkill: 0.4,
      reward: [1250, 660, 340, 130],
      unlock: { track: 'iron-blaster', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 130, poly: [[0, 69], [1296, 69], [1296, 221], [0, 221]], h: 30 },
        { type: 'ramp', fall: 60, a: [854, 616], b: [1119, 239], w: 36, h0: 0, h1: 30 },
      ],
      points: [
        [648, 596], [696, 599], [744, 597], [791, 588], [836, 570], [876, 544],
        [913, 513], [946, 479], [977, 442], [1007, 405], [1035, 365], [1059, 324],
        [1075, 279], [1076, 231], [1054, 189], [1015, 162], [969, 149], [921, 144],
        [873, 142], [825, 141], [777, 140], [729, 138], [681, 135], [633, 131],
        [585, 126], [538, 122], [490, 117], [442, 114], [394, 110], [346, 107],
        [298, 106], [250, 106], [205, 121], [176, 158], [191, 201], [232, 224],
        [280, 230], [328, 232], [376, 235], [424, 238], [471, 242], [519, 247],
        [567, 254], [613, 265], [656, 286], [689, 320], [697, 367], [674, 408],
        [634, 434], [587, 445], [540, 449], [492, 449], [444, 447], [396, 444],
        [348, 442], [300, 441], [252, 444], [206, 457], [176, 493], [189, 537],
        [230, 562], [276, 573], [324, 577], [372, 579], [420, 579], [468, 580],
        [516, 582], [564, 586], [612, 591],
      ],
      features: [
        { type: 'bumps', at: 0.12 },
        { type: 'mud', at: 0.32, off: 0 },
        { type: 'water', at: 0.52, off: 0 },
        { type: 'jump', at: 0.72 },
        { type: 'bumps', at: 0.92 },
      ],
      scenery: [
        { kind: 'barn', x: 145, y: 330 },
        { kind: 'silo', x: 880, y: 300 },
        { kind: 'tree', x: 691, y: 496, scale: 0.6 },
        { kind: 'windmill', x: 1020, y: 563 },
      ],
    },
    {
      id: 'iron-huevos',
      pack: 'ironman',
      name: 'Huevos Grande',
      blurb: 'Climb onto the egg plateau, splash past the ponds, then drop back down.',
      laps: 3,
      width: 88,
      aiSkill: 0.46,
      reward: [1350, 720, 360, 140],
      unlock: { track: 'iron-cliffhanger', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 80, poly: [[236, 208], [996, 208], [996, 403], [236, 403]], h: 28 },
      ],
      points: [
        [707, 607], [755, 610], [803, 611], [851, 611], [898, 608], [945, 597],
        [988, 577], [1022, 543], [1039, 499], [1033, 452], [1007, 412], [968, 384],
        [923, 368], [875, 361], [828, 359], [780, 359], [732, 361], [684, 362],
        [636, 362], [588, 358], [544, 338], [523, 297], [546, 257], [590, 239],
        [638, 236], [686, 235], [733, 234], [781, 233], [829, 231], [877, 230],
        [925, 228], [973, 220], [1012, 194], [1019, 149], [986, 116], [940, 104],
        [892, 103], [844, 102], [796, 102], [748, 101], [700, 101], [652, 101],
        [604, 101], [556, 102], [508, 104], [460, 106], [412, 109], [364, 113],
        [317, 121], [271, 134], [227, 154], [189, 182], [156, 217], [130, 257],
        [109, 301], [96, 347], [92, 395], [100, 442], [123, 484], [158, 516],
        [201, 537], [247, 551], [294, 560], [341, 568], [389, 574], [436, 580],
        [484, 586], [532, 591], [579, 596], [627, 601], [675, 605],
      ],
      features: [
        { type: 'jump', at: 0.052 },
        { type: 'water', at: 0.267, off: 0 },
        { type: 'water', at: 0.433, off: 0 },
        { type: 'bumps', at: 0.6 },
        { type: 'mud', at: 0.767, off: 0 },
        { type: 'jump', at: 0.933 },
      ],
      scenery: [
        { kind: 'pen', x: 431, y: 432 },
        { kind: 'tree', x: 939, y: 509, scale: 0.6 },
        { kind: 'hay', x: 315, y: 476, scale: 0.5 },
        { kind: 'pond', x: 1087, y: 308 },
      ],
    },
    {
      id: 'iron-hurricane',
      pack: 'ironman',
      name: 'Hurricane Gulch',
      blurb: 'Off the high ground on the right, across the gulch and through the creek.',
      laps: 3,
      width: 88,
      aiSkill: 0.5,
      reward: [1500, 800, 410, 150],
      unlock: { track: 'iron-huevos', place: 3 },
      // Ground shapes read off the NES map's shading (see terrainHeight).
      terrain: [
        { type: 'plateau', fall: 130, poly: [[791, 65], [1194, 65], [1194, 410], [1046, 410]], h: 30 },
        { type: 'ridge', fall: 60, a: [107, 158], b: [72, 531], w: 26, h: 18 },
        { type: 'mound', fall: 40, x: 563, y: 214, r: 18, h: -8 },
      ],
      points: [
        [589, 606], [637, 606], [685, 601], [732, 593], [779, 583], [826, 571],
        [872, 559], [918, 546], [963, 529], [1006, 507], [1043, 477], [1073, 439],
        [1094, 396], [1108, 351], [1115, 303], [1115, 255], [1103, 209], [1078, 168],
        [1041, 138], [996, 119], [949, 110], [902, 106], [854, 106], [806, 109],
        [758, 114], [710, 120], [663, 128], [616, 136], [569, 145], [521, 152],
        [473, 158], [426, 162], [378, 163], [330, 162], [282, 161], [234, 164],
        [187, 176], [147, 202], [118, 240], [99, 284], [89, 331], [86, 378],
        [96, 425], [128, 460], [174, 467], [218, 448], [257, 421], [297, 393],
        [339, 370], [384, 354], [431, 345], [479, 340], [527, 338], [575, 339],
        [622, 345], [667, 361], [697, 397], [684, 442], [643, 466], [597, 476],
        [550, 487], [510, 513], [503, 559], [536, 592], [582, 605],
      ],
      features: [
        { type: 'bumps', at: 0.1 },
        { type: 'jump', at: 0.315 },
        { type: 'mud', at: 0.433, off: 0 },
        { type: 'water', at: 0.6, off: 0 },
        { type: 'jump', at: 0.771 },
        { type: 'water', at: 0.933, off: 0 },
      ],
      scenery: [
        { kind: 'barn', x: 736, y: 250 },
        { kind: 'silo', x: 1060, y: 620 },
        { kind: 'tree', x: 479, y: 423, scale: 0.6 },
        { kind: 'windmill', x: 233, y: 564 },
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
      let len = (f.len || (f.type === 'jump' ? 30 : f.type === 'hill' ? HILL.len : 60)) * (patch ? PATCH_SCALE : 1);
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

    const track = {
      ...def,
      samples,
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
