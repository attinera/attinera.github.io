// App shell: hash router, tab bar/sidebar, + button, one-time migration from the old Toronto Fit prototype.
import * as db from './db.js';
import { icon, $, $$, setUnits } from './ui.js';
import { resize } from './ai.js';
import { defaultWashGroup } from './model.js';
import { renderToday } from './today.js';
import { renderCloset, renderItem, openAdd } from './closet.js';
import { renderLaundry } from './laundry.js';
import { renderShop } from './shop.js';
import { renderMe } from './settings.js';

const TABS = [['today', 'Today'], ['closet', 'Closet'], ['laundry', 'Laundry'], ['shop', 'Shop'], ['me', 'Me']];
const main = $('#view');

$('#tabs').innerHTML = TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}">${icon(k === 'today' ? 'today' : k)}<span>${l}</span></a>`).join('');
$('#fab').innerHTML = icon('plus', 30);
$('#fab').onclick = openAdd;
document.addEventListener('click', e => { if (e.target.closest('[data-add]')) openAdd(); });
// Store favicon failed -> show lettered fallback tile.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.closest('.logo')) { img.hidden = true; img.nextElementSibling.hidden = false; }
}, true);

async function route() {
  const [path, query = ''] = (location.hash.slice(1) || 'today').split('?');
  const [tab, id] = path.split('/');
  const active = tab === 'item' ? 'closet' : tab;
  $$('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === active ? 'page' : 'false'));
  main.onclick = main.onchange = main.oninput = main.onsubmit = null;
  try {
    if (tab === 'closet') await renderCloset(main);
    else if (tab === 'item') await renderItem(main, decodeURIComponent(id || ''));
    else if (tab === 'laundry') await renderLaundry(main);
    else if (tab === 'shop') await renderShop(main, new URLSearchParams(query));
    else if (tab === 'me') await renderMe(main);
    else await renderToday(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = '<p class="alert">Something went wrong loading this page. Try reloading.</p>';
  }
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
}
addEventListener('hashchange', route);

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

(async () => {
  try { await migrate(); } catch (e) { console.warn('Migration skipped', e); }
  setUnits(await db.getSetting('units', 'C'));
  await route();
  $('#splash')?.classList.add('gone');
  setTimeout(() => $('#splash')?.remove(), 500);
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
