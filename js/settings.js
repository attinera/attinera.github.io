// Me tab: account card (sign in / sync status), name, city + units, and sub-pages:
// Style, Closet setup, Your data, Legal, Weather location, Account (sign in, create, magic link, reset).
import * as db from './db.js';
import { DEFAULT_LIMITS, LIMIT_LABEL, DEFAULT_LOW_SUPPLY, PALETTE, FORMALITY, FORMALITY_LABEL, CATEGORIES, STATUSES, WASH_GROUPS, SEASONS } from './model.js';
import { geocode, getCity, getForecast, TORONTO } from './weather.js';
import { icon, esc, $, $$, opts, toast, cap, setUnits, temp, header, confirmSheet, locIcon, haptic, loader, sheet, closeSheet } from './ui.js';
import { getLocations, deleteItems } from './closet.js';
import * as sync from './sync.js';

const VERSION = '3.0.3';
const LOC_TYPES = ['rail', 'drawer', 'shelf', 'rack', 'hook', 'bin'];
const LOC_NAME = { rail: 'Rail', drawer: 'Drawer', shelf: 'Shelf', rack: 'Shoe rack', hook: 'Hook', bin: 'Bin' };
const sub = (title, text) => header(title, { back: ['#me', 'Me'], sub: text });
const fold = (title, body, reset) => `<details class="fold"><summary>${title} ${icon('chevron-down', 20)}</summary>${body}
  <button class="linkbtn" data-reset="${reset}">Reset to defaults</button></details>`;

export async function renderMe(main, page, params = new URLSearchParams()) {
  if (page === 'style') return stylePage(main);
  if (page === 'closet') return closetPage(main);
  if (page === 'data') return dataPage(main);
  if (page === 'legal') return legalPage(main);
  if (page === 'city') return cityPage(main);
  if (page === 'account') return accountPage(main, params.get('mode') || 'signin');
  const [name, city, units, wx] = await Promise.all([db.getSetting('name', ''), getCity(), db.getSetting('units', 'C'), getForecast()]);
  main.innerHTML = header('Me') + `<div class="content">
    ${accountCard()}
    <div class="card me-top">
      <label class="field" style="margin-top:0">First name<input id="name" value="${esc(name)}" placeholder="For your morning greeting" autocomplete="given-name" maxlength="30"></label>
      <div class="between"><a class="row nowrap city-link" href="#me/city">${icon('map-pin', 20)}<span><b>${esc(city.name)}</b> <span class="sub">${wx?.current ? temp(wx.current.temp) : ''}</span></span></a>
        <div class="seg" role="group" aria-label="Units"><button data-units="C" aria-pressed="${units === 'C'}">°C</button><button data-units="F" aria-pressed="${units === 'F'}">°F</button></div></div>
    </div>
    <h2 class="h2">Settings</h2>
    <div class="list-rows" data-stagger>
      <a class="row-link" href="#me/style">${icon('palette')}<span>Style<small>Shop for, colours, fit, formality</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/closet">${icon('hanger')}<span>Closet setup<small>Where things live, wear limits</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/data">${icon('download')}<span>Your data<small>Export, import, delete</small></span>${icon('chevron-right', 20)}</a>
      <a class="row-link" href="#me/legal">${icon('file-text')}<span>Legal<small>Privacy, terms</small></span>${icon('chevron-right', 20)}</a>
    </div>
    <p class="sub small center" style="margin-top:24px">Attinera ${VERSION}</p></div>`;
  const onSync = () => { const s = $('#syncState', main); if (s) s.textContent = sync.statusText(); };
  removeEventListener('attinera:sync', renderMe._s || (() => {})); renderMe._s = onSync; addEventListener('attinera:sync', onSync);
  main.onchange = async e => { if (e.target.id === 'name') { await db.setSetting('name', e.target.value.trim().slice(0, 30)); toast('Saved'); } };
  main.onclick = async e => {
    if (e.target.closest('#signOut')) {
      if (!await confirmSheet('Sign out?', 'Your closet stays in your account. This device goes back to an empty guest closet.', 'Sign out', { danger: false })) return;
      await sync.signOut(); toast('Signed out'); return renderMe(main);
    }
    const b = e.target.closest('[data-units]'); if (!b) return;
    await db.setSetting('units', b.dataset.units); setUnits(b.dataset.units); haptic(); renderMe(main);
  };
}

function accountCard() {
  const u = sync.getUser();
  if (u) return `<div class="card account">
    <span class="avatar" aria-hidden="true">${esc((u.email || '?')[0].toUpperCase())}</span>
    <div class="acc-text"><b>${esc(u.email)}</b><small id="syncState">${esc(sync.statusText())}</small></div>
    <button class="icon-btn" id="signOut" aria-label="Sign out">${icon('logout', 22)}</button></div>`;
  return `<div class="card account">
    <span class="avatar guest" aria-hidden="true">${icon('user', 22)}</span>
    <div class="acc-text"><b>Guest</b><small>Your closet is stored on this device only</small></div>
    ${sync.accountsOn ? '<a class="btn primary sm" href="#me/account">Sign in</a>' : ''}</div>
    ${sync.accountsOn ? '<p class="sub small">Sign in to sync your closet between your phone and laptop. Free.</p>' : ''}`;
}

// ---- account screens: signin | signup | magic | reset
async function accountPage(main, mode) {
  const u = sync.getUser();
  if (u) { location.hash = '#me'; return; }
  const T = { signin: 'Sign in', signup: 'Create account', magic: 'Email me a login link', reset: 'Reset password' };
  const off = !sync.accountsOn;
  const pw = mode === 'signin' || mode === 'signup';
  main.innerHTML = sub(T[mode] || 'Sign in') + `<div class="content narrow">
    <div class="center" style="margin:8px 0 16px"><img src="assets/attinera-logo-v2-lockup.svg" alt="Attinera" class="lockup"></div>
    ${off ? '<div class="card note">Accounts aren’t switched on for this site yet. Attinera works fully as a guest, stored on this device.</div>' : ''}
    ${mode === 'signin' || mode === 'signup' ? `<div class="seg wide" role="tablist"><a href="#me/account?mode=signin" role="tab" aria-selected="${mode === 'signin'}" class="${mode === 'signin' ? 'on' : ''}">Sign in</a><a href="#me/account?mode=signup" role="tab" aria-selected="${mode === 'signup'}" class="${mode === 'signup' ? 'on' : ''}">Create account</a></div>` : ''}
    <form id="authForm" class="stack" novalidate>
      <label class="field">Email<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
      ${pw ? `<label class="field">Password<input type="password" name="pw" required minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="${mode === 'signup' ? 'At least 8 characters' : ''}"></label>` : ''}
      <p class="form-msg" id="authMsg" role="alert" hidden></p>
      <button class="btn primary big wide" ${off ? 'disabled' : ''}>${mode === 'magic' ? `${icon('mail', 20)} Send login link` : mode === 'reset' ? 'Send reset link' : T[mode]}</button>
    </form>
    <div class="list-rows" style="margin-top:16px">
      ${mode !== 'magic' ? `<a class="row-link" href="#me/account?mode=magic">${icon('mail')}<span>Email me a login link<small>No password needed</small></span>${icon('chevron-right', 20)}</a>` : `<a class="row-link" href="#me/account?mode=signin">${icon('lock')}<span>Use a password instead</span>${icon('chevron-right', 20)}</a>`}
      ${mode !== 'reset' ? `<a class="row-link" href="#me/account?mode=reset">${icon('refresh')}<span>Forgot password?</span>${icon('chevron-right', 20)}</a>` : ''}
    </div>
    <p class="sub small" style="margin-top:16px">With an account, your clothes and photos are stored in your private Attinera account so they sync between devices. Background removal still runs on your device. <a href="privacy.html">Privacy</a></p></div>`;
  main.onsubmit = async e => {
    e.preventDefault();
    if (off) return;
    const f = new FormData(e.target), email = String(f.get('email') || '').trim(), pass = String(f.get('pw') || '');
    const msg = (t, ok = false) => { const m = $('#authMsg', main); m.hidden = false; m.textContent = t; m.classList.toggle('ok', ok); };
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Enter a valid email address.');
    if (pw && pass.length < 8) return msg('Passwords are at least 8 characters.');
    const btn = $('button.primary', e.target); btn.disabled = true;
    try {
      const r = mode === 'signin' ? await sync.signIn(email, pass) : mode === 'signup' ? await sync.signUp(email, pass)
        : mode === 'magic' ? await sync.magicLink(email) : await sync.resetPassword(email);
      if (r.error) return msg(r.error.message);
      if (mode === 'signin' || (mode === 'signup' && r.data?.session)) { toast('Signed in'); location.hash = '#me'; return; }
      msg(mode === 'signup' ? 'Check your email to confirm your account, then sign in.' : mode === 'magic' ? 'Check your email for a login link.' : 'Check your email for a link to set a new password.', true);
    } catch (err) { msg('Could not reach the account service. Check your connection.'); console.warn(err); }
    finally { btn.disabled = false; }
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
      await db.delMany('locations', locs.map(l => l.id)); await db.putMany('locations', db.DEFAULT_LOCATIONS);
    }
    toast('Reset to defaults'); again();
  };
}


async function dataPage(main) {
  const u = sync.getUser(), n = (await db.all('items')).length;
  main.innerHTML = sub('Your data', u ? 'Synced to your account' : 'Stored only on this device') + `<div class="content">
    <div class="card"><b>Export</b><p class="sub">One file with every item and photo. Keep it as a backup.</p>
      <div class="actions"><button class="btn primary" id="export">${icon('download', 20)} Export</button></div></div>
    <div class="card"><b>Import</b><p class="sub">Replace your closet with a backup file.</p>
      <div class="actions"><label class="btn ghost">${icon('upload', 20)} Import<input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <h2 class="h2">Delete</h2>
    <div class="card danger-card"><b>Delete all clothes</b><p class="sub">Removes all ${n} item${n === 1 ? '' : 's'} and their photos. Settings and locations stay. You can undo right after.</p>
      <div class="actions"><button class="btn danger" id="delClothes"${n ? '' : ' disabled'}>${icon('trash', 20)} Delete all clothes</button></div></div>
    ${u ? `<div class="card danger-card"><b>Delete my account</b><p class="sub">Deletes your account, every synced item and photo, then signs you out. This cannot be undone.</p>
      <div class="actions"><button class="btn danger" id="delAccount">${icon('trash', 20)} Delete my account</button></div></div>`
      : `<div class="card danger-card"><b>Erase everything</b><p class="sub">Deletes your closet, outfits and settings from this device.</p>
      <div class="actions"><button class="btn danger" id="erase">${icon('trash', 20)} Erase everything</button></div></div>`}</div>`;
  main.onchange = async e => {
    const t = e.target;
    if (t.id !== 'import' || !t.files[0]) return;
    const f = t.files[0]; t.value = '';
    if (!await confirmSheet('Replace your closet?', 'Everything here gets swapped for the backup.', 'Import', { danger: false })) return;
    try { await importData(f); toast('Import complete'); } catch (err) { console.error(err); toast('That file could not be imported'); }
  };
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'export') exportData();
    if (b.id === 'delClothes') {
      const list = await db.all('items');
      if (list.length <= 5 && !await confirmSheet('Delete all clothes?', 'Every item and photo goes. You can undo right after.', 'Delete all clothes')) return;
      await deleteItems(list, () => dataPage(main));
    }
    if (b.id === 'erase') {
      if (!await confirmSheet('Erase everything?', 'This cannot be undone. Export first if you might want it back.', 'Erase everything')) return;
      await eraseAll(); toast('All data erased'); location.hash = '#today';
    }
    if (b.id === 'delAccount') {
      if (!await confirmSheet('Delete your account?', 'Every synced item, photo and setting is deleted from Attinera’s servers and this device. This cannot be undone.', 'Delete my account')) return;
      b.disabled = true;
      try { await sync.deleteAccount(); toast('Account deleted'); location.hash = '#today'; }
      catch (err) { console.error(err); b.disabled = false; toast('Could not delete the account. Check your connection and try again.'); }
    }
  };
}

function legalPage(main) {
  main.innerHTML = sub('Legal', 'Drafts, not reviewed by a lawyer') + `<div class="content"><div class="list-rows">
    <a class="row-link" href="privacy.html">${icon('file-text')}<span>Privacy Policy<small>Draft</small></span>${icon('chevron-right', 20)}</a>
    <a class="row-link" href="terms.html">${icon('file-text')}<span>Terms of Use<small>Draft</small></span>${icon('chevron-right', 20)}</a></div>
    <p class="sub small" style="margin-top:16px">Photo tagging and background removal run on this device. Without an account nothing leaves it; with one, your closet and photos sync to your private account.</p></div>`;
}

// ---- export / import / erase (photos as base64 data URLs inside one JSON file)
const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
// Only inline image data URLs: never fetch a URL taken from an imported file.
const fromDataUrl = async s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) ? (await fetch(s)).blob() : null;
const PHOTO_FIELDS = ['original', 'cutout', 'thumb', 'photo'];

async function exportData() {
  const [items, locations, outfits, settings] = await Promise.all(['items', 'locations', 'outfits', 'settings'].map(db.all));
  const data = {
    app: 'Attinera', version: 3, exportedAt: new Date().toISOString(), locations, outfits,
    settings: settings.filter(s => !db.LOCAL_KEYS.test(s.key)),
    items: await Promise.all(items.map(async i => {
      const o = { ...i };
      for (const f of PHOTO_FIELDS) if (i[f]) o[f] = await toDataUrl(i[f]);
      for (const k of ['_syncedMs', '_uploadedRev', '_needPhotos']) delete o[k];
      return o;
    })),
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
    id: str(i.id, 64) || db.uid(), createdAt: num(i.createdAt, 0, 9e15, Date.now()),
    original: isImg(i.original) || isImg(i.photo), cutout: isImg(i.cutout), thumb: isImg(i.thumb),
    pick: pick(i.pick, ['cutout', 'original'], undefined), pipeline: i.pipeline === 2 ? 2 : undefined, photoRev: Date.now(),
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
  if (String(data.app).toLowerCase() !== 'attinera' || !Array.isArray(data.items)) throw new Error('Not an Attinera backup');
  const items = await Promise.all(data.items.map(async i => {
    const o = { ...i };
    for (const f of PHOTO_FIELDS) o[f] = await fromDataUrl(i[f]);
    return clean(o);
  }));
  const locs = (Array.isArray(data.locations) ? data.locations : []).filter(l => l && typeof l === 'object')
    .map((l, n) => ({ id: str(l.id, 64) || db.uid(), name: str(l.name, 40) || 'Spot', type: pick(l.type, LOC_TYPES, 'shelf'), order: num(l.order, 0, 999, n) }));
  // Replace = soft-delete what's here (so the deletes sync), then write the backup.
  for (const s of ['items', 'locations', 'outfits']) await db.delMany(s, (await db.all(s)).map(x => x.id));
  await db.putMany('items', items);
  await db.putMany('locations', locs.length ? locs : db.DEFAULT_LOCATIONS);
  await db.putMany('outfits', (Array.isArray(data.outfits) ? data.outfits : []).filter(o => o && typeof o.id === 'string'));
  for (const s of (Array.isArray(data.settings) ? data.settings : []).filter(s => typeof s?.key === 'string' && !db.LOCAL_KEYS.test(s.key))) await db.setSetting(s.key, s.value);
  setUnits(await db.getSetting('units', 'C'));
}
async function eraseAll() {
  for (const s of ['items', 'locations', 'outfits', 'settings']) await db.clear(s);
  await db.putMany('locations', db.DEFAULT_LOCATIONS);
  await db.setSetting('migratedV1', true); // don't re-import the old prototype's data after an erase
  await db.setSetting('onboarded', true);
  await db.setSetting('photoPipeline', 2);
  setUnits('C');
}
