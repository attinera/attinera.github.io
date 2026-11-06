// App shell: hash router with view transitions, bottom tab bar (phone) / sidebar (laptop) with the centre + button,
// first-launch onboarding, one-time migrations, photo re-processing, optional account sync.
import * as db from './db.js';
import { icon, $, $$, setUnits, logoSvg, replayLogo, countUp, stagger, toast, confirmSheet, sheet, closeSheet } from './ui.js';
import { resize, cleanPhoto, makeThumb } from './ai.js';
import { defaultWashGroup } from './model.js';
import { renderToday } from './today.js';
import { renderCloset, renderItem, openAdd } from './closet.js';
import { renderLaundry } from './laundry.js';
import { renderShop } from './shop.js';
import { renderMe } from './settings.js';
import { maybeOnboard } from './onboarding.js';
import { initSync, accountsOn, setPassword } from './sync.js';

const TABS = [['today', 'Today'], ['closet', 'Closet'], ['laundry', 'Laundry'], ['shop', 'Shop'], ['me', 'Me']];
const main = $('#view');

$('#tabs').innerHTML = `<button class="brand side-only" id="brand" type="button" aria-label="Attinera. Tap to replay the logo">
    <span class="brand-mark">${logoSvg()}</span><span class="brand-word">Attinera</span></button>
  <button id="fab" class="fab" type="button" aria-label="Add clothes">${icon('plus', 28)}<span class="side-only">Add clothes</span></button>` +
  TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}" class="tab-${k}">${icon(k, 24)}<span>${l}</span></a>`).join('');
$('#brand').onclick = () => { replayLogo($('#brand')); if (location.hash && location.hash !== '#today') location.hash = '#today'; };
$('#fab').onclick = () => document.body.classList.contains('fab-open') ? $('.sheet-wrap [data-close]')?.click() : openAdd();
document.addEventListener('click', e => {
  if (e.target.closest('[data-add]')) openAdd();
  const logo = e.target.closest('[data-logo]'); if (logo) replayLogo(logo);
});

let lastTab = null;
async function route() {
  const [path, query = ''] = (location.hash.slice(1) || 'today').split('?');
  const [tab, id] = path.split('/');
  const active = tab === 'item' ? 'closet' : TABS.some(t => t[0] === tab) ? tab : 'today';
  const isSub = tab === 'item' || (tab === 'me' && id);
  $$('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === active ? 'page' : 'false'));
  main.onclick = main.onchange = main.oninput = main.onsubmit = null;
  main.ontouchstart = main.ontouchmove = main.ontouchend = null;
  $('.selbar')?.remove(); document.body.classList.remove('selecting');
  try {
    if (tab === 'closet') await renderCloset(main);
    else if (tab === 'item') await renderItem(main, decodeURIComponent(id || ''));
    else if (tab === 'laundry') await renderLaundry(main);
    else if (tab === 'shop') await renderShop(main, new URLSearchParams(query));
    else if (tab === 'me') await renderMe(main, id, new URLSearchParams(query));
    else await renderToday(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = '<div class="pad"><div class="card alert"><b>Something went wrong loading this page.</b></div></div>';
  }
  main.insertAdjacentHTML('beforeend', '<footer class="foot">© 2026 Attinera</footer>');
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
        id: 'old-' + old.id, createdAt: now, original: await resize(blob, 1024), thumb: await resize(blob, 256),
        category, subtype: old.cat === 'dress' ? 'dress' : '', gender: 'unisex', formality: FORM[old.style] || 'casual', colours: [],
        warmth: { 1: 1, 2: 3, 3: 5 }[old.warmth] || 3, seasons: [], waterproof: !!old.wp, status: 'clean', wearCount: 0, wearLimit: null,
        homeLocationId: (category === 'shoes' ? locs.find(l => l.type === 'rack') : locs[0])?.id, washGroup: defaultWashGroup(category),
        lastWorn: null, timesWornTotal: 0, notes: 'Imported from Toronto Fit',
      });
    } catch (e) { console.warn('Skipped old wardrobe item', e); }
  }
  await db.setSetting('migratedV1', true);
}

// Once: re-run every older photo through the new cutout pipeline (replaces the old "enhanced" pictures).
async function reprocessPhotos() {
  const todo = (await db.all('items')).filter(i => i.pipeline !== 2 && (i.original || i.photo));
  if (!todo.length) return;
  let n = 0;
  for (const it of todo) {
    toast(`Updating photos ${++n} of ${todo.length}…`);
    try {
      const r = await cleanPhoto(it.original || it.photo);
      const cur = await db.get('items', it.id); if (!cur) continue;
      const { photo, cleaned, ...rest } = cur;
      const pick = r.cutout ? 'cutout' : 'original';
      await db.put('items', { ...rest, original: r.original, cutout: r.cutout, pick, thumb: await makeThumb(r.cutout || r.original),
        pipeline: 2, photoRev: Date.now() });
    } catch (e) { console.warn('Photo update skipped', e); }
  }
  toast('Photos updated');
  if (/^#(closet|today|item|laundry)?/.test(location.hash) || !location.hash) route();
}

async function onMerge(n) {
  return confirmSheet(`Add your ${n} guest item${n === 1 ? '' : 's'} to your account?`,
    'They sync to your other devices. If you say no, they are removed from this device and your account’s closet loads instead.',
    `Add ${n} item${n === 1 ? '' : 's'}`, { danger: false });
}
function onRecovery() {
  const p = sheet(`<h2 class="h2">Set a new password</h2><form id="newPw" class="stack">
    <label class="field">New password<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>
    <button class="btn primary big wide">Save password</button></form>`);
  $('#newPw', p).onsubmit = async e => {
    e.preventDefault();
    const { error } = await setPassword(new FormData(e.target).get('pw'));
    if (error) return toast(error.message);
    closeSheet(); toast('Password updated');
  };
}

(async () => {
  try { await migrate(); } catch (e) { console.warn('Migration skipped', e); }
  setUnits(await db.getSetting('units', 'C'));
  await route();
  replayLogo($('#brand'));
  if (accountsOn) {
    addEventListener('attinera:pulled', async () => { setUnits(await db.getSetting('units', 'C')); route(); });
    addEventListener('attinera:account', () => route());
    initSync({ onMerge, onRecovery }).catch(e => console.warn('Sync unavailable', e));
  }
  await maybeOnboard(route);
  setTimeout(() => reprocessPhotos().catch(e => console.warn(e)), 2500);
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
