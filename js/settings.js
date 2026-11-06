// Me tab: city, units, style, wear limits, storage locations, low-supply thresholds, export/import/erase.
import * as db from './db.js';
import { DEFAULT_LIMITS, LIMIT_LABEL, DEFAULT_LOW_SUPPLY, PALETTE, FORMALITY, FORMALITY_LABEL, CATEGORIES, STATUSES, WASH_GROUPS, SEASONS } from './model.js';
import { geocode, getCity, TORONTO } from './weather.js';
import { icon, esc, $, opts, toast, confirmTap, cap, setUnits } from './ui.js';
import { getLocations } from './closet.js';

const LOC_TYPES = ['rail', 'drawer', 'shelf', 'rack', 'hook', 'bin'];

export async function renderMe(main) {
  const [city, units, limits, low, locs, style, gender] = await Promise.all([
    getCity(), db.getSetting('units', 'C'), db.getSetting('limits', {}), db.getSetting('lowSupply', DEFAULT_LOW_SUPPLY),
    getLocations(), db.getSetting('style', { colours: [], fit: 'regular', formality: 'casual' }), db.getSetting('shopGender', 'all')]);
  main.innerHTML = `<h1 class="h1">Me</h1>
    <section class="card"><h2 class="h3">Weather location</h2>
      <p>Now: <b>${esc(city.name)}</b></p>
      <form id="citySearch" class="row"><input name="q" type="search" placeholder="Search a city" aria-label="City" required><button class="btn primary sm">Search</button></form>
      <div id="cityResults" class="list"></div>
      <div class="actions"><button class="btn ghost sm" id="useLoc">${icon('pin', 18)} Use my location</button>
        ${city.name !== TORONTO.name ? '<button class="btn ghost sm" id="toronto">Back to Toronto</button>' : ''}</div>
      <label class="field inline">Units<select id="units">${opts([['C', '°C'], ['F', '°F']], units)}</select></label></section>

    <section class="card"><h2 class="h3">Style preferences</h2>
      <fieldset><legend>Favourite colours</legend><div class="chips">${Object.keys(PALETTE).map(c => `<label class="chip"><input type="checkbox" name="fav" value="${c}"${style.colours.includes(c) ? ' checked' : ''}><i class="sw" style="background:${PALETTE[c]}"></i>${cap(c)}</label>`).join('')}</div></fieldset>
      <label class="field inline">Fit<select id="fit">${opts([['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed']], style.fit)}</select></label>
      <label class="field inline">Usual formality<select id="formality">${opts(FORMALITY.map(f => [f, FORMALITY_LABEL[f]]), style.formality)}</select></label>
      <label class="field inline">Shop for<select id="shopGender">${opts([['all', 'Everyone'], ['m', 'Men'], ['w', 'Women']], gender)}</select></label></section>

    <section class="card"><h2 class="h3">Wears before washing</h2>
      <div class="numgrid">${Object.keys(DEFAULT_LIMITS).map(k => `<label>${LIMIT_LABEL[k]}<input type="number" min="1" max="99" inputmode="numeric" data-limit="${k}" value="${esc(limits[k] || DEFAULT_LIMITS[k])}"></label>`).join('')}</div>
      <p class="muted small">Shoes and accessories never need washing.</p></section>

    <section class="card"><h2 class="h3">Low-supply warnings</h2>
      <div class="numgrid">${Object.keys(DEFAULT_LOW_SUPPLY).map(k => `<label>Warn when clean ${k} below<input type="number" min="0" max="30" data-low="${k}" value="${esc(low[k] ?? DEFAULT_LOW_SUPPLY[k])}"></label>`).join('')}</div></section>

    <section class="card"><h2 class="h3">Where things live</h2>
      <div class="list">${locs.map(l => `<div class="row loc"><input data-locname="${esc(l.id)}" value="${esc(l.name)}" aria-label="Location name">
        <select data-loctype="${esc(l.id)}" aria-label="Type">${opts(LOC_TYPES.map(t => [t, cap(t)]), l.type)}</select>
        <button class="icon-btn" data-locdel="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">${icon('trash', 18)}</button></div>`).join('')}</div>
      <button class="btn ghost sm" id="addLoc">${icon('plus', 18)} Add location</button></section>

    <section class="card"><h2 class="h3">Your data</h2>
      <p class="muted small">Everything lives only in this browser. Export a backup before switching phones or clearing your browser.</p>
      <div class="actions"><button class="btn primary sm" id="export">Export</button>
        <label class="btn ghost sm">Import<input type="file" id="import" accept="application/json,.json" hidden></label>
        <button class="btn ghost sm" id="erase">Erase all data</button></div></section>

    <p class="links"><a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms</a></p>`;

  const saveStyle = () => db.setSetting('style', {
    colours: [...main.querySelectorAll('input[name=fav]:checked')].map(x => x.value), fit: $('#fit').value, formality: $('#formality').value });
  main.onchange = async e => {
    const t = e.target, d = t.dataset;
    if (t.id === 'units') { await db.setSetting('units', t.value); setUnits(t.value); toast('Units saved'); }
    else if (t.name === 'fav' || t.id === 'fit' || t.id === 'formality') { await saveStyle(); toast('Saved'); }
    else if (t.id === 'shopGender') { await db.setSetting('shopGender', t.value); toast('Saved'); }
    else if (d.limit) { const l = await db.getSetting('limits', {}); l[d.limit] = Math.max(1, +t.value || DEFAULT_LIMITS[d.limit]); await db.setSetting('limits', l); toast('Wear limit saved'); }
    else if (d.low) { const l = await db.getSetting('lowSupply', DEFAULT_LOW_SUPPLY); l[d.low] = Math.max(0, +t.value || 0); await db.setSetting('lowSupply', l); toast('Saved'); }
    else if (d.locname || d.loctype) { const l = locs.find(x => x.id === (d.locname || d.loctype)); l[d.locname ? 'name' : 'type'] = t.value.trim() || l.name; await db.put('locations', l); toast('Location saved'); }
    else if (t.id === 'import' && t.files[0]) { try { await importData(t.files[0]); toast('Import complete'); renderMe(main); } catch (err) { console.error(err); toast('That file could not be imported'); } }
  };
  main.onsubmit = async e => {
    e.preventDefault();
    const res = $('#cityResults');
    res.textContent = 'Searching…';
    try {
      const r = await geocode(new FormData(e.target).get('q'));
      res.innerHTML = r.map((c, i) => `<button class="btn ghost sm" data-city="${i}">${esc(c.name)}</button>`).join('') || '<p class="muted">No matches.</p>';
      res.onclick = async ev => { const b = ev.target.closest('[data-city]'); if (b) { await db.setSetting('city', r[+b.dataset.city]); toast('City saved'); renderMe(main); } };
    } catch { res.textContent = 'City search needs a connection.'; }
  };
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'useLoc') {
      if (!navigator.geolocation) return toast('Location not available');
      navigator.geolocation.getCurrentPosition(async p => {
        await db.setSetting('city', { name: 'My location', lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) });
        toast('Using your location'); renderMe(main);
      }, () => toast('Location permission denied'), { timeout: 10000 });
    } else if (b.id === 'toronto') { await db.setSetting('city', TORONTO); renderMe(main); }
    else if (b.id === 'addLoc') { await db.put('locations', { id: db.uid(), name: 'New spot', type: 'shelf', order: locs.length }); renderMe(main); }
    else if (b.dataset.locdel) { if (!confirmTap(b, 'Delete?')) return; await db.del('locations', b.dataset.locdel); renderMe(main); }
    else if (b.id === 'export') exportData();
    else if (b.id === 'erase') {
      if (!confirmTap(b, 'Tap again to erase everything')) return;
      await eraseAll(); toast('All data erased'); renderMe(main);
    }
  };
}

// ---- export / import / erase (photos as base64 data URLs inside one JSON file)
const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
const fromDataUrl = async s => s ? (await fetch(s)).blob() : null;

async function exportData() {
  const [items, locations, outfits, settings] = await Promise.all(['items', 'locations', 'outfits', 'settings'].map(db.all));
  const data = {
    app: 'ATTINERA', version: 1, exportedAt: new Date().toISOString(), locations, outfits,
    settings: settings.filter(s => !s.key.startsWith('wx:')),
    items: await Promise.all(items.map(async i => ({ ...i, photo: i.photo && await toDataUrl(i.photo), thumb: i.thumb && await toDataUrl(i.thumb) }))),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `attinera-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Exported ${items.length} items`);
}
// Backup files can come from anywhere: coerce every field to its expected type before it reaches the UI.
const num = (v, lo, hi, d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.trunc(+v))) : d;
const pick = (v, list, d) => list.includes(v) ? v : d;
const str = (v, max = 200) => typeof v === 'string' ? v.slice(0, max) : '';
const isImg = b => b instanceof Blob && /^image\//.test(b.type) ? b : null;
function clean(i) {
  return {
    id: str(i.id, 64) || db.uid(), createdAt: num(i.createdAt, 0, 9e15, Date.now()), updatedAt: num(i.updatedAt, 0, 9e15, Date.now()),
    photo: isImg(i.photo), thumb: isImg(i.thumb),
    category: pick(i.category, CATEGORIES, 'tops'), subtype: str(i.subtype, 40), gender: pick(i.gender, ['mens', 'womens', 'unisex'], 'unisex'),
    formality: pick(i.formality, FORMALITY, 'casual'),
    colours: (Array.isArray(i.colours) ? i.colours : []).slice(0, 3).filter(c => PALETTE[c?.name]).map(c => ({ name: c.name, hex: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : PALETTE[c.name] })),
    warmth: num(i.warmth, 1, 5, 3), seasons: (Array.isArray(i.seasons) ? i.seasons : []).filter(x => SEASONS.includes(x)),
    waterproof: i.waterproof === true, status: pick(i.status, STATUSES, 'clean'), wearCount: num(i.wearCount, 0, 999, 0),
    wearLimit: i.wearLimit == null ? null : num(i.wearLimit, 1, 99, null), homeLocationId: str(i.homeLocationId, 64),
    washGroup: pick(i.washGroup, Object.keys(WASH_GROUPS), 'colours'), lastWorn: i.lastWorn == null ? null : num(i.lastWorn, 0, 9e15, null),
    timesWornTotal: num(i.timesWornTotal, 0, 99999, 0), notes: str(i.notes, 2000),
  };
}
async function importData(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'ATTINERA' || !Array.isArray(data.items)) throw new Error('Not an ATTINERA backup');
  const items = await Promise.all(data.items.map(async i => clean({ ...i, photo: await fromDataUrl(i.photo), thumb: await fromDataUrl(i.thumb) })));
  for (const s of ['items', 'locations', 'outfits']) await db.clear(s);
  await db.putMany('items', items);
  await db.putMany('locations', data.locations?.length ? data.locations : db.DEFAULT_LOCATIONS);
  await db.putMany('outfits', data.outfits || []);
  await db.putMany('settings', (data.settings || []).filter(s => s?.key));
  setUnits(await db.getSetting('units', 'C'));
}
async function eraseAll() {
  for (const s of ['items', 'locations', 'outfits', 'settings']) await db.clear(s);
  await db.putMany('locations', db.DEFAULT_LOCATIONS);
  await db.setSetting('migratedV1', true); // don't re-import the old prototype's data after an erase
  setUnits('C');
}
