// Pure data + rules. No DOM here, so `node js/check.mjs` can test it.

export const CAT_LABEL = {
  tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear', formal: 'Formal', 'dresses-skirts': 'Dresses & skirts',
  activewear: 'Activewear', underwear: 'Underwear', socks: 'Socks', sleepwear: 'Sleepwear', shoes: 'Shoes', accessories: 'Accessories',
};
export const CATEGORIES = Object.keys(CAT_LABEL);

// subtype: [category, wear-limit key, default warmth 1-5]
export const SUBTYPES = {
  't-shirt': ['tops', 'tee', 1], 'tank top': ['tops', 'tee', 1], 'long-sleeve shirt': ['tops', 'shirt', 2],
  'button-up shirt': ['tops', 'shirt', 2], polo: ['tops', 'shirt', 1], sweater: ['tops', 'sweater', 3], hoodie: ['tops', 'hoodie', 3],
  jeans: ['bottoms', 'jeans', 2], chinos: ['bottoms', 'trousers', 2], 'dress pants': ['bottoms', 'trousers', 2],
  shorts: ['bottoms', 'shorts', 1], sweatpants: ['bottoms', 'trousers', 2], leggings: ['activewear', 'activewear', 2],
  skirt: ['dresses-skirts', 'skirt-dress', 1], dress: ['dresses-skirts', 'skirt-dress', 1],
  blazer: ['formal', 'formal', 2], 'suit jacket': ['formal', 'formal', 2],
  'winter coat': ['outerwear', 'coat', 5], 'puffer jacket': ['outerwear', 'coat', 4],
  'rain jacket': ['outerwear', 'light-jacket', 2], 'light jacket': ['outerwear', 'light-jacket', 2],
  socks: ['socks', 'socks', 1], underwear: ['underwear', 'underwear', 1], boxers: ['underwear', 'underwear', 1],
  bra: ['underwear', 'underwear', 1], pajamas: ['sleepwear', 'sleepwear', 2],
  sneakers: ['shoes', 'never', 2], 'dress shoes': ['shoes', 'never', 2], boots: ['shoes', 'never', 4], sandals: ['shoes', 'never', 1],
  hat: ['accessories', 'never', 3], scarf: ['accessories', 'never', 4], gloves: ['accessories', 'never', 4],
  belt: ['accessories', 'never', 1], bag: ['accessories', 'never', 1],
};
const CAT_LIMIT_KEY = {
  tops: 'shirt', bottoms: 'trousers', outerwear: 'light-jacket', formal: 'formal', 'dresses-skirts': 'skirt-dress',
  activewear: 'activewear', underwear: 'underwear', socks: 'socks', sleepwear: 'sleepwear', shoes: 'never', accessories: 'never',
};
export const DEFAULT_LIMITS = {
  underwear: 1, socks: 1, sleepwear: 3, activewear: 1, tee: 1, shirt: 2, sweater: 4, hoodie: 4, jeans: 5,
  trousers: 3, shorts: 2, 'skirt-dress': 2, formal: 3, 'light-jacket': 10, coat: 20,
};
export const LIMIT_LABEL = {
  underwear: 'Underwear', socks: 'Socks', sleepwear: 'Sleepwear', activewear: 'Activewear', tee: 'T-shirts & tanks',
  shirt: 'Shirts & polos', sweater: 'Sweaters', hoodie: 'Hoodies', jeans: 'Jeans', trousers: 'Chinos & dress pants',
  shorts: 'Shorts', 'skirt-dress': 'Skirts & dresses', formal: 'Formal', 'light-jacket': 'Light jackets', coat: 'Coats',
};
export const DEFAULT_LOW_SUPPLY = { socks: 3, underwear: 3 };
export const STATUSES = ['clean', 'worn', 'hamper', 'washing', 'drying'];
export const WASH_GROUPS = { darks: 'Darks', lights: 'Lights', colours: 'Colours', delicates: 'Delicates', 'no-wash': 'No wash' };
export const FORMALITY = ['casual', 'smart-casual', 'formal'];
export const FORMALITY_LABEL = { casual: 'Casual', 'smart-casual': 'Smart casual', formal: 'Formal' };
export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
// Each stop type's minimum formality ("activewear" = gym kit).
export const STOP_TYPES = {
  Class: 'casual', Work: 'smart-casual', Gym: 'activewear', Dinner: 'smart-casual', Date: 'smart-casual',
  Travel: 'casual', Interview: 'formal', Other: 'casual',
};

export const categoryOf = subtype => SUBTYPES[subtype]?.[0];
export const limitKey = item => SUBTYPES[item.subtype]?.[1] ?? CAT_LIMIT_KEY[item.category] ?? 'shirt';
export const wearLimitOf = (item, limits = {}) =>
  limitKey(item) === 'never' || item.washGroup === 'no-wash' ? 0 : item.wearLimit || limits[limitKey(item)] || DEFAULT_LIMITS[limitKey(item)] || 2;

// ---- colours
export const PALETTE = {
  black: '#151515', charcoal: '#3a3f44', grey: '#8a8a8a', 'light grey': '#cfcfcf', white: '#f6f6f6', cream: '#f1e7cf',
  beige: '#d8c4a2', khaki: '#b3a477', tan: '#c19a6b', brown: '#6f4e37', navy: '#1f2a48', denim: '#45608a', blue: '#2f6fd0',
  'light blue': '#9cc3e6', teal: '#2a8c8c', green: '#2e8b57', olive: '#66663a', mint: '#a8e6cf', red: '#c8102e',
  burgundy: '#7a1f2b', pink: '#f4a6c0', coral: '#f88379', purple: '#6a3d9a', lavender: '#c8b6e2', yellow: '#f2d03b',
  mustard: '#c9a227', orange: '#f28c28',
};
export const NEUTRALS = new Set(['black', 'charcoal', 'grey', 'light grey', 'white', 'cream', 'beige', 'khaki', 'tan', 'brown', 'navy', 'denim', 'olive']);
const DARKS = new Set(['black', 'charcoal', 'navy', 'denim', 'brown', 'burgundy', 'olive', 'purple', 'grey']);
const LIGHTS = new Set(['white', 'cream', 'light grey', 'beige', 'khaki', 'tan']);

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const rgbHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// "Redmean" weighted RGB distance: cheap and close enough to perceptual for naming.
function dist([r1, g1, b1], [r2, g2, b2]) {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
export function nearestColour(rgb) {
  let best = null, bd = Infinity;
  for (const [name, hex] of Object.entries(PALETTE)) { const d = dist(rgb, hexRgb(hex)); if (d < bd) { bd = d; best = name; } }
  return best;
}
export function kmeans(px, k = 4, iters = 10) {
  // Deterministic init: spread seeds across pixels sorted by brightness.
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / k)]);
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    assign = px.map(p => { let bi = 0, bd = Infinity; centres.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } }); return bi; });
    centres = centres.map((c, i) => {
      const m = px.filter((_, j) => assign[j] === i);
      return m.length ? [0, 1, 2].map(ch => m.reduce((s, p) => s + p[ch], 0) / m.length) : c;
    });
  }
  return centres.map((c, i) => ({ rgb: c, size: assign.filter(a => a === i).length }));
}
// px: centre-crop pixels; border: average RGB of the image border (treated as background).
export function pickColours(px, border) {
  const clusters = kmeans(px).filter(c => c.size);
  if (border && clusters.length > 1) { // border null = pixels are already background-free (cutout)
    const bg = clusters.reduce((a, b) => dist(a.rgb, border) <= dist(b.rgb, border) ? a : b);
    clusters.splice(clusters.indexOf(bg), 1);
  }
  const total = clusters.reduce((s, c) => s + c.size, 0), out = [];
  for (const c of clusters.sort((a, b) => b.size - a.size)) {
    const name = nearestColour(c.rgb);
    if (c.size / total < 0.12 || out.some(o => o.name === name)) continue;
    out.push({ name, hex: rgbHex(c.rgb) });
    if (out.length === 3) break;
  }
  return out;
}
export function defaultWashGroup(category, subtype, colours = []) {
  if (category === 'shoes' || category === 'accessories') return 'no-wash';
  if (subtype === 'bra') return 'delicates';
  const c = colours[0]?.name;
  return !c ? 'colours' : DARKS.has(c) ? 'darks' : LIGHTS.has(c) ? 'lights' : 'colours';
}

// ---- wearing
export function wearItem(item, limits, now = Date.now()) {
  const limit = wearLimitOf(item, limits);
  const out = { ...item, lastWorn: now, timesWornTotal: (item.timesWornTotal || 0) + 1, updatedAt: now };
  if (!limit) return out; // shoes/accessories: never need washing, stay clean
  out.wearCount = (item.wearCount || 0) + 1;
  out.status = out.wearCount >= limit ? 'hamper' : 'worn';
  return out;
}
export const needsWash = (item, limits) => item.status === 'hamper' || (wearLimitOf(item, limits) > 0 && item.wearCount >= wearLimitOf(item, limits));

// ---- shopping gaps (product shape from products.js: cat, name, style, warmth, wp)
const nm = (p, re) => re.test((p.name || '').toLowerCase());
export const GAPS = {
  'waterproof-jacket': ['Waterproof jacket', p => p.cat === 'outerwear' && p.wp],
  'winter-coat': ['Winter coat', p => p.cat === 'outerwear' && p.warmth === 3 && !nm(p, /vest|overshirt|shacket|shirt jacket/)],
  'light-jacket': ['Light jacket', p => p.cat === 'outerwear' && p.warmth <= 2 && !nm(p, /blazer|vest/)],
  blazer: ['Blazer', p => nm(p, /blazer|suit jacket/)],
  'formal-top': ['Dress shirt', p => p.cat === 'top' && ['formal', 'business', 'smart'].includes(p.style) && !nm(p, /hoodie|sweatshirt|tee\b|t-shirt/)],
  'formal-bottom': ['Dress pants', p => p.cat === 'bottom' && ['formal', 'business', 'smart'].includes(p.style) && !nm(p, /jean|jogger|sweat|short/)],
  'formal-shoes': ['Formal shoes', p => p.cat === 'shoes' && (['formal', 'business'].includes(p.style) || nm(p, /loafer|oxford|derby|dress shoe|heel|brogue/))],
  shoes: ['Shoes', p => p.cat === 'shoes'],
  boots: ['Boots', p => p.cat === 'shoes' && nm(p, /boot/)],
  top: ['Top', p => p.cat === 'top'],
  bottom: ['Bottoms', p => p.cat === 'bottom'],
  sweater: ['Sweater or hoodie', p => p.cat === 'top' && nm(p, /sweater|hoodie|knit|cardigan|crew|fleece|pullover/)],
  dress: ['Dress', p => p.cat === 'dress'],
  activewear: ['Activewear', p => p.style === 'sport'],
  hat: ['Warm hat', p => p.cat === 'accessory' && nm(p, /hat|beanie|toque|cap/)],
  gloves: ['Gloves', p => p.cat === 'accessory' && nm(p, /glove|mitt/)],
  scarf: ['Scarf', p => p.cat === 'accessory' && nm(p, /scarf|scarves/)],
  socks: ['Socks', () => false], // catalog skips socks/underwear; Shop shows stores + second-hand instead
  underwear: ['Underwear', () => false],
};

// ---- outfit engine (rule-based, deterministic for a given seed)
const rank = f => FORMALITY.indexOf(f);
const isMid = i => i.category === 'tops' && ['sweater', 'hoodie'].includes(i.subtype);
const isActiveBottom = i => ['leggings', 'shorts', 'sweatpants'].includes(i.subtype);
const loud = i => (i.colours || []).some(c => !NEUTRALS.has(c.name));
function jitter(seed, id) { // stable pseudo-random 0..1 per (seed, item)
  let h = 2166136261 ^ seed;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
export const hourLabel = t => { const h = +t.slice(11, 13); return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`; };

// hours: [{time:'YYYY-MM-DDTHH:00', temp, feels, rain, code, wind}] for one day.
export function planOutfit({ items, hours, stops = [], seed = 0, choose = {}, limits = {}, now = Date.now() }) {
  const clean = items.filter(i => i.status === 'clean');
  const stopHours = stops.map(s => +s.time.slice(0, 2));
  const inWindow = h => stopHours.length ? stopHours.some(s => h === s || h === s + 1) : h >= 8 && h <= 20;
  let win = hours.filter(x => inWindow(+x.time.slice(11, 13)));
  if (!win.length) win = hours.length ? hours : [{ time: 'T12:00', feels: 12, temp: 12, rain: 0, code: 3 }];
  const atStops = stopHours.length ? win.filter(x => stopHours.includes(+x.time.slice(11, 13))) : win;
  const coldest = Math.min(...(atStops.length ? atStops : win).map(x => x.feels));
  const rainMax = Math.max(...win.map(x => x.rain ?? 0));
  const wet = rainMax >= 50;
  const band = coldest >= 22 ? 0 : coldest >= 15 ? 1 : coldest >= 5 ? 2 : coldest >= -5 ? 3 : 4;

  const types = stops.map(s => STOP_TYPES[s.type] || 'casual');
  const gym = types.includes('activewear'), activeOnly = gym && types.every(t => t === 'activewear');
  const need = Math.max(0, ...types.filter(t => t !== 'activewear').map(rank));

  const picks = [], missing = [], notes = [], bring = [], used = new Set();
  const score = (i, warmTarget) => -Math.abs((i.warmth || 3) - warmTarget) * 2
    - (i.lastWorn && now - i.lastWorn < 3 * 864e5 ? 3 : 0)
    - (loud(i) && picks.some(p => loud(p.item)) ? 4 : 0)
    - Math.max(0, rank(i.formality || 'casual') - need) * 0.8
    + jitter(seed, i.id) * 1.5;
  // strict filter first; if empty, relaxed filter (still wearable) + report the gap.
  function slot(name, gap, { strict, relaxed, warm = 3, optional = false }) {
    let pool = clean.filter(i => !used.has(i.id) && strict(i));
    if (!pool.length && relaxed) {
      pool = clean.filter(i => !used.has(i.id) && relaxed(i));
      if (!optional) missing.push(gap);
    } else if (!pool.length && !optional) { missing.push(gap); }
    if (!pool.length) return null;
    pool.sort((a, b) => score(b, warm) - score(a, warm) || String(a.id).localeCompare(String(b.id)));
    const item = pool[(choose[name] || 0) % pool.length];
    used.add(item.id); picks.push({ slot: name, item, optional, options: pool.length });
    return item;
  }
  const dressy = i => rank(i.formality || 'casual') >= need;

  slot('underwear', 'underwear', { strict: i => i.category === 'underwear' });
  slot('socks', 'socks', { strict: i => i.category === 'socks' });
  if (activeOnly) {
    slot('top', 'activewear', { strict: i => i.category === 'activewear' && !isActiveBottom(i),
      relaxed: i => ['t-shirt', 'tank top'].includes(i.subtype), warm: 1 });
    slot('bottom', 'activewear', { strict: i => i.category === 'activewear' && isActiveBottom(i),
      relaxed: i => ['shorts', 'sweatpants'].includes(i.subtype), warm: 1 });
  } else {
    const baseWarm = [1, 2, 2, 3, 3][band];
    const top = slot('top', need ? 'formal-top' : 'top', {
      strict: i => (i.category === 'tops' && !isMid(i) || i.subtype === 'dress') && dressy(i) && (band || (i.warmth || 1) <= 2),
      relaxed: i => i.category === 'tops' && !isMid(i) || i.subtype === 'dress', warm: baseWarm });
    if (top?.subtype !== 'dress') {
      slot('bottom', need ? 'formal-bottom' : 'bottom', {
        strict: i => (i.category === 'bottoms' || i.subtype === 'skirt') && dressy(i) && !(band >= 3 && i.subtype === 'shorts'),
        relaxed: i => i.category === 'bottoms' || i.subtype === 'skirt', warm: baseWarm });
    }
    if (need === 2) slot('blazer', 'blazer', { strict: i => i.category === 'formal', warm: 2 });
    if (band >= 1) {
      slot('mid', 'sweater', { strict: i => isMid(i) && dressy(i) && (band < 3 || (i.warmth || 3) >= 3),
        relaxed: band >= 2 ? isMid : null, warm: [2, 2, 3, 4, 4][band], optional: band === 1 });
    }
  }
  if (gym && !activeOnly) { notes.push('Change into activewear at the gym.'); bring.push('Gym bag'); }

  // Outer layer: weather gate, exempt from formality.
  if (wet || band >= 2) {
    const warmOk = i => band >= 4 ? (i.warmth || 0) >= 5 : band === 3 ? (i.warmth || 0) >= 4 : true;
    const outer = i => i.category === 'outerwear';
    const gap = wet ? 'waterproof-jacket' : band >= 3 ? 'winter-coat' : 'light-jacket';
    slot('outer', gap, { strict: i => outer(i) && warmOk(i) && (!wet || i.waterproof), relaxed: outer, warm: [2, 2, 2, 4, 5][band] });
  } else if (band === 1) {
    slot('outer', 'light-jacket', { strict: i => i.category === 'outerwear' && (i.warmth || 3) <= 3, warm: 2, optional: true });
  }
  if (activeOnly) slot('shoes', 'shoes', { strict: i => i.subtype === 'sneakers', relaxed: i => i.category === 'shoes', warm: 2 });
  else if (need === 2) slot('shoes', 'formal-shoes', { strict: i => i.category === 'shoes' && (i.subtype === 'dress shoes' || rank(i.formality) === 2), relaxed: i => i.category === 'shoes' });
  else if (wet || band >= 3) slot('shoes', 'boots', { strict: i => i.category === 'shoes' && (i.subtype === 'boots' || i.waterproof), relaxed: i => i.category === 'shoes' && i.subtype !== 'sandals', warm: 4 });
  else slot('shoes', 'shoes', { strict: i => i.category === 'shoes' && dressy(i) && !(band >= 2 && i.subtype === 'sandals'), relaxed: i => i.category === 'shoes', warm: 2 });
  if (band === 4) for (const s of ['hat', 'gloves', 'scarf']) slot(s, s, { strict: i => i.subtype === s });

  if (wet) bring.push('Umbrella');
  if (band === 3 && !picks.some(p => p.slot === 'gloves')) bring.push('Gloves, just in case');
  if (win.some(x => x.code <= 1) && band <= 1) bring.push('Sunglasses');
  if (Math.max(...win.map(x => x.feels)) >= 27) bring.push('Water bottle');

  // Layer changes: when does it warm up enough to drop the outer / mid layer?
  const tips = [];
  const startH = Math.min(...win.map(x => +x.time.slice(11, 13)));
  const later = hours.filter(x => +x.time.slice(11, 13) > startH && inWindow(+x.time.slice(11, 13)));
  for (const [s, t] of [['outer', 15], ['mid', 18]]) {
    const p = picks.find(x => x.slot === s);
    if (!p || (s === 'outer' && wet)) continue;
    const warm = later.find(x => x.feels >= t);
    if (warm) tips.push(`Take the ${p.item.subtype || 'layer'} off after ${hourLabel(warm.time)} (${Math.round(warm.feels)}°C).`);
  }
  return { picks, missing: [...new Set(missing)], notes, bring, tips, coldest, rainMax, band, need: FORMALITY[need], activeOnly };
}

// ---- "is this clothing?" gate: first CLIP pass before tagging
export const GATE_CLOTHING = ['a photo of a clothing item', 'a photo of shoes', 'a photo of an accessory like a hat, bag or belt'];
export const GATE_OTHER = ['a photo of a person’s face', 'a photo of food', 'a photo of a pet', 'a photo of furniture',
  'a photo of a phone or electronics', 'a photo of a room', 'a photo of text or a document', 'a photo of a car', 'a photo of a plant', 'a random object'];
// scores: [{label, score}] over GATE_CLOTHING + GATE_OTHER (softmax). Clothing must win AND total >= 0.5.
export function clothingVerdict(scores) {
  const top = scores.reduce((a, b) => b.score > a.score ? b : a);
  const confidence = scores.filter(s => GATE_CLOTHING.includes(s.label)).reduce((t, s) => t + s.score, 0);
  return { ok: GATE_CLOTHING.includes(top.label) && confidence >= 0.5, confidence, top: top.label };
}

// ---- small UI rules
// Swipe on an outfit tile: next/previous best clean option for that slot.
export function nextChoice(choose, slot, dir, options) {
  if (options < 2) return choose;
  return { ...choose, [slot]: (((choose[slot] || 0) + dir) % options + options) % options };
}
// Hearts: tap toggles membership; returns a new array.
export const toggleHeart = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
// Days in a row (ending today, or yesterday if today isn't worn yet) with an accepted outfit.
export function streak(outfits, today) {
  const worn = new Set(outfits.filter(o => o.accepted).map(o => o.date));
  const d = new Date(today + 'T12:00');
  if (!worn.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (worn.has(d.toLocaleDateString('en-CA'))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
