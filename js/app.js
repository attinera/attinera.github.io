// App shell: hash router with view/sub-page transitions, slate tab bar with gliding indicator, + button,
// first-launch onboarding, one-time migration from the old prototype, background photo polishing.
import * as db from './db.js';
import { icon, $, $$, setUnits, logoSvg, replayLogo, countUp, stagger, toast, blobUrl } from './ui.js';
import { resize, cleanPhoto } from './ai.js';
import { defaultWashGroup } from './model.js';
import { renderToday } from './today.js';
import { renderCloset, renderItem, openAdd } from './closet.js';
import { renderLaundry } from './laundry.js';
import { renderShop } from './shop.js';
import { renderMe } from './settings.js';
import { maybeOnboard } from './onboarding.js';

const TABS = [['today', 'Today'], ['closet', 'Closet'], ['laundry', 'Laundry'], ['shop', 'Shop'], ['me', 'Me']];
const main = $('#view');

$('.brand-mark').innerHTML = logoSvg();
$('#brand').onclick = () => { replayLogo($('#brand')); if (location.hash && location.hash !== '#today') location.hash = '#today'; };
$('#tabs').innerHTML = '<span class="tab-ind" aria-hidden="true"></span>' +
  TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}">${icon(k)}<span>${l}</span></a>`).join('');
$('#fab').innerHTML = icon('plus', 30);
$('#fab').onclick = () => document.body.classList.contains('fab-open') ? $('.sheet-wrap [data-close]')?.click() : openAdd();
document.addEventListener('click', e => { if (e.target.closest('[data-add]')) openAdd(); });
// Store favicon failed -> show lettered fallback tile.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.closest('.logo')) { img.hidden = true; img.nextElementSibling.hidden = false; }
}, true);

let lastTab = null;
async function route() {
  const [path, query = ''] = (location.hash.slice(1) || 'today').split('?');
  const [tab, id] = path.split('/');
  const active = tab === 'item' ? 'closet' : TABS.some(t => t[0] === tab) ? tab : 'today';
  const isSub = tab === 'item' || (tab === 'me' && id);
  $('#tabs').style.setProperty('--idx', TABS.findIndex(t => t[0] === active));
  $$('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === active ? 'page' : 'false'));
  main.onclick = main.onchange = main.oninput = main.onsubmit = null;
  main.ontouchstart = main.ontouchmove = main.ontouchend = null;
  $('.infobar')?.remove();
  try {
    if (tab === 'closet') await renderCloset(main);
    else if (tab === 'item') await renderItem(main, decodeURIComponent(id || ''));
    else if (tab === 'laundry') await renderLaundry(main);
    else if (tab === 'shop') await renderShop(main, new URLSearchParams(query));
    else if (tab === 'me') await renderMe(main, id);
    else await renderToday(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = '<div class="pad"><div class="card alert"><b>Something went wrong loading this page.</b></div></div>';
  }
  if (!(tab === 'me' && !id)) main.insertAdjacentHTML('beforeend', '<footer class="foot">© 2026 EJ Empires · ATTINERA prototype</footer>'); // Me has its own
  const cls = isSub ? 'view-sub' : active !== lastTab ? 'view-in' : '';
  main.classList.remove('view-in', 'view-sub'); void main.offsetWidth;
  if (cls) main.classList.add(cls);
  if (active !== lastTab || isSub) { scrollTo(0, 0); main.focus({ preventScroll: true }); }
  lastTab = active;
  stagger(main); countUp(main);
}
addEventListener('hashchange', route);
export const rerender = route;

// One-time: bring saved products + wardrobe across from the old localStorage prototype.
async function migrate() {
  if (await db.getSetting('migratedV1')) return;
  const ls = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ids = ls('saved') || [], snaps = ls('savedProducts') || {};
  if (ids.length) await db.setSetting('savedProducts', Object.fromEntries(ids.filter(id => snaps[id]).map(id => [id, snaps[id]])));
  if (ls('gender')) await db.setSetting('shopGender', ls('gender'));
  const CAT = { top: 'tops', bottom: 'bottoms', dress: 'dresses-skirts', outerwear: 'outerwear', shoes: 'shoes', accessory: 'accessories' };
  const FORM = { smart: 'smart-casual', business: 'formal', formal: 'formal' };
  const locs = await db.all('locations');
  for (const old of ls('wardrobe') || []) {
    try {
      const blob = await (await fetch(old.img)).blob();
      const category = CAT[old.cat] || 'tops', now = Date.now();
      await db.put('items', {
        id: 'old-' + old.id, createdAt: now, updatedAt: now, photo: await resize(blob, 1024), thumb: await resize(blob, 256),
        category, subtype: old.cat === 'dress' ? 'dress' : '', gender: 'unisex', formality: FORM[old.style] || 'casual', colours: [],
        warmth: { 1: 1, 2: 3, 3: 5 }[old.warmth] || 3, seasons: [], waterproof: !!old.wp, status: 'clean', wearCount: 0, wearLimit: null,
        homeLocationId: (category === 'shoes' ? locs.find(l => l.type === 'rack') : locs[0])?.id, washGroup: defaultWashGroup(category),
        lastWorn: null, timesWornTotal: 0, notes: 'Imported from Toronto Fit',
      });
    } catch (e) { console.warn('Skipped old wardrobe item', e); }
  }
  await db.setSetting('migratedV1', true);
}

// Run the photo cleanup once on items saved before it existed (or imported), quietly in the background.
async function polishExisting() {
  const todo = (await db.all('items')).filter(i => !i.cleaned && (i.original || i.photo));
  if (!todo.length) return;
  toast(`Polishing ${todo.length} photo${todo.length > 1 ? 's' : ''}…`);
  for (const it of todo) {
    try {
      const r = await cleanPhoto(it.original || it.photo);
      const cur = await db.get('items', it.id); if (!cur) continue;
      await db.put('items', { ...cur, original: r.original, photo: r.photo, thumb: r.thumb, cleaned: r.cleaned, updatedAt: Date.now() });
    } catch (e) { console.warn('Polish skipped', e); }
  }
  toast('Photos polished');
  if (/^#(closet|today|item|laundry)?/.test(location.hash)) route();
}

(async () => {
  try { await migrate(); } catch (e) { console.warn('Migration skipped', e); }
  setUnits(await db.getSetting('units', 'C'));
  await route();
  replayLogo($('#brand'));
  await maybeOnboard(route);
  setTimeout(() => polishExisting().catch(e => console.warn(e)), 2500);
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
