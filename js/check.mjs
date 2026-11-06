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
