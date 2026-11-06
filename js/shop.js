// Shop tab: "You're missing" gap cards (Today gaps + "I need…"), store row, hearts on stores/products, Saved view.
import * as db from './db.js';
import { GAPS } from './model.js';
import { icon, esc, $, $$, opts, toast, band, heartBurst, stagger } from './ui.js';
import { toggleHeart } from './model.js';

export const STORES = [
  ["Mark's", 'marks.com', 'https://www.marks.com/en.html'],
  ['Sport Chek', 'sportchek.ca', 'https://www.sportchek.ca/en.html'],
  ['Pro Hockey Life', 'prohockeylife.com', 'https://www.prohockeylife.com/'],
  ['Roots', 'roots.com', 'https://www.roots.com/ca/en/'],
  ['Old Navy', 'oldnavy.gapcanada.ca', 'https://oldnavy.gapcanada.ca/'],
  ['Gap', 'gapcanada.ca', 'https://www.gapcanada.ca/'],
  ['Simons', 'simons.ca', 'https://www.simons.ca/en'],
  ['Nike', 'nike.com', 'https://www.nike.com/ca/'],
  ['Lululemon', 'lululemon.com', 'https://shop.lululemon.com/en-ca/'],
  ['Uniqlo', 'uniqlo.com', 'https://www.uniqlo.com/ca/en/'],
  ['Winners', 'winners.ca', 'https://www.winners.ca/en'],
  ['Value Village', 'valuevillage.com', 'https://www.valuevillage.com/', 'Second-hand'],
];
const REL = 'target="_blank" rel="noopener sponsored"';
const money = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

// products.js is ~700 KB, so only load it when Shop opens.
let productsP;
const loadProducts = () => productsP ??= new Promise(res => {
  if (window.PRODUCTS) return res(window.PRODUCTS);
  const s = document.createElement('script');
  s.src = 'products.js';
  s.onload = () => res(window.PRODUCTS || []);
  s.onerror = () => res([]);
  document.head.append(s);
});


const PER_GAP = 12;
export async function renderShop(main, params) {
  const focus = GAPS[params.get('gap')] ? params.get('gap') : '';
  const showSaved = params.get('saved') === '1';
  const [gaps, manual, savedStores, savedProducts, gender, products] = await Promise.all([
    db.getSetting('gaps', []), db.getSetting('manualGaps', []), db.getSetting('savedStores', []), db.getSetting('savedProducts', {}),
    db.getSetting('shopGender', 'all'), loadProducts()]);
  const list = [...new Set([...(focus ? [focus] : []), ...gaps, ...manual])].filter(g => GAPS[g]);
  const nSaved = savedStores.length + Object.keys(savedProducts).length;
  const matches = g => {
    const seen = new Set();
    return products.filter(p => GAPS[g][1](p) && (gender === 'all' || p.g === gender || p.g === 'u' || p.g === 'unknown'))
      .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
      .filter(p => { const k = p.brand + p.name; return !seen.has(k) && seen.add(k); });
  };
  const storeTile = ([n, dom, url, tag]) => `<div class="store">
    <a href="${esc(url)}" ${REL}><span class="logo"><img src="https://www.google.com/s2/favicons?domain=${esc(dom)}&sz=128" alt="" loading="lazy"><b hidden>${esc(n[0])}</b></span>
    <span>${esc(n)}</span>${tag ? `<span class="sub small">${tag}</span>` : ''}</a>${heart('store', n, savedStores.includes(n), n)}</div>`;

  main.innerHTML = band('Shop', 'Only what you\'re missing') + `<div class="content">
    <div class="chips scroll"><a class="chip" href="${showSaved ? '#shop' : '#shop?saved=1'}" aria-pressed="${showSaved}">${icon('heart', 18)}Saved<span class="count" ${nSaved ? '' : 'hidden'}>${nSaved}</span></a></div>
    <p class="prev-note" style="margin-top:8px">Preview — affiliate partnerships pending</p>
    ${showSaved ? `<h2 class="h2">Saved</h2>
      ${savedStores.length ? `<div class="stores">${STORES.filter(s => savedStores.includes(s[0])).map(storeTile).join('')}</div>` : ''}
      ${Object.keys(savedProducts).length ? `<div class="grid" data-stagger style="margin-top:12px">${Object.values(savedProducts).map(p => productCard(p, savedProducts)).join('')}</div>` : ''}
      ${nSaved ? '' : '<p class="sub">Tap a heart on any store or product to keep it here.</p>'}` : `
    <h2 class="h2">You're missing</h2>
    <div data-stagger>${list.map(g => { const m = matches(g); return `<div class="card gap-card${g === focus ? ' focus' : ''}" id="gap-${esc(g)}">
      <div class="between"><b>${esc(GAPS[g][0])}</b>${manual.includes(g) ? `<button class="icon-btn bare" data-rmgap="${esc(g)}" aria-label="Remove ${esc(GAPS[g][0])}">${icon('x', 18)}</button>` : `<span class="sub small">${m.length} found</span>`}</div>
      <div class="hscroll">${m.slice(0, PER_GAP).map(p => productCard(p, savedProducts)).join('')}${secondHand(GAPS[g][0])}</div></div>`; }).join('')
      || '<p class="sub">Nothing missing for today. Need something anyway?</p>'}</div>
    <label class="field">I need…<select id="need"><option value="">Choose a piece</option>${opts(Object.entries(GAPS).filter(([k]) => !list.includes(k)).map(([k, v]) => [k, v[0]]))}</select></label>
    <h2 class="h2">Stores</h2>
    <div class="stores">${[...STORES].sort((a, b) => savedStores.includes(b[0]) - savedStores.includes(a[0])).map(storeTile).join('')}</div>
    ${products.length ? `<p class="sub small" style="margin-top:16px">${products.length} products · catalog checked ${esc(window.PRODUCTS_UPDATED || '')}. Prices may change; confirm at the retailer.</p>` : ''}`}
    </div>`;
  if (focus) requestAnimationFrame(() => $('#gap-' + focus)?.scrollIntoView({ block: 'center' }));

  const need = $('#need');
  if (need) need.onchange = async e => {
    if (!e.target.value) return;
    await db.setSetting('manualGaps', [...new Set([...manual, e.target.value])]);
    location.hash = '#shop?gap=' + e.target.value;
  };
  main.onclick = async e => {
    const rm = e.target.closest('[data-rmgap]');
    if (rm) { await db.setSetting('manualGaps', manual.filter(g => g !== rm.dataset.rmgap)); return renderShop(main, new URLSearchParams()); }
    const b = e.target.closest('.heart'); if (!b) return;
    const { kind, key } = b.dataset;
    const on = !b.classList.contains('on');
    // Same item can show twice (gap card + saved); update every copy in place so the pop animation isn't lost to a re-render.
    $$(`.heart[data-kind="${kind}"][data-key="${CSS.escape(key)}"]`, main).forEach(h => { h.classList.toggle('on', on); h.setAttribute('aria-pressed', on); });
    heartBurst(b);
    if (kind === 'store') await db.setSetting('savedStores', toggleHeart(await db.getSetting('savedStores', []), key));
    else {
      const sp = await db.getSetting('savedProducts', {});
      const p = products.find(x => x.id === key) || sp[key];
      if (sp[key]) delete sp[key]; else if (p) sp[key] = p;
      await db.setSetting('savedProducts', sp);
    }
    const n = (await db.getSetting('savedStores', [])).length + Object.keys(await db.getSetting('savedProducts', {})).length;
    const c = $('.chip .count', main); c.hidden = !n; c.textContent = n;
  };
}

const heart = (kind, key, on, label) => `<button class="heart${on ? ' on' : ''}" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="${on}" aria-label="Save ${esc(label)}">${icon('heart', 22)}</button>`;
function productCard(p, saved) {
  return `<article class="pcard"><a class="pimg" href="${esc(p.url)}" ${REL}><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"></a>
    ${heart('prod', p.id, !!saved[p.id], p.name)}
    <div class="pb"><span class="brandname">${esc(p.brand)}</span><a href="${esc(p.url)}" ${REL}>${esc(p.name)}</a>
    <b>${p.priceVaries ? 'From ' : ''}${money(p.price)}</b></div></article>`;
}
function secondHand(label) {
  const q = encodeURIComponent(label.toLowerCase());
  return `<article class="pcard second"><span class="brandname">Second-hand</span><b>Find a used ${esc(label.toLowerCase())}</b>
    <a class="btn ghost sm" href="https://www.valuevillage.com/" ${REL}>Value Village</a>
    <a class="btn ghost sm" href="https://www.facebook.com/marketplace/toronto/search?query=${q}" ${REL}>Marketplace</a></article>`;
}
