// Closet tab, item detail sub-page, and the Add Item flow (camera / gallery -> clothing check -> photo cleanup -> tags).
import * as db from './db.js';
import { analyze, resize, cleanupReady, setProgress, cleanPhoto } from './ai.js';
import {
  CAT_LABEL, CATEGORIES, SUBTYPES, FORMALITY, FORMALITY_LABEL, SEASONS, WASH_GROUPS, STATUSES, PALETTE,
  categoryOf, defaultWashGroup, wearLimitOf, wearItem, DEFAULT_LIMITS, limitKey,
} from './model.js';
import {
  icon, esc, $, $$, cap, opts, sheet, closeSheet, toast, blobUrl, statusLabel, band, loader, locIcon, stagger,
  confirmSheet, haptic, flyTo,
} from './ui.js';

const GENDERS = { mens: "Men's", womens: "Women's", unisex: 'Unisex' };
const filters = { place: '', category: '', status: '', gender: '', formality: '', colour: '', q: '' };

export const getLocations = async () => (await db.all('locations')).sort((a, b) => a.order - b.order);
export const getLimits = () => db.getSetting('limits', {});
const name = i => [i.colours?.[0]?.name, i.subtype || CAT_LABEL[i.category]?.toLowerCase()].filter(Boolean).join(' ') || 'Item';
export const itemName = name;

export function statusLine(i, limits) {
  const lim = wearLimitOf(i, limits);
  if (i.status === 'hamper') return '<span class="st wash">Needs washing</span>';
  const base = statusLabel[i.status] || 'Clean';
  return `<span class="st">${esc(base)}${lim && (i.status === 'clean' || i.status === 'worn') ? ` · worn ${esc(i.wearCount || 0)}/${esc(lim)}` : ''}</span>`;
}
export function itemCard(i, limits, loc) {
  return `<button type="button" class="icard card-tap" data-id="${esc(i.id)}">
    <span class="photo"><img src="${blobUrl(i)}" alt="" loading="lazy"><span class="loc-pop">${locIcon(loc?.type)}</span></span>
    <span class="name">${esc(cap(name(i)))}</span>${statusLine(i, limits)}</button>`;
}

// ---------- Closet tab
export async function renderCloset(main) {
  const [items, locs, limits] = await Promise.all([db.all('items'), getLocations(), getLimits()]);
  const hamper = items.filter(i => i.status === 'hamper').length;
  if (!items.length) {
    main.innerHTML = band('Your closet', 'Nothing here yet') + `<div class="content"><div class="empty">${loader('Empty closet')}
      <p>Snap a photo and ATTINERA does the rest.</p><button class="btn coral big" data-add>${icon('plus')} Add your first piece</button></div></div>`;
    return;
  }
  const byId = new Map(locs.map(l => [l.id, l]));
  const extra = () => ['category', 'status', 'gender', 'formality', 'colour', 'q'].filter(k => filters[k]).length;
  main.innerHTML = band('Your closet', `${items.length} items · ${hamper} in hamper`) + `<div class="content">
    <div class="chips scroll" role="group" aria-label="Where it lives">
      <button class="chip" data-place="" aria-pressed="${!filters.place}">All</button>
      ${locs.map(l => `<button class="chip" data-place="${esc(l.id)}" aria-pressed="${filters.place === l.id}">${locIcon(l.type, 18)}${esc(l.name)}</button>`).join('')}
      <button class="chip" data-place="hamper" aria-pressed="${filters.place === 'hamper'}">${locIcon('hamper', 18)}Hamper</button>
      <button class="chip" id="filterBtn">${icon('adjustments-horizontal', 18)}Filter<span class="count" ${extra() ? '' : 'hidden'}>${extra()}</span></button>
    </div>
    <div class="grid" id="closetGrid" data-stagger style="margin-top:16px"></div></div>`;

  const draw = () => {
    const q = filters.q.trim().toLowerCase();
    const shown = items.filter(i => (!filters.place || (filters.place === 'hamper' ? i.status === 'hamper' : i.homeLocationId === filters.place))
      && (!filters.category || i.category === filters.category) && (!filters.status || i.status === filters.status)
      && (!filters.gender || i.gender === filters.gender) && (!filters.formality || i.formality === filters.formality)
      && (!filters.colour || i.colours?.some(c => c.name === filters.colour))
      && (!q || [name(i), i.subtype, i.category, i.notes].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt);
    $('#closetGrid').innerHTML = shown.map(i => itemCard(i, limits, byId.get(i.homeLocationId))).join('')
      || '<p class="sub" style="grid-column:1/-1">Nothing matches.</p>';
    const c = $('#filterBtn .count'); c.hidden = !extra(); c.textContent = extra();
    $('.infobar')?.remove();
    stagger(main);
  };

  let lifted = null, hold = null;
  const open = id => { location.hash = '#item/' + encodeURIComponent(id); };
  main.onclick = e => {
    const chip = e.target.closest('[data-place]');
    if (chip) { filters.place = chip.dataset.place; $$('[data-place]', main).forEach(x => x.setAttribute('aria-pressed', x === chip)); return draw(); }
    if (e.target.closest('#filterBtn')) return filterSheet(items, draw);
    const card = e.target.closest('.icard'); if (!card) return;
    if (lifted === card) return open(card.dataset.id); // second tap opens
    $$('.icard.lift', main).forEach(x => x.classList.remove('lift'));
    card.classList.add('lift'); lifted = card; haptic();
    const it = items.find(i => i.id === card.dataset.id), loc = byId.get(it.homeLocationId);
    $('.infobar')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="infobar" role="status">${locIcon(loc?.type)}<span>${esc(cap(name(it)))} lives in: <b>${esc(loc?.name || 'no set place')}</b></span><a href="#item/${esc(it.id)}">Open</a></div>`);
  };
  main.onpointerdown = e => { const c = e.target.closest('.icard'); if (c) hold = setTimeout(() => open(c.dataset.id), 550); };
  main.onpointerup = main.onpointercancel = main.onpointerleave = () => clearTimeout(hold);
  draw();
}

function filterSheet(items, draw) {
  const colours = [...new Set(items.flatMap(i => (i.colours || []).map(c => c.name)))].sort();
  const sel = (k, label, list) => `<label class="field">${label}<select data-f="${k}"><option value="">All</option>${opts(list, filters[k])}</select></label>`;
  const p = sheet(`<h2 class="h2">Filter</h2>
    <label class="search">${icon('search', 20)}<input type="search" data-f="q" placeholder="Search" value="${esc(filters.q)}" aria-label="Search"></label>
    ${sel('category', 'Category', CATEGORIES.map(c => [c, CAT_LABEL[c]]))}${sel('status', 'Status', STATUSES.map(s => [s, statusLabel[s]]))}
    ${sel('colour', 'Colour', colours.map(c => [c, cap(c)]))}${sel('formality', 'Formality', FORMALITY.map(f => [f, FORMALITY_LABEL[f]]))}
    ${sel('gender', 'Gender', Object.entries(GENDERS))}
    <div class="actions"><button class="btn primary wide" data-close>Show results</button><button class="linkbtn" id="clearF">Clear filters</button></div>`);
  p.oninput = p.onchange = e => { const k = e.target.dataset.f; if (k) { filters[k] = e.target.value; draw(); } };
  $('#clearF', p).onclick = () => { for (const k of ['category', 'status', 'gender', 'formality', 'colour', 'q']) filters[k] = ''; closeSheet(); draw(); };
}

// ---------- shared edit form (Add confirm card + item page)
function chips(nameAttr, list, sel, type = 'radio') {
  return `<div class="chips">${list.map(([v, l]) => `<label class="chip"><input type="${type}" name="${nameAttr}" value="${esc(v)}"${(type === 'radio' ? v === sel : sel?.includes(v)) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
}
function colourChips(cols) {
  return cols.map((c, i) => `<button type="button" class="chip" data-rmcol="${i}" aria-label="Remove ${esc(c.name)}"><i class="sw" style="background:${esc(c.hex)}"></i>${esc(cap(c.name))} ${icon('x', 14)}</button>`).join('');
}
const defaultSeasons = w => w <= 2 ? ['spring', 'summer', 'fall'] : w === 3 ? ['spring', 'fall', 'winter'] : ['fall', 'winter'];

function formHtml(it, locs, limits, guess = {}) {
  const hint = () => guess.ai ? `<span class="hint ${guess.confidence >= 0.5 ? '' : 'warn'}">${guess.confidence >= 0.5 ? 'pretty sure' : 'check this'}</span>` : '';
  const defLimit = limitKey(it) === 'never' ? 'never' : (limits[limitKey(it)] || DEFAULT_LIMITS[limitKey(it)]);
  return `<form class="iform" autocomplete="off">
    <fieldset><legend>Category ${hint()}</legend>${chips('category', CATEGORIES.map(c => [c, CAT_LABEL[c]]), it.category)}</fieldset>
    <label class="field">Type ${hint()}<input name="subtype" list="subtypes" value="${esc(it.subtype || '')}" placeholder="t-shirt, jeans, sneakers…">
      <datalist id="subtypes">${Object.keys(SUBTYPES).map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <fieldset><legend>Colours</legend><div class="chips" id="cols">${colourChips(it.colours || [])}</div>
      <select name="addcol" aria-label="Add colour" style="margin-top:8px"><option value="">+ Add colour</option>${opts(Object.keys(PALETTE).map(c => [c, cap(c)]))}</select>
      <input type="hidden" name="colours" value="${esc(JSON.stringify(it.colours || []))}"></fieldset>
    <fieldset><legend>Formality</legend>${chips('formality', FORMALITY.map(f => [f, FORMALITY_LABEL[f]]), it.formality || 'casual')}</fieldset>
    <label class="field">Warmth <output name="wout">${esc(it.warmth || 3)}</output>/5
      <input type="range" name="warmth" min="1" max="5" value="${esc(it.warmth || 3)}"><span class="range-ends"><span>Summer</span><span>Winter</span></span></label>
    <label class="field">Lives in<select name="homeLocationId">${opts(locs.map(l => [l.id, l.name]), it.homeLocationId)}</select></label>
    <details class="fold"><summary>More details ${icon('chevron-down', 20)}</summary>
      <fieldset><legend>Gender</legend>${chips('gender', Object.entries(GENDERS), it.gender || 'unisex')}</fieldset>
      <fieldset><legend>Seasons</legend>${chips('seasons', SEASONS.map(s => [s, cap(s)]), it.seasons || [], 'checkbox')}</fieldset>
      <label class="chip"><input type="checkbox" name="waterproof"${it.waterproof ? ' checked' : ''}> Waterproof</label>
      <fieldset><legend>Wash group</legend>${chips('washGroup', Object.entries(WASH_GROUPS), it.washGroup || 'colours')}</fieldset>
      <label class="field">Wears before washing<input type="number" name="wearLimit" min="1" max="99" inputmode="numeric" value="${esc(it.wearLimit || '')}" placeholder="Default: ${esc(defLimit)}"></label>
      ${it.id ? `<label class="field">Status<select name="status">${opts(STATUSES.map(s => [s, statusLabel[s]]), it.status)}</select></label>` : ''}
      <label class="field">Notes<textarea name="notes" rows="2">${esc(it.notes || '')}</textarea></label>
    </details>
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
      $$('input[name=category]', form).forEach(r => { r.checked = r.value === cat; });
      if (cat === 'shoes' || cat === 'accessories') $$('input[name=washGroup]', form).forEach(r => { r.checked = r.value === 'no-wash'; });
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

// ---------- item detail (sub-page)
export async function renderItem(main, id) {
  const [it, locs, limits, outfits] = await Promise.all([db.get('items', id), getLocations(), getLimits(), db.all('outfits')]);
  if (!it) { main.innerHTML = band('Not found') + '<div class="content"><a href="#closet">Back to closet</a></div>'; return; }
  const worn = outfits.filter(o => o.accepted && o.itemIds?.includes(id)).map(o => o.date).sort().reverse();
  const loc = locs.find(l => l.id === it.homeLocationId);
  main.innerHTML = `<header class="band"><a href="#closet" class="back">${icon('back', 20)} Closet</a>
      <h1>${esc(cap(name(it)))}</h1><p>${esc(statusLabel[it.status])} · lives in ${esc(loc?.name || 'no set place')}</p></header>
    <div class="content today-grid">
      <div>
        <div class="photo" style="border-radius:16px"><img id="heroImg" src="${blobUrl(it, 'photo')}" alt="${esc(name(it))}"></div>
        ${it.original ? `<div class="seg" role="group" aria-label="Photo" style="margin-top:8px"><button data-ph="photo" aria-pressed="true">Cleaned</button><button data-ph="original" aria-pressed="false">Show original</button></div>` : ''}
        <div class="actions"><button class="btn coral big wide" id="wearOne"${it.status !== 'clean' && it.status !== 'worn' ? ' disabled' : ''}>${icon('check', 20)} Mark as worn</button></div>
        <div class="card"><h2 class="h3">Wear history</h2><p class="sub">Worn ${esc(it.timesWornTotal || 0)} times${it.lastWorn ? ` · last ${new Date(it.lastWorn).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}</p>
          ${worn.length ? `<p class="small">${worn.slice(0, 12).map(d => esc(d)).join(' · ')}</p>` : ''}</div>
      </div>
      <div>${formHtml(it, locs, limits)}
        <div class="actions"><button class="btn primary" id="saveItem">Save</button><button class="btn ghost" id="delItem">${icon('trash', 20)} Delete</button></div></div>
    </div>`;
  const form = $('form.iform', main); wireForm(form);
  main.onclick = e => {
    const b = e.target.closest('[data-ph]'); if (!b) return;
    $('#heroImg').src = blobUrl(it, b.dataset.ph);
    $$('[data-ph]', main).forEach(x => x.setAttribute('aria-pressed', x === b));
  };
  $('#saveItem').onclick = async () => {
    const upd = { ...it, ...readForm(form), updatedAt: Date.now() };
    if (upd.status === 'clean' && it.status !== 'clean' && it.status !== 'worn') upd.wearCount = 0;
    await db.put('items', upd); haptic(); toast('Saved'); renderItem(main, id);
  };
  $('#wearOne').onclick = async () => {
    await db.put('items', wearItem(it, limits)); haptic();
    toast('Marked as worn', { undo: async () => { await db.put('items', it); renderItem(main, id); } });
    renderItem(main, id);
  };
  $('#delItem').onclick = async () => {
    if (!await confirmSheet('Delete this item?', 'Its photo and history go too.', 'Delete')) return;
    await db.del('items', id);
    toast('Deleted', { undo: async () => { await db.put('items', it); location.hash = '#item/' + encodeURIComponent(id); } });
    location.hash = '#closet';
  };
}

// ---------- Add Item flow
const hiddenInput = (attrs, onFiles) => {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true, ...attrs });
  inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); inp.remove(); };
  document.body.append(inp);
  inp.click();
};
export const pickGallery = () => hiddenInput({ multiple: true }, f => processQueue(f, openAdd));
const pickCapture = () => hiddenInput({ capture: 'environment' }, f => processQueue(f, openAdd));
export const takePhoto = () => window.isSecureContext && navigator.mediaDevices?.getUserMedia ? camera() : pickCapture();

export function openAdd() {
  const p = sheet(`<h2 class="h2">Add to closet</h2>
    <div class="addopts">
      <button class="btn" id="takePhoto">${icon('camera', 28)}<span>Take photo</span></button>
      <button class="btn" id="pickPhotos">${icon('photo', 28)}<span>Gallery</span></button>
    </div>`, { fab: true });
  $('#pickPhotos', p).onclick = () => { closeSheet(); pickGallery(); };
  $('#takePhoto', p).onclick = () => { closeSheet(); takePhoto(); };
}

async function camera() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
  } catch (e) { console.warn('Camera unavailable', e); return pickCapture(); }
  const cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML = `<video playsinline autoplay muted></video><div class="guide" aria-hidden="true"></div>
    <p class="cam-tip">Fill the frame with one piece</p>
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
    stop(); haptic();
    c.toBlob(b => b && processQueue([b], camera), 'image/jpeg', 0.92);
  };
}

// retake: how to take another photo if this one isn't clothing (camera again, or the add sheet).
async function processQueue(files, retake = openAdd) {
  const [locs, limits] = await Promise.all([getLocations(), getLimits()]);
  let saved = 0, skipped = 0;
  for (const [n, file] of files.entries()) {
    const head = files.length > 1 ? `<p class="sub">Photo ${n + 1} of ${files.length}</p>` : '';
    let preview;
    try { preview = await resize(file, 1024); } catch { toast(`Could not read photo ${n + 1}`); continue; }
    const url = URL.createObjectURL(preview);
    const p = sheet(`${head}<div class="scanbox" id="scan"><img class="orig" src="${url}" alt="Your photo"><span class="scanline"></span></div>
      <div id="aiState"><p class="stage">${loader('Working')}<span id="stageTxt">Checking photo…</span></p>
      ${cleanupReady() ? '' : '<div class="bar"><i id="bar"></i></div><p class="sub small">One-time download, works offline after.</p>'}
      <button class="linkbtn" id="skipAi">Skip, tag it myself</button></div>`, { full: true });
    setProgress(pct => { const b = $('#bar'); if (b) b.style.transform = `scaleX(${pct / 100})`; });
    let skipped1 = false;
    const skip = new Promise(res => { $('#skipAi', p).onclick = () => { skipped1 = true; res({ ai: false, colours: [] }); }; });
    let g = await Promise.race([analyze(preview), skip]);
    if (!document.body.contains(p)) { setProgress(null); URL.revokeObjectURL(url); break; } // closed
    if (g.notClothing && files.length > 1) { skipped++; setProgress(null); URL.revokeObjectURL(url); continue; }
    if (g.notClothing) {
      setProgress(null);
      $('#scan', p).classList.add('cleaned'); $('.orig', p).style.opacity = 1;
      $('#aiState', p).innerHTML = `<div class="notcloth"><h2 class="h2">This doesn't look like clothing</h2>
        <p>Try one piece, laid flat or on a hanger.</p>
        <div class="actions"><button class="btn coral" id="retake">${icon('camera', 20)} Retake</button><button class="btn ghost" id="addAnyway">Add anyway</button></div></div>`;
      const choice = await new Promise(res => {
        $('#retake', p).onclick = () => res('retake');
        $('#addAnyway', p).onclick = () => res('add');
        p.parentElement._onClose = () => res(null);
      });
      p.parentElement._onClose = null;
      if (choice !== 'add') { URL.revokeObjectURL(url); if (choice === 'retake') { closeSheet(true); retake(); } return; }
      $('#aiState', p).innerHTML = `<p class="stage">${loader('Working')}<span id="stageTxt">Tagging…</span></p>`;
      g = await analyze(preview, true);
      $('#scan', p).classList.remove('cleaned'); $('.orig', p).style.opacity = '';
    }
    // Photo cleanup (background removal falls back on its own; "skip" also skips the cutout).
    const stage = $('#stageTxt', p); if (stage) stage.textContent = 'Cleaning up photo…';
    const pic = await cleanPhoto(file, { noCutout: skipped1 });
    setProgress(null);
    if (!document.body.contains(p)) { URL.revokeObjectURL(url); break; }
    const cleanUrl = URL.createObjectURL(pic.photo);
    const im = Object.assign(new Image(), { className: 'clean', alt: 'Cleaned photo', src: cleanUrl });
    await im.decode().catch(() => {});
    $('#scan', p).prepend(im);
    requestAnimationFrame(() => requestAnimationFrame(() => $('#scan', p)?.classList.add('cleaned'))); // cross-fade

    const category = g.category || 'tops', colours = pic.colours?.length ? pic.colours : g.colours || [];
    const draft = {
      category, subtype: g.subtype || '', gender: g.gender || 'unisex', formality: g.formality || 'casual',
      colours, warmth: g.warmth || 3, seasons: defaultSeasons(g.warmth || 3),
      waterproof: ['rain jacket', 'boots'].includes(g.subtype), washGroup: defaultWashGroup(category, g.subtype, colours),
      homeLocationId: (category === 'shoes' ? locs.find(l => l.type === 'rack') : ['underwear', 'socks', 'sleepwear'].includes(category) ? locs.find(l => l.type === 'drawer') : locs.find(l => l.type === 'rail'))?.id || locs[0]?.id,
    };
    $('#aiState', p).outerHTML = `<div>${g.ai ? '' : '<p class="sub small" style="margin-top:16px">Fill in the details below.</p>'}${formHtml(draft, locs, limits, g)}
      <div class="actions sticky"><button class="btn coral big wide" id="saveNew">Save</button>${files.length > 1 ? '<button class="btn ghost" id="skipNew">Skip</button>' : ''}</div></div>`;
    const form = $('form.iform', p); wireForm(form);
    // The AI's guesses pop in one by one.
    [...$$('.chip:has(input:checked), #cols .chip', form)].forEach((c, i) => { c.style.setProperty('--i', i); c.classList.add('pop'); });
    const ok = await new Promise(res => {
      $('#saveNew', p).onclick = () => res(true);
      const s = $('#skipNew', p); if (s) s.onclick = () => res(false);
      p.parentElement._onClose = () => res(null);
    });
    if (ok) {
      const now = Date.now();
      await db.put('items', { id: db.uid(), createdAt: now, updatedAt: now, original: pic.original, photo: pic.photo, thumb: pic.thumb, cleaned: pic.cleaned,
        status: 'clean', wearCount: 0, timesWornTotal: 0, lastWorn: null, ...readForm(form) });
      saved++; haptic();
      flyTo($('#scan', p), $('#tabs a[data-tab="closet"] .ic'), cleanUrl); // new card flies into the Closet tab
    }
    if (p.parentElement) p.parentElement._onClose = null;
    URL.revokeObjectURL(url);
    setTimeout(() => URL.revokeObjectURL(cleanUrl), 1500);
    if (ok === null) break;
  }
  closeSheet();
  const msg = [saved && `Saved ${saved} item${saved > 1 ? 's' : ''} to your closet`, skipped && `skipped ${skipped} that didn't look like clothing`].filter(Boolean).join(' · ');
  if (msg) toast(msg.charAt(0).toUpperCase() + msg.slice(1));
  if (saved) { dispatchEvent(new Event('attinera:added')); dispatchEvent(new HashChangeEvent('hashchange')); }
}
