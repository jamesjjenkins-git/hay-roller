// Tractor Rally — full 3D renderer (three.js). Loaded on demand when the
// player switches to the 3D view; the race simulation is the same 2D sim,
// with its jump height as the third dimension.
//
// World mapping: sim (x, y) → three (x − W/2, ·, y − H/2); sim z → three y.
import * as THREE from '../vendor/three.module.min.js';

const { drawBackground, wallItems, drawCountdown, drawBanner, FONT, OUTLINE, W, H } = globalThis.TractorRender.shared;
const Tracks = globalThis.TractorTracks;

const SKY = '#9ad7f5';
const toX = (x) => x - W / 2;
const toZ = (y) => y - H / 2;

// ---------- Materials (shared, cached) ----------

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function mesh(geo, material, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}
function cyl(rTop, rBot, h, color, seg = 14) {
  return mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
}
function ball(r, color, detail = 1) {
  return mesh(new THREE.IcosahedronGeometry(r, detail), mat(color, { flatShading: true }));
}

// ---------- Models ----------

function makeTractor(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); // tilts and bounces on the wheels
  g.add(body);
  const dark = shadeHex(color, -0.25);
  // Chassis, hood and grille.
  body.add(box(30, 5, 12, '#3a3a3a', 0, 7, 0));
  body.add(box(20, 10, 12, color, 7, 13, 0));
  body.add(box(2, 8, 10, '#dddddd', 17.5, 13, 0));
  // Cab: corner posts, roof and a seat with a driver.
  for (const [px, pz] of [[-15, -8], [-15, 8], [-3, -8], [-3, 8]]) body.add(box(1.6, 16, 1.6, dark, px, 20, pz));
  body.add(box(15, 2, 19, '#fff8e6', -9, 28.5, 0));
  body.add(box(14, 4, 17, dark, -9, 10, 0));
  const driver = ball(3.2, '#f2c9a0', 0);
  driver.position.set(-9, 19, 0);
  body.add(driver);
  body.add(box(6, 6, 7, '#2f6fd0', -9, 14.5, 0));
  // Exhaust stack.
  const pipe = cyl(1.3, 1.3, 12, '#555555', 8);
  pipe.position.set(5, 22, -4);
  body.add(pipe);

  // Wheels: big drive wheels at the back, small steerable ones at the front.
  const wheels = { rear: [], front: [] };
  const tyre = mat('#222222');
  const hub = mat('#f4c20d');
  const wheel = (r, w) => {
    const wg = new THREE.Group();
    const t = mesh(new THREE.CylinderGeometry(r, r, w, 16), tyre);
    t.rotation.x = Math.PI / 2;
    wg.add(t);
    const h = mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.6, 10), hub, { cast: false });
    h.rotation.x = Math.PI / 2;
    wg.add(h);
    // Tread bar so you can see it spin.
    const bar = mesh(new THREE.BoxGeometry(r * 2.02, r * 0.3, w + 0.2), mat('#3a3a3a'), { cast: false });
    wg.add(bar);
    return wg;
  };
  for (const side of [-1, 1]) {
    const rw = wheel(9.5, 7);
    rw.position.set(-9, 9.5, side * 11.5);
    g.add(rw);
    wheels.rear.push(rw);
    const pivot = new THREE.Group();
    pivot.position.set(11, 5, side * 8.5);
    const fw = wheel(5, 4);
    pivot.add(fw);
    g.add(pivot);
    wheels.front.push({ pivot, wheel: fw });
  }
  g.userData = { body, wheels };
  return g;
}

function makeAnimal(kind) {
  const g = new THREE.Group();
  const legs = [];
  const leg = (x, z, color, h = 6) => {
    const l = cyl(1.4, 1.4, h, color, 6);
    l.position.set(x, h / 2, z);
    g.add(l);
    legs.push(l);
  };
  if (kind === 'pig') {
    for (const [x, z] of [[-6, -4], [-6, 4], [6, -4], [6, 4]]) leg(x, z, '#e98aa1', 5);
    const b = ball(9, '#f7a8bb', 1);
    b.scale.set(1.35, 0.85, 0.9);
    b.position.y = 10;
    g.add(b);
    const snout = cyl(3, 3, 3, '#ef8aa3', 10);
    snout.rotation.z = Math.PI / 2;
    snout.position.set(13, 10, 0);
    g.add(snout);
    for (const s of [-1, 1]) {
      const ear = box(3, 4, 2, '#f28fa8', 9, 16, s * 4);
      ear.rotation.x = s * 0.4;
      g.add(ear);
    }
  } else if (kind === 'sheep') {
    for (const [x, z] of [[-5, -4], [-5, 4], [5, -4], [5, 4]]) leg(x, z, '#222222', 7);
    for (const [x, y, z] of [[0, 12, 0], [-5, 12, 0], [5, 12, 0], [0, 15, 0], [0, 12, 4], [0, 12, -4]]) {
      const puff = ball(5.5, '#f6f3ea', 0);
      puff.position.set(x, y, z);
      g.add(puff);
    }
    const head = ball(4, '#2a2a2a', 0);
    head.scale.set(1.3, 1, 1);
    head.position.set(11, 13, 0);
    g.add(head);
  } else {
    for (const [x, z] of [[-9, -5], [-9, 5], [9, -5], [9, 5]]) leg(x, z, '#3a3a3a', 9);
    g.add(box(26, 12, 13, '#ffffff', 0, 14, 0));
    g.add(box(8, 6, 13.2, '#2b2b2b', -4, 15, 0));
    g.add(box(5, 5, 6, '#2b2b2b', 6, 18, 6.6 / 2 + 0.1));
    const head = box(8, 8, 8, '#ffffff', 16, 18, 0);
    g.add(head);
    g.add(box(3, 4, 7, '#f6b6c4', 21, 16, 0));
    for (const s of [-1, 1]) g.add(box(2, 3, 2, '#f1e3c2', 14, 23, s * 3));
  }
  g.userData = { legs };
  return g;
}

function makeScenery(sc, rng) {
  const g = new THREE.Group();
  const k = sc.kind;
  if (k === 'barn') {
    g.add(box(120, 44, 80, '#c8382c', 0, 22, 0));
    // Gable roof along the length.
    const shape = new THREE.Shape();
    shape.moveTo(-44, 0);
    shape.lineTo(44, 0);
    shape.lineTo(0, 30);
    shape.lineTo(-44, 0);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 126, bevelEnabled: false });
    roofGeo.translate(0, 0, -63);
    roofGeo.rotateY(Math.PI / 2);
    const roof = mesh(roofGeo, mat('#5f646d'));
    roof.position.y = 44;
    g.add(roof);
    // White trim and big doors on the front.
    g.add(box(122, 3, 82, '#ffffff', 0, 44, 0));
    g.add(box(36, 32, 2, '#a52b22', 0, 16, 41));
    const x1 = box(46, 3, 2.2, '#ffffff', 0, 16, 41.5);
    x1.rotation.z = 0.72;
    const x2 = x1.clone();
    x2.rotation.z = -0.72;
    g.add(x1, x2);
  } else if (k === 'silo') {
    const c = cyl(30, 30, 90, '#b9c2c9', 24);
    c.position.y = 45;
    g.add(c);
    for (const y of [25, 55, 80]) {
      const ring = cyl(30.8, 30.8, 2, '#8f9aa3', 24);
      ring.position.y = y;
      g.add(ring);
    }
    const dome = mesh(new THREE.SphereGeometry(30, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d6dde2'));
    dome.position.y = 90;
    g.add(dome);
  } else if (k === 'tree') {
    const trunk = cyl(5, 7, 30, '#6b4423', 8);
    trunk.position.y = 15;
    g.add(trunk);
    const greens = ['#3f9a3a', '#4cab43', '#358a32'];
    for (let i = 0; i < 4; i++) {
      const r = 18 + rng() * 10;
      const b = ball(r, greens[i % 3], 1);
      b.position.set((rng() - 0.5) * 22, 38 + rng() * 16, (rng() - 0.5) * 22);
      g.add(b);
    }
  } else if (k === 'hay') {
    const cols = ['#e6bd55', '#d9ac45'];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) g.add(box(30, 24, 26, cols[(i + j) % 2], -32 + i * 32, 12, -14 + j * 28));
    }
    for (let i = 0; i < 2; i++) g.add(box(30, 24, 26, cols[i % 2], -16 + i * 32, 36, 0));
  } else if (k === 'windmill') {
    const tower = cyl(12, 20, 90, '#c9b48a', 8);
    tower.position.y = 45;
    g.add(tower);
    const cap = mesh(new THREE.ConeGeometry(16, 20, 8), mat('#8a5a2b'));
    cap.position.y = 100;
    g.add(cap);
    const sails = new THREE.Group();
    sails.position.set(0, 88, 18);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(box(52, 12, 1.5, '#fff8e6', 30, 0, 0));
      arm.add(box(54, 1.6, 2, '#8a5a2b', 28, 0, 0.6));
      sails.add(arm);
    }
    g.add(sails);
    g.userData.spin = sails;
  } else if (k === 'corn') {
    g.add(box(144, 2, 72, '#8a6a3d', 0, 1, 0));
    const stalks = new THREE.InstancedMesh(new THREE.ConeGeometry(4.5, 22, 5), mat('#5fae3a', { flatShading: true }), 80);
    stalks.castShadow = true;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let row = -28; row <= 28; row += 14) {
      for (let col = -64; col <= 64; col += 9) {
        if (n >= 80) break;
        m.makeTranslation(col + (rng() - 0.5) * 3, 12 + rng() * 3, row + (rng() - 0.5) * 3);
        stalks.setMatrixAt(n, m);
        stalks.setColorAt(n, new THREE.Color(rng() < 0.15 ? '#c9b02a' : rng() < 0.5 ? '#5fae3a' : '#4c9a30'));
        n++;
      }
    }
    stalks.count = n;
    g.add(stalks);
  } else if (k === 'pen') {
    g.add(box(140, 1, 90, '#8a6a3d', 0, 0.5, 0));
    for (const [w, d, x, z] of [[140, 3, 0, -45], [140, 3, 0, 45], [3, 90, -70, 0], [3, 90, 70, 0]]) {
      g.add(box(w, 3, d, '#c98f52', x, 10, z));
      g.add(box(w, 3, d, '#c98f52', x, 4, z));
    }
    for (const [px, pz, a] of [[-30, -10, 0.3], [20, 15, -2.5], [35, -20, 1.8]]) {
      const pig = makeAnimal('pig');
      pig.position.set(px, 0, pz);
      pig.rotation.y = -a;
      g.add(pig);
    }
  } else if (k === 'sheep') {
    for (const [sx, sy, a] of [[-22, -12, 0.4], [14, -18, -2.6], [-6, 14, 1.4], [24, 10, 3.0]]) {
      const sh = makeAnimal('sheep');
      sh.position.set(sx, 0, sy);
      sh.rotation.y = -a;
      g.add(sh);
    }
  }
  return g;
}

function makeGrandstand(rng) {
  const g = new THREE.Group();
  // Three tiers rising away from the track, with a roof.
  for (let tier = 0; tier < 3; tier++) {
    g.add(box(600, 10 + tier * 10, 16, '#9b6633', 600, 5 + tier * 5, 38 - tier * 16));
  }
  g.add(box(600, 3, 52, '#e2412f', 600, 56, 20));
  for (const x of [304, 896]) g.add(box(4, 56, 4, '#6e4520', x, 28, -4));
  const shirts = ['#e2412f', '#2f7de2', '#f4c20d', '#2fae4a', '#8e44c9', '#ffffff', '#f07c1b'];
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(3.2, 4, 2, 6), mat('#ffffff'), 140);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let tier = 0; tier < 3; tier++) {
    for (let x = 312; x < 890 && n < 140; x += 12.5) {
      if (rng() < 0.15) continue;
      m.makeTranslation(x + (rng() - 0.5) * 3, 10 + tier * 10 + 5, 38 - tier * 16);
      crowd.setMatrixAt(n, m);
      crowd.setColorAt(n, new THREE.Color(shirts[Math.floor(rng() * shirts.length)]));
      n++;
    }
  }
  crowd.count = n;
  g.add(crowd);
  g.userData.crowd = crowd;
  return g;
}

function shadeHex(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt * 0.5);
  return `#${c.getHexString()}`;
}

// ---------- Renderer ----------

export function createRenderer3D(canvas, overlay) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  const octx = overlay.getContext('2d');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 1400, 3200);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 4, 6000);

  scene.add(new THREE.HemisphereLight('#fffbe8', '#4f7f34', 1.5));
  const sun = new THREE.DirectionalLight('#fff3d6', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-0.45, 1, 0.35).normalize();

  // Grass beyond the track area.
  const field = mesh(new THREE.PlaneGeometry(9000, 9000), mat('#6fbf4f'), { cast: false, receive: true });
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.5;
  scene.add(field);

  let mode = 'full';
  let track = null;
  let trackGroup = null;
  let ground = null;
  let skid = null; // { canvas, ctx, tex, scale, dirty }
  let lastSkid = new Map();
  const racerModels = new Map();
  const animalModels = new Map();
  const pickupModels = new Map();
  let spinners = [];
  let cssW = 1;
  let cssH = 1;
  let lastTime = 0;
  const cam = { pos: null, look: null, yaw: 0 };
  let particles = [];
  const texts = [];

  // ---------- Sizing ----------

  function resize(w, h) {
    cssW = w;
    cssH = h;
    gl.setSize(w, h);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cam.pos = null;
  }

  function setMode(m) {
    mode = m;
    cam.pos = null;
  }

  // ---------- Track scene ----------

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  function setTrack(t) {
    track = t;
    if (trackGroup) {
      scene.remove(trackGroup);
      disposeGroup(trackGroup);
      if (ground) ground.material.map.dispose();
    }
    for (const m of [...racerModels.values(), ...animalModels.values(), ...pickupModels.values()]) scene.remove(m);
    racerModels.clear();
    animalModels.clear();
    pickupModels.clear();
    particles = [];
    texts.length = 0;
    spinners = [];
    trackGroup = new THREE.Group();
    scene.add(trackGroup);
    const rng = globalThis.FarmRng.mulberry32(t.id.length * 7919 + t.count);

    // Ground: the 2D renderer paints the grass, dirt track, mud, ponds,
    // ruts and start line onto a big texture.
    const maxTex = Math.min(4096, gl.capabilities.maxTextureSize);
    const scale = maxTex / W;
    const gc = document.createElement('canvas');
    gc.width = Math.round(W * scale);
    gc.height = Math.round(H * scale);
    const g2 = gc.getContext('2d');
    g2.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground(g2, t, { on: true, ground3d: true, C: 1, S: 0, top: 0 });
    const tex = new THREE.CanvasTexture(gc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    ground = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: tex }), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    trackGroup.add(ground);

    // Tyre marks on their own transparent layer just above the ground.
    const sc = document.createElement('canvas');
    const sScale = Math.min(2048, maxTex) / W;
    sc.width = Math.round(W * sScale);
    sc.height = Math.round(H * sScale);
    const sctx = sc.getContext('2d');
    sctx.setTransform(sScale, 0, 0, sScale, 0, 0);
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    const skidMesh = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: stex, transparent: true, depthWrite: false }), { cast: false, receive: true });
    skidMesh.rotation.x = -Math.PI / 2;
    skidMesh.position.y = 0.25;
    trackGroup.add(skidMesh);
    skid = { canvas: sc, ctx: sctx, tex: stex, dirty: 0 };
    lastSkid = new Map();

    // Walls: hay bales, tyre stacks and oil barrels as instanced meshes.
    const items = wallItems(t);
    const counts = { bale: 0, tyre: 0, barrel: 0 };
    for (const it of items) counts[it.kind]++;
    const bales = new THREE.InstancedMesh(new THREE.BoxGeometry(23, 11, 14), mat('#ffffff'), Math.max(1, counts.bale));
    const tyres = new THREE.InstancedMesh(new THREE.TorusGeometry(6, 3, 6, 14), mat('#222222'), Math.max(1, counts.tyre * 3));
    const barrels = new THREE.InstancedMesh(new THREE.CylinderGeometry(8, 8, 16, 14), mat('#ffffff'), Math.max(1, counts.barrel));
    for (const im of [bales, tyres, barrels]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    const barrelCols = ['#2f6fd0', '#e2412f', '#2e9a47'];
    for (const it of items) {
      const p = new THREE.Vector3(toX(it.x), 0, toZ(it.y));
      if (it.kind === 'bale') {
        q.setFromAxisAngle(yAxis, -it.angle);
        p.y = 5.5;
        m.compose(p, q, one);
        bales.setMatrixAt(bales.count, m);
        bales.setColorAt(bales.count, new THREE.Color(it.n % 2 ? '#e6bd55' : '#d6aa44'));
        bales.count++;
      } else if (it.kind === 'tyre') {
        for (let k = 0; k < 3; k++) {
          p.y = 3 + k * 5.6;
          m.compose(p, flat, one);
          tyres.setMatrixAt(tyres.count++, m);
        }
      } else {
        p.y = 8;
        m.compose(p, new THREE.Quaternion(), one);
        barrels.setMatrixAt(barrels.count, m);
        barrels.setColorAt(barrels.count, new THREE.Color(barrelCols[it.n % 3]));
        barrels.count++;
      }
    }
    trackGroup.add(bales, tyres, barrels);

    // Jump ramps: a wedge rising in the direction of travel.
    for (const f of t.features) {
      if (f.type !== 'jump') continue;
      const shape = new THREE.Shape();
      shape.moveTo(-f.len / 2 - 14, 0);
      shape.lineTo(f.len / 2, 0);
      shape.lineTo(f.len / 2, 12);
      shape.lineTo(-f.len / 2 - 14, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: f.halfWidth * 2, bevelEnabled: false });
      geo.translate(0, 0, -f.halfWidth);
      const ramp = mesh(geo, mat('#b57a40'), { receive: true });
      ramp.position.set(toX(f.x), 0, toZ(f.y));
      ramp.rotation.y = -f.angle;
      trackGroup.add(ramp);
      // Plank lines.
      for (let i = -f.halfWidth + 6; i < f.halfWidth; i += 12) {
        const plank = box(f.len + 14, 0.6, 1.2, '#7a4f25', 0, 0, 0);
        plank.castShadow = false;
        plank.position.set(-7, 6.4, i);
        plank.rotation.z = Math.atan2(12, f.len + 14);
        ramp.add(plank);
      }
    }

    // Scenery models and the grandstand.
    for (const s of t.scenery) {
      const model = makeScenery(s, rng);
      if (!model.children.length) continue;
      model.position.set(toX(s.x), 0, toZ(s.y));
      if (s.scale) model.scale.setScalar(s.scale);
      trackGroup.add(model);
      if (model.userData.spin) spinners.push(model.userData.spin);
    }
    const stand = makeGrandstand(rng);
    stand.position.set(-W / 2, 0, -H / 2 - 10);
    trackGroup.add(stand);

    // Flag marshal on the start line.
    const s0 = t.samples[0];
    const flagman = new THREE.Group();
    const off = t.halfWidth + 30;
    flagman.position.set(toX(s0.x - s0.nx * off), 0, toZ(s0.y - s0.ny * off));
    const man = cyl(5, 6, 16, '#2f7de2', 8);
    man.position.y = 8;
    const head = ball(4.5, '#f2c9a0', 1);
    head.position.y = 20;
    const pole = cyl(0.6, 0.6, 26, '#3b2a14', 5);
    pole.position.set(0, 26, 0);
    pole.rotation.z = -0.5;
    const flag = box(12, 8, 0.8, '#2fae4a', 10, 34, 0);
    flagman.add(man, head, pole, flag);
    flagman.userData.flag = flag;
    trackGroup.add(flagman);
    trackGroup.userData.flagman = flagman;

    cam.pos = null;
  }

  function clearSkids() {
    if (!skid) return;
    skid.ctx.save();
    skid.ctx.setTransform(1, 0, 0, 1, 0, 0);
    skid.ctx.clearRect(0, 0, skid.canvas.width, skid.canvas.height);
    skid.ctx.restore();
    skid.tex.needsUpdate = true;
    lastSkid = new Map();
  }

  // ---------- Effects ----------

  const spriteTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const spritePool = [];
  function spawn(type, x, y, z, vx, vy, vz, life, size, color) {
    let sp = spritePool.pop();
    if (!sp) {
      sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, transparent: true, depthWrite: false }));
    }
    sp.material.color.set(color);
    sp.material.opacity = 1;
    scene.add(sp);
    particles.push({ type, sp, x, y, z, vx, vy, vz, life, max: life, size });
    if (particles.length > 260) kill(particles.shift());
  }
  function kill(p) {
    scene.remove(p.sp);
    spritePool.push(p.sp);
  }
  const dust = (x, y, size = 1, color = '#d9b98a') =>
    spawn('dust', x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, 3, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 12 + Math.random() * 10, 0.7, 10 * size, color);
  const spark = (x, y, color) => {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    spawn('spark', x, y, 8, Math.cos(a) * sp, Math.sin(a) * sp, 40 + Math.random() * 60, 0.4, 4, color);
  };

  function addEvents(events, sim) {
    for (const e of events) {
      const r = e.id != null ? sim.racers[e.id] : null;
      if (e.type === 'wall') {
        for (let i = 0; i < 8; i++) spark(e.x, e.y, '#ffe27a');
        if (e.power > 90) texts.push({ x: e.x, y: e.y, z: 30, text: 'THUD!', color: '#fff', life: 0.7, max: 0.7 });
      } else if (e.type === 'bang') {
        for (let i = 0; i < 6; i++) spark(e.x, e.y, '#fff6a8');
      } else if (e.type === 'land' && r) {
        for (let i = 0; i < 10; i++) dust(r.x, r.y, 1.6, '#c99a5e');
      } else if (e.type === 'pickup') {
        const label = e.kind === 'cash' ? `+${e.value}` : '+NITRO';
        if (r && r.isPlayer) texts.push({ x: e.x, y: e.y, z: 30, text: label, color: e.kind === 'cash' ? '#ffd23f' : '#ff7a2f', life: 1.1, max: 1.1 });
        for (let i = 0; i < 8; i++) spark(e.x, e.y, e.kind === 'cash' ? '#ffd23f' : '#ff7a2f');
      } else if (e.type === 'nitro' && r) {
        texts.push({ x: r.x, y: r.y, z: 40, text: 'NITRO!', color: '#ff7a2f', life: 0.8, max: 0.8 });
      } else if (e.type === 'animal') {
        for (let i = 0; i < 6; i++) spawn('spark', e.x, e.y, 10, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 60, 0.6, 5, '#fff8e6');
      }
    }
  }

  function emitFromRacers(sim, dt) {
    const s = skid.ctx;
    for (const r of sim.racers) {
      const speed = Math.hypot(r.vx, r.vy);
      const bodyA = r.heading + (r.drift || 0);
      const fx = Math.cos(bodyA);
      const fy = Math.sin(bodyA);
      const rearX = r.x - fx * 10;
      const rearY = r.y - fy * 10;
      const slip = Math.abs(-r.vx * fy + r.vy * fx);
      if (!r.airborne && speed > 30) {
        const p = r.surface === 'mud' ? 0.6 : r.surface === 'water' ? 0.5 : 0.18 + slip / 220;
        if (Math.random() < p * dt * 60) {
          if (r.surface === 'mud') dust(rearX, rearY, 1, '#6b4a26');
          else if (r.surface === 'water') spawn('drop', rearX, rearY, 4, (Math.random() - 0.5) * 80 - fx * 40, (Math.random() - 0.5) * 80 - fy * 40, 50, 0.5, 4, '#bfe9ff');
          else dust(rearX, rearY);
        }
      }
      if (r.nitroTime > 0 && Math.random() < 0.8) {
        spawn('flame', r.x - fx * 18, r.y - fy * 18, 12 + r.z, -fx * 90, -fy * 90, 10, 0.25, 7, Math.random() < 0.5 ? '#ffe36b' : '#ff7a2f');
      }
      if (Math.random() < 0.06 + speed / 3000) {
        spawn('smoke', r.x + fx * 5 - fy * 4, r.y + fy * 5 + fx * 4, 34 + r.z, -fx * 10, -fy * 10, 18, 0.9, 5, '#8a8a8a');
      }
      const marks = [-1, 1].map((side) => ({ x: rearX - fy * 11 * side, y: rearY + fx * 11 * side }));
      const prev = lastSkid.get(r.id);
      if (prev && !r.airborne && speed > 15) {
        let alpha = 0.07;
        let color = '60, 35, 15';
        if (slip > 18) alpha = Math.min(0.35, 0.06 + slip / 300);
        if (r.surface === 'mud') { alpha = 0.3; color = '50, 30, 10'; }
        if (r.surface === 'water') alpha = 0;
        if (alpha > 0) {
          s.strokeStyle = `rgba(${color}, ${alpha})`;
          s.lineWidth = 5;
          s.lineCap = 'round';
          for (let i = 0; i < 2; i++) {
            s.beginPath();
            s.moveTo(prev[i].x, prev[i].y);
            s.lineTo(marks[i].x, marks[i].y);
            s.stroke();
          }
          skid.dirty++;
        }
      }
      lastSkid.set(r.id, r.airborne ? null : marks);
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.type === 'spark' || p.type === 'drop') p.vz -= 300 * dt;
      p.z = Math.max(0.5, p.z);
      p.vx *= 0.94;
      p.vy *= 0.94;
      const k = Math.max(0, p.life / p.max);
      const grow = p.type === 'dust' || p.type === 'smoke' ? 1.6 - k * 0.6 : 1;
      p.sp.position.set(toX(p.x), p.z, toZ(p.y));
      p.sp.scale.setScalar(p.size * grow);
      p.sp.material.opacity = p.type === 'dust' ? k * 0.6 : p.type === 'smoke' ? k * 0.4 : k;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) {
        kill(particles[i]);
        particles.splice(i, 1);
      }
    }
  }

  // ---------- Dynamic objects ----------

  function syncRacers(sim, now) {
    for (const r of sim.racers) {
      let m = racerModels.get(r.id);
      if (!m) {
        m = makeTractor(r.color);
        racerModels.set(r.id, m);
        scene.add(m);
      }
      const shake = r.bump > 0 ? Math.sin(now / 18 + r.id) * r.bump * 1.2 : 0;
      m.position.set(toX(r.x), r.z, toZ(r.y));
      m.rotation.y = -(r.heading + (r.drift || 0));
      const { body, wheels } = m.userData;
      body.position.y = shake * 0.6;
      // Lean out of turns a little; nose up while flying.
      body.rotation.x = -r.steer * Math.min(1, Math.hypot(r.vx, r.vy) / 160) * 0.08;
      m.rotation.z = r.airborne ? Math.min(0.25, r.vz / 900) : 0;
      const roll = (r.progress || 0) / 9.5;
      for (const w of wheels.rear) w.rotation.z = -roll;
      for (const f of wheels.front) {
        f.pivot.rotation.y = -r.steer * 0.45;
        f.wheel.rotation.z = -roll * 1.9;
      }
    }
  }

  function syncAnimals(sim, now) {
    const seen = new Set();
    for (const a of sim.animals || []) {
      seen.add(a.id);
      let m = animalModels.get(a.id);
      if (!m) {
        m = makeAnimal(a.kind);
        m.scale.setScalar(a.r / 10);
        animalModels.set(a.id, m);
        scene.add(m);
      }
      m.position.set(toX(a.x), a.z, toZ(a.y));
      m.rotation.y = -a.heading;
      m.rotation.x = a.mode === 'tumble' ? a.heading * 1.3 : 0;
      const walk = a.mode === 'walk' ? Math.sin(a.walkPhase) * 0.5 : 0;
      m.userData.legs.forEach((l, i) => (l.rotation.z = i % 2 ? walk : -walk));
      if (a.startle > 0 && a.mode !== 'tumble') m.rotation.z = Math.sin(now / 60) * 0.12;
      else m.rotation.z = 0;
    }
    for (const [id, m] of animalModels) {
      if (!seen.has(id)) {
        scene.remove(m);
        animalModels.delete(id);
      }
    }
  }

  function syncPickups(sim, now) {
    const seen = new Set();
    for (const p of sim.pickups) {
      seen.add(p.id);
      let m = pickupModels.get(p.id);
      if (!m) {
        m = new THREE.Group();
        if (p.type === 'cash') {
          const sack = ball(8, '#d9b77a', 1);
          sack.scale.set(1, 1.1, 1);
          sack.position.y = 8;
          const tie = cyl(3, 4, 4, '#7a5a2a', 8);
          tie.position.y = 17;
          const sign = box(6, 6, 0.6, '#2e8b3a', 0, 9, 8);
          m.add(sack, tie, sign);
        } else {
          const can = cyl(5, 5, 16, '#e2412f', 12);
          can.position.y = 8;
          const band = cyl(5.2, 5.2, 4, '#ffffff', 12);
          band.position.y = 8;
          const cap = cyl(2, 2, 3, '#555555', 8);
          cap.position.y = 17.5;
          m.add(can, band, cap);
        }
        pickupModels.set(p.id, m);
        scene.add(m);
      }
      m.position.set(toX(p.x), 3 + Math.sin(now / 200 + p.id) * 3, toZ(p.y));
      m.rotation.y = now / 600 + p.id;
    }
    for (const [id, m] of pickupModels) {
      if (!seen.has(id)) {
        scene.remove(m);
        pickupModels.delete(id);
      }
    }
  }

  // ---------- Camera ----------

  // Whole-track view: a grandstand-eye view from the south, pulled back far
  // enough that the whole track (and its walls) fits on screen.
  function fullCamera() {
    const dir = new THREE.Vector3(0, Math.sin(0.95), Math.cos(0.95)); // ~54° up
    const target = new THREE.Vector3(0, 0, 18);
    const corners = [[-W / 2, 0, -H / 2], [W / 2, 0, -H / 2], [-W / 2, 0, H / 2], [W / 2, 0, H / 2], [0, 60, -H / 2 - 30]].map((c) => new THREE.Vector3(...c));
    let lo = 300;
    let hi = 6000;
    for (let i = 0; i < 24; i++) {
      const d = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.9;
      });
      if (fits) hi = d;
      else lo = d;
    }
    camera.position.copy(target).addScaledVector(dir, hi);
    camera.lookAt(target);
  }

  // Chase view: behind and above your tractor, swinging round with it.
  function chaseCamera(sim, dt) {
    const me = sim.racers[0];
    const speed = Math.hypot(me.vx, me.vy);
    const travel = speed > 25 ? Math.atan2(me.vy, me.vx) : me.heading;
    const want = me.heading + angleDiff(travel, me.heading) * 0.5;
    if (cam.pos == null) cam.yaw = want;
    cam.yaw += angleDiff(want, cam.yaw) * Math.min(1, dt * 4);
    const back = 175;
    const up = 105;
    const px = me.x - Math.cos(cam.yaw) * back;
    const py = me.y - Math.sin(cam.yaw) * back;
    const pos = new THREE.Vector3(toX(px), up + me.z * 0.5, toZ(py));
    const look = new THREE.Vector3(toX(me.x + Math.cos(cam.yaw) * 95), 6 + me.z * 0.5, toZ(me.y + Math.sin(cam.yaw) * 95));
    if (cam.pos == null) {
      cam.pos = pos;
      cam.look = look;
    } else {
      const f = 1 - Math.exp(-dt * 8);
      cam.pos.lerp(pos, f);
      cam.look.lerp(look, f);
    }
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
  }

  function aimSun(focusX, focusZ, span) {
    sun.target.position.set(focusX, 0, focusZ);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 1200);
    const sc = sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 200;
    sc.far = 2600;
    sc.updateProjectionMatrix();
  }

  // ---------- Frame ----------

  // If frames are slow, step the quality down once: fewer pixels and
  // simpler shadows.
  const perf = { frames: 0, time: 0, reduced: false };
  function watchPerformance(dtRaw) {
    if (perf.reduced || dtRaw <= 0 || dtRaw > 0.5) return;
    perf.frames++;
    perf.time += dtRaw;
    if (perf.frames < 90) return;
    if (perf.time / perf.frames > 1 / 40) {
      perf.reduced = true;
      gl.setPixelRatio(1);
      gl.setSize(cssW, cssH);
      sun.shadow.mapSize.set(1024, 1024);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      gl.shadowMap.type = THREE.PCFShadowMap;
    }
    perf.frames = 0;
    perf.time = 0;
  }

  function draw(sim, view, now) {
    if (!track) return;
    const dtRaw = lastTime ? (now - lastTime) / 1000 : 0;
    const dt = Math.min(0.05, dtRaw);
    lastTime = now;
    watchPerformance(dtRaw);
    if (view.running) {
      emitFromRacers(sim, dt);
      updateParticles(dt);
    }
    if (skid.dirty && (skid.dirty > 6 || Math.random() < 0.2)) {
      skid.tex.needsUpdate = true;
      skid.dirty = 0;
    }
    syncRacers(sim, now);
    syncAnimals(sim, now);
    syncPickups(sim, now);
    for (const s of spinners) s.rotation.z += dt * 1.2;
    const fm = trackGroup.userData.flagman;
    if (fm) {
      let color = '#2fae4a';
      if (view.countdown > 0) color = view.countdown > 1 ? '#e2412f' : '#f4c20d';
      if (view.finalLap) color = '#ffffff';
      if (view.chequered) color = '#222222';
      fm.userData.flag.material = mat(color);
      fm.userData.flag.position.y = 34 + (view.countdown > 0 ? 0 : Math.sin(now / 120) * 2);
    }

    const me = sim.racers[0];
    if (mode === 'chase') {
      chaseCamera(sim, dt);
      aimSun(toX(me.x + Math.cos(cam.yaw) * 120), toZ(me.y + Math.sin(cam.yaw) * 120), 420);
    } else {
      fullCamera();
      aimSun(0, 0, Math.max(W, H) * 0.62);
    }
    gl.render(scene, camera);
    drawOverlay(sim, view, now, dt);
  }

  // Screen position (CSS px) of a world point, or null when behind the camera.
  function toScreen(x, y, z) {
    const v = new THREE.Vector3(toX(x), z, toZ(y)).project(camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  function drawOverlay(sim, view, now, dt) {
    const dpr = overlay.width / cssW;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';

    // Floating text.
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      t.z += 30 * dt;
      if (t.life <= 0) {
        texts.splice(i, 1);
        continue;
      }
      const p = toScreen(t.x, t.y, t.z);
      if (!p) continue;
      octx.globalAlpha = Math.min(1, (t.life / t.max) * 2.5);
      octx.font = `22px ${FONT}`;
      octx.lineWidth = 5;
      octx.strokeStyle = OUTLINE;
      octx.strokeText(t.text, p.x, p.y);
      octx.fillStyle = t.color;
      octx.fillText(t.text, p.x, p.y);
    }
    octx.globalAlpha = 1;

    const me = sim.racers[0];
    if (view.showYou) {
      const p = toScreen(me.x, me.y, me.z + 40);
      if (p) {
        const bob = Math.sin(now / 150) * 3;
        octx.save();
        octx.translate(p.x, p.y + bob);
        octx.beginPath();
        octx.moveTo(-8, -6);
        octx.lineTo(8, -6);
        octx.lineTo(0, 6);
        octx.closePath();
        octx.fillStyle = '#ffd23f';
        octx.fill();
        octx.lineWidth = 2.5;
        octx.strokeStyle = OUTLINE;
        octx.stroke();
        octx.font = `15px ${FONT}`;
        octx.lineWidth = 4;
        octx.strokeText('YOU', 0, -16);
        octx.fillStyle = '#fff';
        octx.fillText('YOU', 0, -16);
        octx.restore();
      }
    }

    if (mode === 'chase') drawMinimap(sim);

    // Countdown and banners use the same art as the 2D view.
    if (view.countdown > 0 || view.banner) {
      const s0 = Math.min(cssW / W, cssH / H);
      octx.setTransform(s0 * dpr, 0, 0, s0 * dpr, ((cssW - W * s0) / 2) * dpr, ((cssH - H * s0) / 2) * dpr);
      if (view.countdown > 0) drawCountdown(octx, view.countdown);
      if (view.banner) drawBanner(octx, view.banner.text, view.banner.t);
    }
  }

  function drawMinimap(sim) {
    const t = sim.track;
    // Top left, under the HUD, so it never covers your tractor.
    const mw = Math.min(cssW * 0.2, cssH * 0.4);
    const ms = mw / W;
    const mh = H * ms;
    const x0 = 14;
    const y0 = 58;
    const c = octx;
    c.save();
    c.globalAlpha = 0.8;
    c.fillStyle = 'rgba(40, 70, 30, 0.5)';
    c.beginPath();
    c.roundRect(x0 - 6, y0 - 6, mw + 12, mh + 12, 10);
    c.fill();
    c.translate(x0, y0);
    c.scale(ms, ms);
    c.beginPath();
    t.samples.forEach((s, i) => (i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y)));
    c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = '#e6c08a';
    c.lineWidth = t.width * 0.7;
    c.stroke();
    for (const r of sim.racers.slice().sort((a, b) => a.isPlayer - b.isPlayer)) {
      c.beginPath();
      c.arc(r.x, r.y, r.isPlayer ? 34 : 26, 0, Math.PI * 2);
      c.fillStyle = r.color;
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = r.isPlayer ? '#fff' : OUTLINE;
      c.stroke();
    }
    c.restore();
  }

  function dispose() {
    gl.dispose();
  }

  return {
    resize, setTrack, setMode, draw, addEvents, clearSkids, dispose,
    setTilt() {},
    get mode() { return mode; },
    get aspect() { return cssW / cssH; },
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { Tracks };
