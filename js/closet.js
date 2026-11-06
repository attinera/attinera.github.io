// Closet tab, item detail page, and the Add Item flow (camera / gallery + on-device AI).
import * as db from './db.js';
import { analyze, resize, modelReady, setProgress } from './ai.js';
import {
  CAT_LABEL, CATEGORIES, SUBTYPES, FORMALITY, FORMALITY_LABEL, SEASONS, WASH_GROUPS, STATUSES, PALETTE,
  categoryOf, defaultWashGroup, wearLimitOf, wearItem, DEFAULT_LIMITS, limitKey,
} from './model.js';
import { icon, esc, $, $$, cap, opts, sheet, closeSheet, toast, blobUrl, confirmTap, statusLabel } from './ui.js';

const GENDERS = { mens: "Men's", womens: "Women's", unisex: 'Unisex' };
const filters = { category: '', status: '', gender: '', formality: '', colour: '', location: '', q: '' };
let groupBy = 'category';

export const getLocations = async () => (await db.all('locations')).sort((a, b) => a.order - b.order);
export const getLimits = () => db.getSetting('limits', {});
const name = i => [i.colours?.[0]?.name, i.subtype || CAT_LABEL[i.category]?.toLowerCase()].filter(Boolean).join(' ') || 'Item';
export const itemName = name;

export function itemCard(i, limits) {
  const lim = wearLimitOf(i, limits);
  return `<a class="icard" href="#item/${esc(i.id)}">
    <img src="${blobUrl(i)}" alt="${esc(name(i))}" loading="lazy">
    <span class="dot st-${esc(i.status)}" title="${esc(statusLabel[i.status])}"></span>
    ${lim ? `<span class="wc">${i.wearCount || 0}/${lim}</span>` : ''}
    ${i.status === 'hamper' ? '<span class="chip coral sm">Needs washing</span>' : ''}
    <span class="cap">${esc(cap(name(i)))}</span></a>`;
}

// ---------- Closet tab
export async function renderCloset(main) {
  const [items, locs, limits] = await Promise.all([db.all('items'), getLocations(), getLimits()]);
  if (!items.length) {
    main.innerHTML = `<h1 class="h1">Closet</h1><div class="empty">
      <svg viewBox="0 0 120 90" width="160" aria-hidden="true"><path d="M60 26v-5a7 7 0 1 1 7 7c-4 0-7 2-7 5L14 70h92z" fill="none" stroke="var(--steel)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="96" cy="22" r="6" fill="var(--ice)"/><circle cx="22" cy="30" r="4" fill="var(--ice)"/></svg>
      <h2>Your closet is empty</h2><p class="muted">Snap a photo and ATTINERA tags it for you, right on your phone.</p>
      <button class="btn primary" data-add>${icon('plus')} Add your first piece</button></div>`;
    return;
  }
  const colours = [...new Set(items.flatMap(i => (i.colours || []).map(c => c.name)))].sort();
  const sel = (k, label, list) => `<label class="fchip"><span class="sr">${label}</span><select data-f="${k}"><option value="">${label}: all</option>${opts(list, filters[k])}</select></label>`;
  main.innerHTML = `<h1 class="h1">Closet <span class="muted">${items.length}</span></h1>
    <label class="search">${icon('search', 20)}<input type="search" data-f="q" placeholder="Search your closet" value="${esc(filters.q)}" aria-label="Search"></label>
    <div class="chiprow">
      ${sel('status', 'Status', STATUSES.map(s => [s, statusLabel[s]]))}
      ${sel('category', 'Category', CATEGORIES.map(c => [c, CAT_LABEL[c]]))}
      ${sel('location', 'Location', locs.map(l => [l.id, l.name]))}
      ${sel('colour', 'Colour', colours.map(c => [c, cap(c)]))}
      ${sel('formality', 'Formality', FORMALITY.map(f => [f, FORMALITY_LABEL[f]]))}
      ${sel('gender', 'Gender', Object.entries(GENDERS))}
    </div>
    <div class="seg" role="group" aria-label="Group by">
      <button data-group="category" aria-pressed="${groupBy === 'category'}">By category</button>
      <button data-group="location" aria-pressed="${groupBy === 'location'}">Where it lives</button>
    </div>
    <div id="closetGrid"></div>`;
  const draw = () => {
    const q = filters.q.trim().toLowerCase();
    const shown = items.filter(i => (!filters.category || i.category === filters.category) && (!filters.status || i.status === filters.status)
      && (!filters.gender || i.gender === filters.gender) && (!filters.formality || i.formality === filters.formality)
      && (!filters.location || i.homeLocationId === filters.location) && (!filters.colour || i.colours?.some(c => c.name === filters.colour))
      && (!q || [name(i), i.subtype, i.category, i.notes, ...(i.colours || []).map(c => c.name)].join(' ').toLowerCase().includes(q)));
    const groups = groupBy === 'category'
      ? CATEGORIES.map(c => [CAT_LABEL[c], shown.filter(i => i.category === c)])
      : [...locs.map(l => [l.name, shown.filter(i => i.homeLocationId === l.id)]), ['No location', shown.filter(i => !locs.some(l => l.id === i.homeLocationId))]];
    $('#closetGrid').innerHTML = groups.filter(g => g[1].length).map(([g, list]) =>
      `<h2 class="h2">${esc(g)} <span class="muted">${list.length}</span></h2><div class="grid">${list.sort((a, b) => b.createdAt - a.createdAt).map(i => itemCard(i, limits)).join('')}</div>`
    ).join('') || '<p class="muted pad">Nothing matches these filters.</p>';
  };
  main.oninput = main.onchange = e => { const k = e.target.dataset.f; if (k) { filters[k] = e.target.value; draw(); } };
  main.onclick = e => { const b = e.target.closest('[data-group]'); if (!b) return; groupBy = b.dataset.group; $$('[data-group]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); };
  draw();
}

// ---------- shared edit form (Add confirm card + item page)
function chips(nameAttr, list, sel, type = 'radio') {
  return `<div class="chips">${list.map(([v, l]) => `<label class="chip"><input type="${type}" name="${nameAttr}" value="${esc(v)}"${(type === 'radio' ? v === sel : sel?.includes(v)) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
}
function colourChips(cols) {
  return cols.map((c, i) => `<button type="button" class="chip swatch" data-rmcol="${i}" aria-label="Remove ${esc(c.name)}"><i style="background:${esc(c.hex)}"></i>${esc(cap(c.name))} ${icon('x', 14)}</button>`).join('');
}
const defaultSeasons = w => w <= 2 ? ['spring', 'summer', 'fall'] : w === 3 ? ['spring', 'fall', 'winter'] : ['fall', 'winter'];

function formHtml(it, locs, limits, guess = {}) {
  const hint = k => guess.ai ? `<span class="hint ${guess.confidence >= 0.5 ? '' : 'warn'}">${guess.confidence >= 0.5 ? 'pretty sure' : 'check this'}</span>` : '';
  const defLimit = limitKey(it) === 'never' ? 'never' : (limits[limitKey(it)] || DEFAULT_LIMITS[limitKey(it)]);
  return `<form class="iform" autocomplete="off">
    <fieldset><legend>Category ${hint('cat')}</legend>${chips('category', CATEGORIES.map(c => [c, CAT_LABEL[c]]), it.category)}</fieldset>
    <label class="field">Type ${hint('sub')}<input name="subtype" list="subtypes" value="${esc(it.subtype || '')}" placeholder="e.g. t-shirt, jeans, sneakers">
      <datalist id="subtypes">${Object.keys(SUBTYPES).map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <fieldset><legend>Colours</legend><div class="chips" id="cols">${colourChips(it.colours || [])}</div>
      <select name="addcol" aria-label="Add colour"><option value="">+ Add colour</option>${opts(Object.keys(PALETTE).map(c => [c, cap(c)]))}</select>
      <input type="hidden" name="colours" value="${esc(JSON.stringify(it.colours || []))}"></fieldset>
    <fieldset><legend>Gender</legend>${chips('gender', Object.entries(GENDERS), it.gender || 'unisex')}</fieldset>
    <fieldset><legend>Formality</legend>${chips('formality', FORMALITY.map(f => [f, FORMALITY_LABEL[f]]), it.formality || 'casual')}</fieldset>
    <label class="field">Warmth <output name="wout">${it.warmth || 3}</output>/5
      <input type="range" name="warmth" min="1" max="5" value="${it.warmth || 3}"><span class="range-ends"><span>Summer-light</span><span>Winter-heavy</span></span></label>
    <fieldset><legend>Seasons</legend>${chips('seasons', SEASONS.map(s => [s, cap(s)]), it.seasons || [], 'checkbox')}</fieldset>
    <label class="chip lone"><input type="checkbox" name="waterproof"${it.waterproof ? ' checked' : ''}> Waterproof</label>
    <label class="field">Lives in<select name="homeLocationId">${opts(locs.map(l => [l.id, l.name]), it.homeLocationId)}</select></label>
    <fieldset><legend>Wash group</legend>${chips('washGroup', Object.entries(WASH_GROUPS), it.washGroup || 'colours')}</fieldset>
    <label class="field">Wears before washing<input type="number" name="wearLimit" min="1" max="99" inputmode="numeric" value="${it.wearLimit || ''}" placeholder="Default: ${defLimit}"></label>
    ${it.id ? `<label class="field">Status<select name="status">${opts(STATUSES.map(s => [s, statusLabel[s]]), it.status)}</select></label>` : ''}
    <label class="field">Notes<textarea name="notes" rows="2">${esc(it.notes || '')}</textarea></label>
  </form>`;
}
function wireForm(form) {
  const cols = () => JSON.parse(form.colours.value);
  const setCols = c => { form.colours.value = JSON.stringify(c); $('#cols', form).innerHTML = colourChips(c); };
  form.addEventListener('click', e => { const b = e.target.closest('[data-rmcol]'); if (b) { const c = cols(); c.splice(+b.dataset.rmcol, 1); setCols(c); } });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'addcol' && t.value) { const c = cols().filter(x => x.name !== t.value).slice(0, 2); c.push({ name: t.value, hex: PALETTE[t.value] }); setCols(c); t.value = ''; }
    if (t.name === 'subtype' && categoryOf(t.value)) {
      const cat = categoryOf(t.value);
      $$(`input[name=category]`, form).forEach(r => { r.checked = r.value === cat; });
      if (cat === 'shoes' || cat === 'accessories') $$(`input[name=washGroup]`, form).forEach(r => { r.checked = r.value === 'no-wash'; });
      if (['rain jacket', 'boots'].includes(t.value)) form.waterproof.checked = true;
    }
  });
  form.addEventListener('input', e => { if (e.target.name === 'warmth') form.wout.value = e.target.value; });
}
function readForm(form) {
  const f = new FormData(form);
  return {
    category: f.get('category') || 'tops', subtype: (f.get('subtype') || '').trim().toLowerCase(),
    gender: f.get('gender') || 'unisex', formality: f.get('formality') || 'casual',
    colours: JSON.parse(f.get('colours') || '[]'), warmth: +f.get('warmth') || 3, seasons: f.getAll('seasons'),
    waterproof: !!f.get('waterproof'), homeLocationId: f.get('homeLocationId'), washGroup: f.get('washGroup') || 'colours',
    wearLimit: +f.get('wearLimit') || null, notes: f.get('notes') || '', ...(f.get('status') ? { status: f.get('status') } : {}),
  };
}

// ---------- item detail page
export async function renderItem(main, id) {
  const [it, locs, limits, outfits] = await Promise.all([db.get('items', id), getLocations(), getLimits(), db.all('outfits')]);
  if (!it) { main.innerHTML = '<p class="pad">Item not found. <a href="#closet">Back to closet</a></p>'; return; }
  const worn = outfits.filter(o => o.accepted && o.itemIds?.includes(id)).map(o => o.date).sort().reverse();
  const lim = wearLimitOf(it, limits);
  main.innerHTML = `<a href="#closet" class="back">${icon('back', 20)} Closet</a>
    <div class="detail">
      <img class="hero-photo" src="${blobUrl(it, 'photo')}" alt="${esc(name(it))}">
      <div>
        <h1 class="h1">${esc(cap(name(it)))}</h1>
        <p><span class="dot inline st-${esc(it.status)}"></span> ${esc(statusLabel[it.status])}${lim ? ` · worn ${it.wearCount || 0} of ${lim} before wash` : ' · no washing needed'}
          ${it.status === 'hamper' ? ' <span class="chip coral sm">Needs washing</span>' : ''}</p>
        <div class="actions"><button class="btn primary" id="wearOne"${it.status !== 'clean' && it.status !== 'worn' ? ' disabled' : ''}>${icon('check', 20)} Mark as worn</button></div>
        <div class="card">
          <h2 class="h3">Wear history</h2>
          <p class="muted">Worn ${it.timesWornTotal || 0} times in total${it.lastWorn ? ` · last on ${new Date(it.lastWorn).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}.</p>
          ${worn.length ? `<p class="small">${worn.slice(0, 12).map(d => esc(d)).join(' · ')}</p>` : ''}
        </div>
        ${formHtml(it, locs, limits)}
        <div class="actions"><button class="btn primary" id="saveItem">Save changes</button><button class="btn ghost" id="delItem">${icon('trash', 20)} Delete</button></div>
      </div></div>`;
  const form = $('form.iform', main); wireForm(form);
  $('#saveItem').onclick = async () => {
    const upd = { ...it, ...readForm(form), updatedAt: Date.now() };
    if (upd.status === 'clean' && it.status !== 'clean' && it.status !== 'worn') upd.wearCount = 0;
    await db.put('items', upd); toast('Saved'); renderItem(main, id);
  };
  $('#wearOne').onclick = async () => { await db.put('items', wearItem(it, limits)); toast('Marked as worn'); renderItem(main, id); };
  $('#delItem').onclick = async e => {
    if (!confirmTap(e.currentTarget, 'Tap again to delete')) return;
    await db.del('items', id); toast('Deleted'); location.hash = '#closet';
  };
}

// ---------- Add Item flow
export function openAdd() {
  const p = sheet(`<h2 class="h2">Add to closet</h2>
    <div class="addopts">
      <button class="btn big" id="takePhoto">${icon('camera', 28)}<span>Take photo</span></button>
      <button class="btn big" id="pickPhotos">${icon('image', 28)}<span>Choose from gallery</span></button>
    </div>
    <input type="file" id="capIn" accept="image/*" capture="environment" hidden>
    <input type="file" id="galIn" accept="image/*" multiple hidden>
    <button class="btn ghost wide" data-close>Cancel</button>`);
  const take = files => { if (files.length) processQueue([...files]); };
  $('#capIn', p).onchange = e => take(e.target.files);
  $('#galIn', p).onchange = e => take(e.target.files);
  $('#pickPhotos', p).onclick = () => $('#galIn', p).click();
  $('#takePhoto', p).onclick = () => {
    if (window.isSecureContext && navigator.mediaDevices?.getUserMedia) camera(() => $('#capIn', p).click());
    else $('#capIn', p).click();
  };
}

async function camera(fallback) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
  } catch (e) { console.warn('Camera unavailable', e); return fallback(); }
  closeSheet();
  const cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML = `<video playsinline autoplay muted></video><div class="guide" aria-hidden="true"></div>
    <p class="cam-tip">Lay the piece flat or hang it, fill the frame</p>
    <button class="cam-close" aria-label="Close camera">${icon('x', 28)}</button>
    <button class="shutter" aria-label="Take photo"></button>`;
  document.body.append(cam);
  const video = $('video', cam); video.srcObject = stream;
  const stop = () => { stream.getTracks().forEach(t => t.stop()); cam.remove(); };
  $('.cam-close', cam).onclick = stop;
  $('.shutter', cam).onclick = () => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    stop();
    c.toBlob(b => b && processQueue([b]), 'image/jpeg', 0.92);
  };
}

async function processQueue(files) {
  const [locs, limits] = await Promise.all([getLocations(), getLimits()]);
  let saved = 0;
  for (const [n, file] of files.entries()) {
    const head = files.length > 1 ? `<p class="muted">Photo ${n + 1} of ${files.length}</p>` : '';
    let photo, thumb;
    try { [photo, thumb] = await Promise.all([resize(file, 1024), resize(file, 256)]); }
    catch { toast(`Could not read photo ${n + 1}`); continue; }
    const url = URL.createObjectURL(photo);
    const p = sheet(`${head}<div class="confirm"><img class="confirm-photo" src="${url}" alt="New item">
      <div id="aiState"><p class="analyzing"><span class="spin"></span> Analyzing…</p>
      ${modelReady() ? '' : '<div class="bar"><i id="bar"></i></div><p class="muted small">One-time download of the AI model, works offline after.</p>'}
      <button class="btn ghost" id="skipAi">Skip, tag it myself</button></div></div>`, { full: true });
    setProgress(pct => { const b = $('#bar'); if (b) b.style.transform = `scaleX(${pct / 100})`; });
    const skip = new Promise(res => { $('#skipAi', p).onclick = () => res({ ai: false, colours: [] }); });
    const g = await Promise.race([analyze(photo), skip]);
    setProgress(null);
    if (!document.body.contains(p)) { URL.revokeObjectURL(url); break; } // user closed the sheet
    const category = g.category || 'tops';
    const draft = {
      category, subtype: g.subtype || '', gender: g.gender || 'unisex', formality: g.formality || 'casual',
      colours: g.colours || [], warmth: g.warmth || 3, seasons: defaultSeasons(g.warmth || 3),
      waterproof: ['rain jacket', 'boots'].includes(g.subtype), washGroup: defaultWashGroup(category, g.subtype, g.colours),
      homeLocationId: (category === 'shoes' ? locs.find(l => l.type === 'rack') : ['underwear', 'socks', 'sleepwear'].includes(category) ? locs.find(l => l.type === 'drawer') : locs.find(l => l.type === 'rail'))?.id || locs[0]?.id,
    };
    $('#aiState', p).outerHTML = `<div>${g.ai ? '' : '<p class="muted small">AI tagging unavailable, fill in the chips below.</p>'}${formHtml(draft, locs, limits, g)}
      <div class="actions sticky"><button class="btn primary wide" id="saveNew">Save</button>${files.length > 1 ? '<button class="btn ghost" id="skipNew">Skip photo</button>' : ''}</div></div>`;
    const form = $('form.iform', p); wireForm(form);
    const ok = await new Promise(res => {
      $('#saveNew', p).onclick = () => res(true);
      const s = $('#skipNew', p); if (s) s.onclick = () => res(false);
      p.parentElement._onClose = () => res(null);
    });
    if (ok) {
      const now = Date.now();
      await db.put('items', { id: db.uid(), createdAt: now, updatedAt: now, photo, thumb, status: 'clean', wearCount: 0, timesWornTotal: 0, lastWorn: null, ...readForm(form) });
      saved++;
    }
    p.parentElement._onClose = null;
    URL.revokeObjectURL(url);
    if (ok === null) break;
  }
  closeSheet();
  if (saved) { toast(`Added ${saved} item${saved > 1 ? 's' : ''}`); dispatchEvent(new HashChangeEvent('hashchange')); }
}
