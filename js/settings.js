// Me tab: top card (name, city + temp, units) and four sub-pages: Style, Closet setup, Your data, Legal.
import * as db from './db.js';
import { DEFAULT_LIMITS, LIMIT_LABEL, DEFAULT_LOW_SUPPLY, PALETTE, FORMALITY, FORMALITY_LABEL, CATEGORIES, STATUSES, WASH_GROUPS, SEASONS } from './model.js';
import { geocode, getCity, getForecast, TORONTO } from './weather.js';
import { icon, esc, $, $$, opts, toast, cap, setUnits, temp, band, confirmSheet, locIcon, haptic, loader } from './ui.js';
import { getLocations } from './closet.js';

const VERSION = '2.0.0';
const LOC_TYPES = ['rail', 'drawer', 'shelf', 'rack', 'hook', 'bin'];
const LOC_NAME = { rail: 'Rail', drawer: 'Drawer', shelf: 'Shelf', rack: 'Shoe rack', hook: 'Hook', bin: 'Bin' };
const back = `<a href="#me" class="back">${icon('back', 20)} Me</a>`;
const sub = (title, text) => `<header class="band">${back}<h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</header>`;
const fold = (title, body, reset) => `<details class="fold"><summary>${title} ${icon('chevron-down', 20)}</summary>${body}
  <button class="linkbtn" data-reset="${reset}">Reset to defaults</button></details>`;

export async function renderMe(main, page) {
  if (page === 'style') return stylePage(main);
  if (page === 'closet') return closetPage(main);
  if (page === 'data') return dataPage(main);
  if (page === 'legal') return legalPage(main);
  if (page === 'city') return cityPage(main);
  const [name, city, units, wx] = await Promise.all([db.getSetting('name', ''), getCity(), db.getSetting('units', 'C'), getForecast()]);
  main.innerHTML = band('Me', 'Your settings') + `<div class="content">
    <div class="card me-top">
      <label class="field" style="margin:0">First name<input id="name" value="${esc(name)}" placeholder="For your morning greeting" autocomplete="given-name" maxlength="30"></label>
      <div class="between"><a class="row" href="#me/city" style="text-decoration:none;color:inherit;min-height:44px">${icon('map-pin', 20)}<span><b>${esc(city.name)}</b> <span class="sub">${wx?.current ? temp(wx.current.temp) : ''}</span></span></a>
        <div class="seg" role="group" aria-label="Units"><button data-units="C" aria-pressed="${units === 'C'}">°C</button><button data-units="F" aria-pressed="${units === 'F'}">°F</button></div></div>
    </div>
    <div class="list-rows" style="margin-top:16px" data-stagger>
      <a class="row-link" href="#me/style">${icon('palette')}<span>Style<small>Colours, fit, formality</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/closet">${icon('hanger')}<span>Closet setup<small>Where things live, wear limits</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/data">${icon('download')}<span>Your data<small>Export, import, erase</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/legal">${icon('file-text')}<span>Legal<small>Privacy, terms</small></span>${icon('chevron-right', 20)}</a>
    </div>
    <p class="foot" style="padding-bottom:0">ATTINERA ${VERSION} · © 2026 EJ Empires</p></div>`;
  main.onchange = async e => { if (e.target.id === 'name') { await db.setSetting('name', e.target.value.trim().slice(0, 30)); toast('Saved'); } };
  main.onclick = async e => {
    const b = e.target.closest('[data-units]'); if (!b) return;
    await db.setSetting('units', b.dataset.units); setUnits(b.dataset.units); haptic(); renderMe(main);
  };
}

async function cityPage(main) {
  const city = await getCity();
  main.innerHTML = sub('Weather location', `Now: ${esc(city.name)}`) + `<div class="content">
    <form id="citySearch" class="row"><label class="search" style="flex:1">${icon('search', 20)}<input name="q" type="search" placeholder="Search a city" aria-label="City" required></label><button class="btn primary">Search</button></form>
    <div id="cityResults" class="chips" style="margin-top:12px"></div>
    <div class="actions"><button class="btn ghost" id="useLoc">${icon('map-pin', 18)} Use my location</button>
      ${city.name !== TORONTO.name ? '<button class="btn ghost" id="toronto">Back to Toronto</button>' : ''}</div></div>`;
  const done = async c => { await db.setSetting('city', c); toast('City saved'); location.hash = '#me'; };
  main.onsubmit = async e => {
    e.preventDefault();
    const res = $('#cityResults'); res.innerHTML = loader('Searching');
    try {
      const r = await geocode(new FormData(e.target).get('q'));
      res.innerHTML = r.map((c, i) => `<button class="chip pop" style="--i:${i}" data-city="${i}">${esc(c.name)}</button>`).join('') || '<p class="sub">No matches.</p>';
      res.onclick = ev => { const b = ev.target.closest('[data-city]'); if (b) done(r[+b.dataset.city]); };
    } catch { res.innerHTML = '<p class="sub">City search needs a connection.</p>'; }
  };
  main.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'toronto') done(TORONTO);
    if (b.id === 'useLoc') {
      if (!navigator.geolocation) return toast('Location not available');
      navigator.geolocation.getCurrentPosition(p => done({ name: 'My location', lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2) }),
        () => toast('Location permission denied'), { timeout: 10000 });
    }
  };
}

const radios = (name, list, sel) => `<div class="chips">${list.map(([v, l]) => `<label class="chip"><input type="radio" name="${name}" value="${v}"${sel === v ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
async function stylePage(main) {
  const [style, gender] = await Promise.all([db.getSetting('style', { colours: [], fit: 'regular', formality: 'casual' }), db.getSetting('shopGender', 'all')]);
  main.innerHTML = sub('Style', 'Shapes outfit picks and Shop') + `<div class="content">
    <fieldset><legend>Favourite colours</legend><div class="chips">${Object.keys(PALETTE).map(c => `<label class="chip"><input type="checkbox" name="fav" value="${c}"${style.colours.includes(c) ? ' checked' : ''}><i class="sw" style="background:${PALETTE[c]}"></i>${cap(c)}</label>`).join('')}</div></fieldset>
    <fieldset><legend>Fit</legend>${radios('fit', [['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed']], style.fit)}</fieldset>
    <fieldset><legend>Usual formality</legend>${radios('formality', FORMALITY.map(f => [f, FORMALITY_LABEL[f]]), style.formality)}</fieldset>
    <fieldset><legend>Shop for</legend>${radios('shopGender', [['all', 'Everyone'], ['m', 'Men'], ['w', 'Women']], gender)}</fieldset></div>`;
  main.onchange = async e => {
    if (e.target.name === 'shopGender') await db.setSetting('shopGender', e.target.value);
    else await db.setSetting('style', { colours: $$('input[name=fav]:checked', main).map(x => x.value), fit: $('input[name=fit]:checked', main)?.value || 'regular', formality: $('input[name=formality]:checked', main)?.value || 'casual' });
    haptic(); toast('Saved');
  };
}

async function closetPage(main) {
  const [limits, low, locs] = await Promise.all([db.getSetting('limits', {}), db.getSetting('lowSupply', DEFAULT_LOW_SUPPLY), getLocations()]);
  main.innerHTML = sub('Closet setup') + `<div class="content"><div class="card" style="padding-top:0;padding-bottom:0">
    ${fold('Where things live', `${locs.map(l => `<div class="row" style="margin-bottom:12px;flex-wrap:nowrap"><span class="home">${locIcon(l.type)}</span>
        <input data-locname="${esc(l.id)}" value="${esc(l.name)}" aria-label="Location name" style="flex:1;min-width:0">
        <select data-loctype="${esc(l.id)}" aria-label="Icon for ${esc(l.name)}" style="width:112px">${opts(LOC_TYPES.map(t => [t, LOC_NAME[t]]), l.type)}</select>
        <button class="icon-btn bare" data-locdel="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">${icon('trash', 18)}</button></div>`).join('')}
      <button class="btn ghost sm" id="addLoc">${icon('plus', 18)} Add a spot</button>`, 'locs')}
    ${fold('Wears before washing', `<div class="numgrid">${Object.keys(DEFAULT_LIMITS).map(k => `<label>${LIMIT_LABEL[k]}<input type="number" min="1" max="99" inputmode="numeric" data-limit="${k}" value="${esc(limits[k] || DEFAULT_LIMITS[k])}"></label>`).join('')}</div>
      <p class="sub small" style="margin-top:8px">Shoes and accessories never need washing.</p>`, 'limits')}
    ${fold('Low-supply alerts', `<div class="numgrid">${Object.keys(DEFAULT_LOW_SUPPLY).map(k => `<label>Warn below this many clean ${k}<input type="number" min="0" max="30" data-low="${k}" value="${esc(low[k] ?? DEFAULT_LOW_SUPPLY[k])}"></label>`).join('')}</div>`, 'low')}
    </div></div>`;
  // Keep the open section open across re-renders.
  $$('details.fold', main).forEach((d, i) => { d.open = closetPage.open === i; d.ontoggle = () => { if (d.open) closetPage.open = i; }; });
  const again = () => closetPage(main);
  main.onchange = async e => {
    const t = e.target, d = t.dataset;
    if (d.limit) { const l = await db.getSetting('limits', {}); l[d.limit] = Math.max(1, +t.value || DEFAULT_LIMITS[d.limit]); await db.setSetting('limits', l); toast('Saved'); }
    else if (d.low) { const l = await db.getSetting('lowSupply', DEFAULT_LOW_SUPPLY); l[d.low] = Math.max(0, +t.value || 0); await db.setSetting('lowSupply', l); toast('Saved'); }
    else if (d.locname || d.loctype) { const l = locs.find(x => x.id === (d.locname || d.loctype)); l[d.locname ? 'name' : 'type'] = t.value.trim() || l.name; await db.put('locations', l); toast('Saved'); if (d.loctype) again(); }
  };
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addLoc') { await db.put('locations', { id: db.uid(), name: 'New spot', type: 'shelf', order: locs.length }); return again(); }
    if (b.dataset.locdel) {
      if (!await confirmSheet('Delete this spot?', 'Items stored there keep their details.', 'Delete')) return;
      await db.del('locations', b.dataset.locdel); return again();
    }
    const r = b.dataset.reset; if (!r) return;
    if (r === 'limits') await db.setSetting('limits', {});
    if (r === 'low') await db.setSetting('lowSupply', DEFAULT_LOW_SUPPLY);
    if (r === 'locs') {
      if (!await confirmSheet('Reset storage spots?', 'Your spots go back to the six defaults.', 'Reset')) return;
      await db.clear('locations'); await db.putMany('locations', db.DEFAULT_LOCATIONS);
    }
    toast('Reset to defaults'); again();
  };
}

function dataPage(main) {
  main.innerHTML = sub('Your data', 'Stored only on this device') + `<div class="content">
    <div class="card"><b>Export</b><p class="sub">One file with every item and photo. Do this before switching phones.</p>
      <div class="actions"><button class="btn primary" id="export">${icon('download', 20)} Export</button></div></div>
    <div class="card"><b>Import</b><p class="sub">Replace everything here with a backup file.</p>
      <div class="actions"><label class="btn ghost">${icon('upload', 20)} Import<input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <div class="card alert" style="display:block"><b>Erase all</b><p class="sub">Deletes your closet, outfits and settings from this device.</p>
      <div class="actions"><button class="btn coral" id="erase">${icon('trash', 20)} Erase all</button></div></div></div>`;
  main.onchange = async e => {
    const t = e.target;
    if (t.id !== 'import' || !t.files[0]) return;
    const f = t.files[0]; t.value = '';
    if (!await confirmSheet('Replace your closet?', 'Everything here gets swapped for the backup.', 'Import')) return;
    try { await importData(f); toast('Import complete'); } catch (err) { console.error(err); toast('That file could not be imported'); }
  };
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'export') exportData();
    if (b.id === 'erase') {
      if (!await confirmSheet('Erase everything?', 'This cannot be undone. Export first if you might want it back.', 'Erase all')) return;
      await eraseAll(); toast('All data erased'); location.hash = '#today';
    }
  };
}

function legalPage(main) {
  main.innerHTML = sub('Legal', 'Drafts, not reviewed by a lawyer') + `<div class="content"><div class="list-rows">
    <a class="row-link" href="privacy.html">${icon('file-text')}<span>Privacy Policy<small>Draft</small></span>${icon('chevron-right', 20)}</a>
    <a class="row-link" href="terms.html">${icon('file-text')}<span>Terms of Use<small>Draft</small></span>${icon('chevron-right', 20)}</a></div>
    <p class="sub small" style="margin-top:16px">Photo tagging and background removal run on this device. Your photos are never uploaded.</p></div>`;
}

// ---- export / import / erase (photos as base64 data URLs inside one JSON file)
const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
// Only inline image data URLs: never fetch a URL taken from an imported file.
const fromDataUrl = async s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? (await fetch(s)).blob() : null;

async function exportData() {
  const [items, locations, outfits, settings] = await Promise.all(['items', 'locations', 'outfits', 'settings'].map(db.all));
  const data = {
    app: 'ATTINERA', version: 2, exportedAt: new Date().toISOString(), locations, outfits,
    settings: settings.filter(s => !s.key.startsWith('wx:')),
    items: await Promise.all(items.map(async i => ({ ...i, photo: i.photo && await toDataUrl(i.photo), thumb: i.thumb && await toDataUrl(i.thumb), original: i.original && await toDataUrl(i.original) }))),
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
    photo: isImg(i.photo), thumb: isImg(i.thumb), original: isImg(i.original), cleaned: pick(i.cleaned, ['cutout', 'basic'], undefined),
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
  const items = await Promise.all(data.items.map(async i => clean({ ...i, photo: await fromDataUrl(i.photo), thumb: await fromDataUrl(i.thumb), original: await fromDataUrl(i.original) })));
  const locs = (Array.isArray(data.locations) ? data.locations : []).filter(l => l && typeof l === 'object')
    .map((l, n) => ({ id: str(l.id, 64) || db.uid(), name: str(l.name, 40) || 'Spot', type: pick(l.type, LOC_TYPES, 'shelf'), order: num(l.order, 0, 999, n) }));
  for (const s of ['items', 'locations', 'outfits']) await db.clear(s);
  await db.putMany('items', items);
  await db.putMany('locations', locs.length ? locs : db.DEFAULT_LOCATIONS);
  await db.putMany('outfits', Array.isArray(data.outfits) ? data.outfits : []);
  await db.putMany('settings', (Array.isArray(data.settings) ? data.settings : []).filter(s => typeof s?.key === 'string'));
  setUnits(await db.getSetting('units', 'C'));
}
async function eraseAll() {
  for (const s of ['items', 'locations', 'outfits', 'settings']) await db.clear(s);
  await db.putMany('locations', db.DEFAULT_LOCATIONS);
  await db.setSetting('migratedV1', true); // don't re-import the old prototype's data after an erase
  await db.setSetting('onboarded', true);
  setUnits('C');
}
