// Laundry tab: hamper (swipe right = wash now, swipe left = Delete) -> washing -> drying -> put-away by location.
import * as db from './db.js';
import { WASH_GROUPS, DEFAULT_LOW_SUPPLY, CAT_LABEL } from './model.js';
import { icon, esc, $, $$, sheet, toast, blobUrl, swipeRow, swRow, haptic, locIcon, loader, cap, header } from './ui.js';
import { getLocations, itemName, deleteItems } from './closet.js';

const setStatus = (items, status, extra = {}) => db.putMany('items', items.map(i => ({ ...i, status, ...extra })));
const LOW_NAMES = { socks: ['pair of socks', 'pairs of socks'], underwear: ['pair of underwear', 'pairs of underwear'] };
const thumbs = list => `<div class="row" style="margin-top:12px">${list.slice(0, 8).map(i => `<img class="mini" src="${blobUrl(i)}" alt="${esc(itemName(i))}">`).join('')}${list.length > 8 ? `<span class="sub">+${list.length - 8}</span>` : ''}</div>`;
// Washer with a spinning drum (drum = .drum, transform only).
const washer = `<svg class="washer" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
  <rect x="8" y="4" width="48" height="56" rx="8"/><path d="M8 16h48"/><circle cx="16" cy="10" r="1.5"/><circle cx="23" cy="10" r="1.5"/>
  <circle cx="32" cy="38" r="14"/><g class="drum"><path d="M24 36c3 4 13 4 16 0" /><circle cx="32" cy="38" r="8" stroke-dasharray="6 6"/></g></svg>`;

export async function lowSupply(items) {
  const th = await db.getSetting('lowSupply', DEFAULT_LOW_SUPPLY);
  return Object.entries(th).flatMap(([cat, n]) => {
    const owned = items.filter(i => i.category === cat);
    const clean = owned.filter(i => i.status === 'clean').length;
    if (!owned.length || clean >= n) return [];
    const [one, many] = LOW_NAMES[cat] || [CAT_LABEL[cat]?.toLowerCase(), CAT_LABEL[cat]?.toLowerCase()];
    return [`Only ${clean} clean ${clean === 1 ? one : many} left`];
  });
}

export async function renderLaundry(main) {
  const items = await db.all('items');
  const by = s => items.filter(i => i.status === s);
  const hamper = by('hamper').filter(i => i.washGroup !== 'no-wash'), washing = by('washing'), drying = by('drying'), worn = by('worn');
  const warn = await lowSupply(items);
  const groups = Object.keys(WASH_GROUPS).filter(g => g !== 'no-wash').map(g => [g, hamper.filter(i => i.washGroup === g)]).filter(g => g[1].length);
  const idle = !hamper.length && !washing.length && !drying.length && !worn.length;
  main.innerHTML = header('Laundry', { sub: `${hamper.length} in hamper · ${washing.length + drying.length} in progress` }) + `
    <div class="content">
    ${warn.length ? `<div class="card alert">${icon('info-circle', 22)}<div>${warn.map(w => `<b>${esc(w)}</b>`).join('<br>')}<p class="sub">Run a load soon.</p></div></div>` : ''}
    ${washing.length ? `<h2 class="h2">Washing</h2><div class="card"><div class="row">${washer}<div><b>${washing.length} in the wash</b><p class="sub">Move them when the cycle ends.</p></div></div>${thumbs(washing)}
      <div class="actions"><button class="btn primary" data-dry>Move to dryer</button><button class="btn ghost" data-dry>Hang dry</button></div></div>` : ''}
    ${drying.length ? `<h2 class="h2">Drying</h2><div class="card"><b>${drying.length} drying</b>${thumbs(drying)}
      <div class="actions"><button class="btn primary" data-done>Done, put away</button></div></div>` : ''}
    ${groups.length ? '<h2 class="h2">Loads</h2>' : ''}
    <div data-stagger>${groups.map(([g, list]) => `<div class="card"><div class="between"><span><b>${WASH_GROUPS[g]}</b> <span class="sub">${list.length}</span></span>
      <button class="btn primary sm" data-start="${g}">Start load</button></div>${thumbs(list)}</div>`).join('')}</div>
    ${hamper.length ? `<h2 class="h2">In the hamper</h2><p class="hint-swipe">Swipe right to wash · swipe left to delete</p>
      <div class="list-rows" style="margin-top:8px">${hamper.map(i => swRow(`<div class="load-row">
        <img class="mini" src="${blobUrl(i)}" alt=""><span>${esc(cap(itemName(i)))}<br><span class="sub small">${esc(WASH_GROUPS[i.washGroup] || '')}</span></span>
        <button class="icon-btn bare" data-clean="${esc(i.id)}" aria-label="Still clean, put back">${icon('arrow-back-up', 20)}</button>
        <button class="icon-btn bare" data-wash="${esc(i.id)}" aria-label="Wash now">${icon('wash-machine', 20)}</button></div>`, `Delete ${cap(itemName(i))}`)
        .replace('<div class="sw-row', `<div data-id="${esc(i.id)}" class="sw-row`)).join('')}</div>` : ''}
    ${worn.length ? `<h2 class="h2">Worn, not put back</h2><div class="card eod">${worn.map(i => `
      <div class="between"><span class="row"><img class="mini" src="${blobUrl(i)}" alt="">${esc(cap(itemName(i)))}</span>
      <span class="row"><button class="btn ghost sm" data-back="${esc(i.id)}">Put back</button><button class="btn ghost sm" data-ham="${esc(i.id)}">Hamper</button></span></div>`).join('')}</div>` : ''}
    ${idle ? `<div class="empty">${loader('All clean')}<h2 class="h2">All caught up</h2><p>Items land here when they hit their wear limit.</p></div>` : ''}
    </div>`;

  const one = async (id, status, msg) => {
    const it = items.find(i => i.id === id); if (!it) return;
    await setStatus([it], status); haptic();
    toast(msg, { undo: async () => { await db.put('items', it); renderLaundry(main); } });
    renderLaundry(main);
  };
  for (const row of $$('.sw-row[data-id]', main)) {
    const it = items.find(i => i.id === row.dataset.id);
    swipeRow(row, { onRight: () => one(it.id, 'washing', 'Added to load'), onDelete: () => deleteItems([it], () => renderLaundry(main)) });
  }

  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.wash) return one(d.wash, 'washing', 'Added to load');
    if (d.clean) return one(d.clean, 'clean', 'Back in the closet');
    if (d.back) return one(d.back, 'clean', 'Put back');
    if (d.ham) return one(d.ham, 'hamper', 'In the hamper');
    if (d.start) { const list = hamper.filter(i => i.washGroup === d.start); await setStatus(list, 'washing'); haptic(); toast(`${WASH_GROUPS[d.start]} load started`, { undo: async () => { await db.putMany('items', list); renderLaundry(main); } }); }
    else if ('dry' in d) { await setStatus(washing, 'drying'); haptic(); toast('Drying'); }
    else if ('done' in d) return putAway(main);
    else return;
    renderLaundry(main);
  };
}

export async function putAway(main) {
  const [items, locs] = await Promise.all([db.all('items'), getLocations()]);
  const drying = items.filter(i => i.status === 'drying');
  const groups = [...locs.map(l => [l, drying.filter(i => i.homeLocationId === l.id)]), [{ name: 'Anywhere' }, drying.filter(i => !locs.some(l => l.id === i.homeLocationId))]].filter(g => g[1].length);
  const p = sheet(`<h2 class="h2">Put away</h2><p class="sub">Tick each piece as it goes back.</p>
    ${groups.map(([loc, list]) => `<div class="card putaway" style="margin-top:16px"><div class="row"><span class="home">${locIcon(loc.type)}</span><b>${esc(loc.name)}</b><span class="sub">${list.length}</span></div>
      ${list.map(i => `<label class="check"><input type="checkbox" data-put="${esc(i.id)}"><img class="mini" src="${blobUrl(i)}" alt="">${esc(cap(itemName(i)))}</label>`).join('')}</div>`).join('')}
    <div class="actions"><button class="btn coral big wide" id="putAll">Put all away</button></div>`, { onClose: () => main && renderLaundry(main) });
  const clean = ids => db.putMany('items', drying.filter(i => ids.includes(i.id)).map(i => ({ ...i, status: 'clean', wearCount: 0 })));
  p.addEventListener('change', e => { const id = e.target.dataset.put; if (id && e.target.checked) { clean([id]); haptic(); e.target.closest('.check').classList.add('gone'); } });
  $('#putAll', p).onclick = async () => {
    await clean(drying.map(i => i.id)); haptic();
    $$('[data-put]', p).forEach(c => { c.checked = true; c.closest('.check').classList.add('gone'); });
    toast('All put away');
  };
}
