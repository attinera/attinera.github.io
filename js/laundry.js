// Laundry tab: hamper -> washing -> drying -> put-away checklist (by location) -> clean.
import * as db from './db.js';
import { WASH_GROUPS, DEFAULT_LOW_SUPPLY, CAT_LABEL } from './model.js';
import { icon, esc, $, $$, sheet, toast, blobUrl } from './ui.js';
import { getLocations, itemName } from './closet.js';

const thumbs = list => `<div class="thumbs">${list.map(i => `<a href="#item/${esc(i.id)}"><img src="${blobUrl(i)}" alt="${esc(itemName(i))}" title="${esc(itemName(i))}"></a>`).join('')}</div>`;
const setStatus = (items, status, extra = {}) => db.putMany('items', items.map(i => ({ ...i, status, ...extra, updatedAt: Date.now() })));
const LOW_NAMES = { socks: ['pair of socks', 'pairs of socks'], underwear: ['pair of underwear', 'pairs of underwear'] };

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
  main.innerHTML = `<h1 class="h1">Laundry</h1>
    <div class="stat"><b>${hamper.length}</b><span>in the hamper</span></div>
    ${warn.map(w => `<p class="alert">${esc(w)}</p>`).join('')}
    ${groups.length ? '<h2 class="h2">Suggested loads</h2>' : ''}
    ${groups.map(([g, list]) => `<div class="card load"><div class="row-between"><h3 class="h3">${WASH_GROUPS[g]} <span class="muted">${list.length}</span></h3>
      <button class="btn primary sm" data-start="${g}">Start load</button></div>${thumbs(list)}</div>`).join('')}
    ${washing.length ? `<h2 class="h2">Washing <span class="muted">${washing.length}</span></h2><div class="card">${thumbs(washing)}
      <div class="actions"><button class="btn primary sm" data-dry>Move to dryer</button><button class="btn ghost sm" data-dry>Hang dry</button></div></div>` : ''}
    ${drying.length ? `<h2 class="h2">Drying <span class="muted">${drying.length}</span></h2><div class="card">${thumbs(drying)}
      <div class="actions"><button class="btn primary sm" data-done>Done, put away</button></div></div>` : ''}
    ${worn.length ? `<h2 class="h2">Worn, not put back <span class="muted">${worn.length}</span></h2><div class="card">${worn.map(i => `
      <div class="row-between line"><span class="row"><img class="mini" src="${blobUrl(i)}" alt="">${esc(itemName(i))}</span>
      <span class="row"><button class="btn ghost sm" data-back="${esc(i.id)}">Put back</button><button class="btn ghost sm" data-ham="${esc(i.id)}">Hamper</button></span></div>`).join('')}</div>` : ''}
    ${!groups.length && !washing.length && !drying.length && !worn.length ? `<div class="empty">${icon('laundry', 48)}<h2>All caught up</h2><p class="muted">Nothing to wash. Items land here once they hit their wear limit.</p></div>` : ''}`;

  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.start) { await setStatus(hamper.filter(i => i.washGroup === d.start), 'washing'); toast(`${WASH_GROUPS[d.start]} load started`); }
    else if ('dry' in d) { await setStatus(washing, 'drying'); toast('Drying'); }
    else if ('done' in d) return putAway(main);
    else if (d.back) await setStatus(worn.filter(i => i.id === d.back), 'clean');
    else if (d.ham) await setStatus(worn.filter(i => i.id === d.ham), 'hamper');
    else return;
    renderLaundry(main);
  };
}

export async function putAway(main) {
  const [items, locs] = await Promise.all([db.all('items'), getLocations()]);
  const drying = items.filter(i => i.status === 'drying');
  const groups = [...locs.map(l => [l.name, drying.filter(i => i.homeLocationId === l.id)]), ['Anywhere', drying.filter(i => !locs.some(l => l.id === i.homeLocationId))]].filter(g => g[1].length);
  const summary = list => Object.entries(list.reduce((m, i) => (m[i.subtype || CAT_LABEL[i.category]] = (m[i.subtype || CAT_LABEL[i.category]] || 0) + 1, m), {})).map(([k, n]) => `${n} ${k}`).join(', ');
  const p = sheet(`<h2 class="h2">Put-away checklist</h2><p class="muted">Tick each piece as it goes back.</p>
    ${groups.map(([loc, list]) => `<div class="card"><h3 class="h3">${icon('pin', 18)} ${esc(loc)}: <span class="muted">${esc(summary(list))}</span></h3>
      ${list.map(i => `<label class="check"><input type="checkbox" data-put="${esc(i.id)}"><img class="mini" src="${blobUrl(i)}" alt="">${esc(itemName(i))}</label>`).join('')}</div>`).join('')}
    <div class="actions"><button class="btn primary wide" id="putAll">Put all away</button></div>`, { onClose: () => main && renderLaundry(main) });
  const clean = ids => db.putMany('items', drying.filter(i => ids.includes(i.id)).map(i => ({ ...i, status: 'clean', wearCount: 0, updatedAt: Date.now() })));
  p.addEventListener('change', e => { const id = e.target.dataset.put; if (id && e.target.checked) clean([id]); });
  $('#putAll', p).onclick = async () => { await clean(drying.map(i => i.id)); $$('[data-put]', p).forEach(c => { c.checked = true; }); toast('All put away'); };
}
