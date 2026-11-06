// Self-check for the pure rules. Run: node js/check.mjs
import assert from 'node:assert/strict';
import { planOutfit, wearItem, nearestColour, pickColours, defaultWashGroup } from './model.js';

const day = (feels, rain = 0) => Array.from({ length: 24 }, (_, h) => ({ time: `2026-11-06T${String(h).padStart(2, '0')}:00`, temp: feels, feels, rain, code: 3 }));
const it = (id, category, subtype, extra = {}) => ({ id, category, subtype, status: 'clean', formality: 'casual', warmth: 2, colours: [], ...extra });
const closet = [
  it('u', 'underwear', 'boxers'), it('s', 'socks', 'socks'), it('t', 'tops', 't-shirt', { warmth: 1 }),
  it('j', 'bottoms', 'jeans'), it('h', 'tops', 'hoodie', { warmth: 3 }), it('lj', 'outerwear', 'light jacket'),
  it('sn', 'shoes', 'sneakers'), it('dirty', 'tops', 't-shirt', { status: 'hamper', warmth: 1 }),
];

// never suggests a non-clean item
for (let seed = 0; seed < 20; seed++) {
  const r = planOutfit({ items: closet, hours: day(10), seed });
  assert(r.picks.every(p => p.item.status === 'clean'), 'only clean items');
}
// mild day: base + mid + light jacket, nothing missing
let r = planOutfit({ items: closet, hours: day(10) });
assert.deepEqual(r.picks.map(p => p.slot).sort(), ['bottom', 'mid', 'outer', 'shoes', 'socks', 'top', 'underwear']);
assert.deepEqual(r.missing, []);
// rain without a waterproof jacket -> umbrella + missing chip
r = planOutfit({ items: closet, hours: day(10, 80) });
assert(r.bring.includes('Umbrella') && r.missing.includes('waterproof-jacket'));
// deep cold -> winter coat + hat/gloves/scarf missing
r = planOutfit({ items: closet, hours: day(-12) });
for (const g of ['winter-coat', 'hat', 'gloves', 'scarf']) assert(r.missing.includes(g), g);
// interview with no formal clothes -> formal gaps
r = planOutfit({ items: closet, hours: day(10), stops: [{ time: '10:00', type: 'Interview' }] });
assert(r.missing.includes('formal-shoes') && r.missing.includes('blazer'));
// gym + class -> swap note
r = planOutfit({ items: closet, hours: day(25), stops: [{ time: '09:00', type: 'Class' }, { time: '17:00', type: 'Gym' }] });
assert(r.notes.some(n => /gym/.test(n)) && r.bring.includes('Gym bag'));
// layer tip when it warms up
const warming = day(10).map(x => +x.time.slice(11, 13) >= 14 ? { ...x, feels: 19 } : x);
r = planOutfit({ items: closet, hours: warming, stops: [{ time: '09:00', type: 'Class' }, { time: '15:00', type: 'Other' }] });
assert(r.tips.some(t => /hoodie off after 3 pm/.test(t)), r.tips.join());

// wearing: socks straight to hamper, jeans after 5 wears, shoes stay clean
assert.equal(wearItem(it('s', 'socks', 'socks'), {}).status, 'hamper');
let jeans = it('j', 'bottoms', 'jeans');
for (let i = 0; i < 4; i++) jeans = wearItem(jeans, {});
assert.equal(jeans.status, 'worn');
assert.equal(wearItem({ ...jeans, status: 'clean' }, {}).status, 'hamper');
assert.equal(wearItem(it('sn', 'shoes', 'sneakers', { washGroup: 'no-wash' }), {}).status, 'clean');

// colours
assert.equal(nearestColour([20, 30, 70]), 'navy');
assert.equal(nearestColour([250, 250, 250]), 'white');
const px = [...Array(300).fill([200, 20, 40]), ...Array(700).fill([245, 245, 245])];
assert.deepEqual(pickColours(px, [245, 245, 245]).map(c => c.name), ['red']);
assert.equal(defaultWashGroup('tops', 't-shirt', [{ name: 'black' }]), 'darks');
console.log('check ok');

// clothing gate
import { clothingVerdict, GATE_CLOTHING, GATE_OTHER } from './model.js';
const sc = (hit, s) => [...GATE_CLOTHING, ...GATE_OTHER].map(label => ({ label, score: label === hit ? s : (1 - s) / 12 }));
assert.equal(clothingVerdict(sc('a photo of shoes', 0.8)).ok, true);
assert.equal(clothingVerdict(sc('a photo of food', 0.7)).ok, false);
assert.equal(clothingVerdict(sc('a photo of a clothing item', 0.3)).ok, false, 'clothing wins but total under 0.5');
console.log('gate ok');

// photo cutout: coverage gate, feather, trim box + fallback
import { coverage, maskOk, feather, trimBox } from './photo.js';
import { nextChoice, toggleHeart, streak } from './model.js';
const W = 100, H = 80, mask = new Uint8Array(W * H);
for (let y = 20; y < 60; y++) for (let x = 30; x < 50; x++) mask[y * W + x] = 255;
assert(Math.abs(coverage(mask) - 0.1) < 1e-9, '20x40 of 100x80 = 10%');
assert(maskOk(mask) && !maskOk(new Uint8Array(W * H)) && !maskOk(new Uint8Array(W * H).fill(255)), 'coverage 10..95% only');
let b = trimBox(mask, W, H);
assert.deepEqual(b.item, { x0: 30, y0: 20, x1: 49, y1: 59 });
assert(Math.abs(b.size - 40 * 1.12) < 1e-9 && Math.abs(b.x + b.size / 2 - 40) < 1e-9 && Math.abs(b.y + b.size / 2 - 40) < 1e-9, 'square, 6% pad, centred');
b = trimBox(null, W, H); // fallback: background removal failed
assert.deepEqual([b.x, b.y, b.size, b.item], [10, 0, 80, null]);
assert.equal(trimBox(new Uint8Array(W * H), W, H).item, null, 'empty mask falls back too');
const f = feather(mask, W, H);
assert(f[40 * W + 40] === 255 && f[40 * W + 29] === 85 && f[40 * W + 30] === 170 && f[0] === 0, 'feather softens only the 1px edge');
// swipe-to-swap
assert.deepEqual(nextChoice({}, 'top', 1, 3), { top: 1 });
assert.deepEqual(nextChoice({ top: 0 }, 'top', -1, 3), { top: 2 }, 'swipe back wraps');
assert.deepEqual(nextChoice({ top: 0 }, 'top', 1, 1), { top: 0 }, 'single option: no swap');
// hearts
assert.deepEqual(toggleHeart(['a'], 'b'), ['a', 'b']);
assert.deepEqual(toggleHeart(['a', 'b'], 'a'), ['b']);
// streak
const o = d => ({ date: d, accepted: true });
assert.equal(streak([o('2026-11-04'), o('2026-11-05'), o('2026-11-06')], '2026-11-06'), 3);
assert.equal(streak([o('2026-11-04'), o('2026-11-05')], '2026-11-06'), 2, 'today not worn yet keeps streak');
assert.equal(streak([o('2026-11-03')], '2026-11-06'), 0);
console.log('cleanup/swipe/hearts ok');

// ---- shop recommendations
{
  const { recommend, gapSecondHand } = await import('./model.js');
  const P = [
    { id: 'a', name: 'Rain shell', brand: 'X', cat: 'outerwear', style: 'casual', warmth: 2, color: 'dark', wp: true, g: 'u', price: 90 },
    { id: 'b', name: 'Tee', brand: 'X', cat: 'top', style: 'casual', warmth: 1, color: 'bright', g: 'u', price: 10 },
    { id: 'c', name: 'Oxford shirt', brand: 'X', cat: 'top', style: 'smart', warmth: 1, color: 'neutral', g: 'u', price: 40 },
  ];
  const r = recommend({ products: P, gaps: ['waterproof-jacket', 'socks'], style: { formality: 'smart-casual' }, rainMax: 80 });
  assert(!r.some(s => s.key === 'socks'), 'empty sections hidden');
  assert(r[0].key === 'waterproof-jacket' && r[0].list[0].id === 'a', 'gap first');
  assert(r.find(s => s.key === 'top').list[0].id === 'c', 'style match ranks first');
  assert(!r.some(s => s.key === 'bottom'), 'no bottoms in catalog -> hidden');
  assert(!gapSecondHand('socks') && !gapSecondHand('underwear') && gapSecondHand('boots'), 'second-hand rules');
  console.log('recommend ok');
}

// ---- shop: "Shop for" is a hard filter; fit + favourite colours only boost
{
  const { productGender, shopFits, scoreProduct } = await import('./model.js');
  const gw = { name: "Women's Puffer", url: 'https://x.ca/p/1' }, gm = { name: 'Puffer', url: 'https://x.ca/mens/puffer-1' };
  assert.equal(productGender(gw), 'w');
  assert.equal(productGender(gm), 'm', 'gender from URL path');
  assert.equal(productGender({ name: 'Midi skirt' }), 'w', 'womenswear cut');
  assert.equal(productGender({ name: 'Crew tee', brand: 'Ardene' }), 'w', 'brand default');
  assert.equal(productGender({ name: 'Crew tee', g: 'u' }), 'u');
  assert(!shopFits(gw, 'm') && shopFits(gm, 'm') && shopFits({ name: 'Socks' }, 'm') && shopFits(gw, 'all'), 'men: no women\'s, unknown stays');
  const base = { styles: new Set(['casual']) }, p = { name: 'Slim navy chino', style: 'casual', color: 'dark', cat: 'bottom' };
  assert(scoreProduct(p, { ...base, fit: 'slim' }) > scoreProduct(p, base), 'fit boost');
  assert(scoreProduct(p, { ...base, favColours: ['navy'] }) > scoreProduct(p, base), 'colour boost');
  assert(scoreProduct(p, { ...base, fit: 'relaxed' }) < scoreProduct(p, base), 'wrong fit ranks lower');
  console.log('shop filter ok');
}

// ---- sync: last write wins, soft delete, no blobs in rows
{
  globalThis.indexedDB ??= undefined; // db.js only opens IndexedDB on first use
  const { decide, isDirty, toData, savedRows } = await import('./sync.js');
  assert.equal(decide(null, 5, false), 'apply', 'new remote row');
  assert.equal(decide({ updatedAt: 9 }, 5, false), 'skip', 'local newer wins');
  assert.equal(decide({ updatedAt: 5 }, 5, false), 'skip', 'tie keeps local');
  assert.equal(decide({ updatedAt: 1 }, 5, true), 'delete', 'remote soft delete');
  assert(isDirty({ updatedAt: 3 }) && !isDirty({ updatedAt: 3, _syncedMs: 3 }));
  assert.deepEqual(toData({ id: 'a', name: 'Tee', original: 'blob', thumb: 'blob', updatedAt: 1, _syncedMs: 1, _deleted: true }), { name: 'Tee' });
  const rows = savedRows(['Gap'], { p1: { id: 'p1' } }, { 'store:Roots': 7 });
  assert.deepEqual(rows.map(r => [r.id, r.on]), [['store:Gap', true], ['prod:p1', true], ['store:Roots', false]], 'unhearted store syncs as off');
  console.log('sync ok');
}
