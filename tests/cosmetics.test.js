const test = require('node:test');
const assert = require('node:assert');
const { createWallet, GOLD_KEY } = require('../js/wallet.js');
const Garage = require('../js/tractor/garage.js');
const Tracks = require('../js/tractor/tracks.js');
const Sim = require('../js/tractor/sim.js');

function memStore() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)), removeItem: (k) => delete d[k] };
}

function setup(goldBalance = 0) {
  const s = memStore();
  const gold = createWallet(s, { key: GOLD_KEY });
  if (goldBalance) gold.deposit(goldBalance, 'test');
  return { s, gold, garage: Garage.createGarage(s) };
}

test('the catalogue gives the big Gold packs something to buy', () => {
  const premiumPaints = Garage.PAINTS.reduce((n, p) => n + (p.gold || 0), 0);
  const cosmetics = Object.values(Garage.COSMETICS).flat().reduce((n, c) => n + (c.gold || 0), 0);
  assert.ok(premiumPaints + cosmetics >= 2500, `only ${premiumPaints + cosmetics} Gold of cosmetics`);
  for (const [cat, list] of Object.entries(Garage.COSMETICS)) assert.strictEqual(list[0].id, 'none', `${cat} starts with a free none`);
});

test('a cosmetic is paid for once, then equipped for free', () => {
  const { gold, garage } = setup(500);
  assert.ok(garage.buyCosmetic('hat', 'cowboy', gold));
  assert.strictEqual(gold.balance, 350);
  assert.strictEqual(garage.look.hat, 'cowboy');
  garage.equip('hat', 'none');
  assert.ok(garage.buyCosmetic('hat', 'cowboy', gold));
  assert.strictEqual(gold.balance, 350, 'not charged twice');
});

test('unaffordable or unknown cosmetics change nothing', () => {
  const { gold, garage } = setup(50);
  assert.strictEqual(garage.buyCosmetic('trail', 'rainbow', gold), false);
  assert.strictEqual(garage.buyCosmetic('hat', 'tophat', gold), false);
  assert.strictEqual(garage.equip('trail', 'rainbow'), false);
  assert.strictEqual(gold.balance, 50);
  assert.strictEqual(garage.look.trail, 'none');
});

test('cosmetics survive a reload, and old saves load with none equipped', () => {
  const { s, gold, garage } = setup(500);
  garage.buyCosmetic('decal', 'flames', gold);
  assert.strictEqual(Garage.createGarage(s).look.decal, 'flames');
  assert.ok(Garage.createGarage(s).cosmeticOwned('decal', 'flames'));
  const old = memStore();
  old.setItem('farmCasino.tractor.v1', JSON.stringify({ paint: 'blue', ownedPaints: ['mint'] }));
  const g = Garage.createGarage(old);
  assert.deepStrictEqual(g.look, { decal: 'none', hat: 'none', trail: 'none' });
  assert.strictEqual(g.spareNitros, 0);
  assert.ok(g.paintOwned('mint'));
});

test('an upgrade level can be bought with Gold at a tenth of its Hay price', () => {
  const { gold, garage } = setup(1000);
  const hay = garage.nextCost('speed');
  const cost = garage.nextGoldCost('speed');
  assert.strictEqual(cost, Garage.upgradeGoldCost(hay));
  assert.ok(cost >= hay / 10 && cost < hay / 10 + 10);
  assert.ok(garage.buyWithGold('speed', gold));
  assert.strictEqual(garage.upgrades.speed, 1);
  assert.strictEqual(gold.balance, 1000 - cost);
  for (let i = 0; i < 10; i++) garage.buyWithGold('speed', gold);
  assert.strictEqual(garage.upgrades.speed, Garage.MAX_LEVEL);
  assert.strictEqual(garage.nextGoldCost('speed'), null);
});

test('spare nitros: bought in a crate, used one per race only when taken', () => {
  const { gold, garage } = setup(100);
  assert.strictEqual(garage.takeSpareNitro(), 0);
  assert.ok(garage.buySpareNitros(gold));
  assert.strictEqual(gold.balance, 100 - Garage.SPARE_NITROS.gold);
  assert.strictEqual(garage.spareNitros, Garage.SPARE_NITROS.count);
  assert.ok(garage.armNitro);
  garage.setArmNitro(false);
  assert.strictEqual(garage.takeSpareNitro(), 0);
  assert.strictEqual(garage.spareNitros, Garage.SPARE_NITROS.count);
  garage.setArmNitro(true);
  assert.strictEqual(garage.takeSpareNitro(), 1);
  assert.strictEqual(garage.spareNitros, Garage.SPARE_NITROS.count - 1);
});

test('the spare nitro goes to the player only, and never into Farmyard Frenzy', () => {
  const track = Tracks.buildTrack(Tracks.TRACKS[0]);
  const plain = Sim.createRace(track, { seed: 3 });
  const extra = Sim.createRace(track, { seed: 3, extraNitros: 1, playerLook: { hat: 'crown' } });
  assert.strictEqual(extra.racers[0].nitros, plain.racers[0].nitros + 1);
  for (let i = 1; i < extra.racers.length; i++) {
    assert.strictEqual(extra.racers[i].nitros, plain.racers[i].nitros);
    assert.strictEqual(extra.racers[i].look, null);
  }
  assert.strictEqual(extra.racers[0].look.hat, 'crown');
  const frenzy = Sim.createRace(track, { seed: 3, extraNitros: 1, frenzy: true });
  const frenzyPlain = Sim.createRace(track, { seed: 3, frenzy: true });
  assert.strictEqual(frenzy.racers[0].nitros, frenzyPlain.racers[0].nitros);
});
