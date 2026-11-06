// Shop tab: gap chips, Canadian store grid (saved stores), catalog products from products.js.
import * as db from './db.js';
import { GAPS } from './model.js';
import { icon, esc, $, opts, toast } from './ui.js';

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

let limit = 24;
export async function renderShop(main, params) {
  const gap = GAPS[params.get('gap')] ? params.get('gap') : '';
  const [gaps, savedStores, savedProducts, gender, products] = await Promise.all([
    db.getSetting('gaps', []), db.getSetting('savedStores', []), db.getSetting('savedProducts', {}),
    db.getSetting('shopGender', 'all'), loadProducts()]);
  const chipGaps = [...new Set([...gaps, ...(gap ? [gap] : [])])];
  const stores = [...STORES].sort((a, b) => savedStores.includes(b[0]) - savedStores.includes(a[0]));
  const match = gap ? products.filter(p => GAPS[gap][1](p) && (gender === 'all' || p.g === gender || p.g === 'u' || p.g === 'unknown'))
    .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)) : [];
  const seen = new Set(), list = match.filter(p => { const k = p.brand + p.name; return !seen.has(k) && seen.add(k); });
  const saved = Object.values(savedProducts);
  const label = gap ? GAPS[gap][0] : '';

  main.innerHTML = `<h1 class="h1">Only what you're missing.</h1>
    <p class="note">Preview — affiliate partnerships pending</p>
    <div class="chips">${chipGaps.map(g => `<a class="chip ${g === gap ? 'on' : 'coral'}" href="#shop?gap=${esc(g)}">${esc(GAPS[g]?.[0] || g)}</a>`).join('')}
      ${gap ? '<a class="chip" href="#shop">Clear</a>' : ''}</div>
    <label class="field inline">I need…<select id="need"><option value="">Choose a piece</option>${opts(Object.entries(GAPS).map(([k, v]) => [k, v[0]]), gap)}</select></label>

    ${gap ? `<h2 class="h2">${esc(label)} <span class="muted">${list.length} from low to high</span></h2>
      <div class="grid products">${list.slice(0, limit).map(p => productCard(p, savedProducts)).join('')}
      ${secondHand(label)}</div>
      ${list.length > limit ? '<button class="btn ghost wide" id="more">Show more</button>' : ''}
      ${!list.length ? '<p class="muted">No catalog match yet. Try one of the stores below.</p>' : ''}` : ''}

    <h2 class="h2">Stores</h2>
    <div class="stores">${stores.map(([n, dom, url, tag]) => `<div class="store">
      <a href="${esc(url)}" ${REL}><span class="logo"><img src="https://www.google.com/s2/favicons?domain=${esc(dom)}&sz=128" alt="" loading="lazy"><b hidden>${esc(n[0])}</b></span>
      <span>${esc(n)}</span>${tag ? `<span class="muted small">${tag}</span>` : ''}</a>
      <button class="heart${savedStores.includes(n) ? ' on' : ''}" data-store="${esc(n)}" aria-pressed="${savedStores.includes(n)}" aria-label="Save ${esc(n)}">${icon('heart', 20)}</button></div>`).join('')}</div>

    ${saved.length ? `<h2 class="h2">Saved products <span class="muted">${saved.length}</span></h2><div class="grid products">${saved.map(p => productCard(p, savedProducts)).join('')}</div>` : ''}
    ${products.length ? `<p class="muted small">${products.length} products · catalog checked ${esc(window.PRODUCTS_UPDATED || '')}. Prices may change; confirm at the retailer.</p>` : ''}`;

  $('#need').onchange = e => { limit = 24; location.hash = e.target.value ? '#shop?gap=' + e.target.value : '#shop'; };
  const more = $('#more'); if (more) more.onclick = () => { limit += 24; renderShop(main, params); };
  main.onclick = async e => {
    const b = e.target.closest('[data-store],[data-saveprod]'); if (!b) return;
    if (b.dataset.store) {
      const n = b.dataset.store, s = new Set(savedStores);
      s.has(n) ? s.delete(n) : s.add(n);
      await db.setSetting('savedStores', [...s]); toast(s.has(n) ? `Saved ${n}` : `Removed ${n}`);
    } else {
      const id = b.dataset.saveprod, p = products.find(x => x.id === id) || savedProducts[id];
      if (savedProducts[id]) delete savedProducts[id]; else if (p) savedProducts[id] = p;
      await db.setSetting('savedProducts', savedProducts);
    }
    renderShop(main, params);
  };
}

function productCard(p, saved) {
  return `<article class="pcard"><a href="${esc(p.url)}" ${REL}><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"></a>
    <div class="pbody"><span class="muted small">${esc(p.brand)}</span><a class="pname" href="${esc(p.url)}" ${REL}>${esc(p.name)}</a>
    <b>${p.priceVaries ? 'From ' : ''}${money(p.price)}</b>
    <button class="heart${saved[p.id] ? ' on' : ''}" data-saveprod="${esc(p.id)}" aria-pressed="${!!saved[p.id]}" aria-label="Save ${esc(p.name)}">${icon('heart', 18)}</button></div></article>`;
}
function secondHand(label) {
  const q = encodeURIComponent(label.toLowerCase());
  return `<article class="pcard second"><div class="pbody"><span class="muted small">Second-hand option</span><b>Find a used ${esc(label.toLowerCase())}</b>
    <p class="small">Cheaper and lower-waste.</p>
    <a class="btn ghost sm" href="https://www.valuevillage.com/" ${REL}>Value Village ↗</a>
    <a class="btn ghost sm" href="https://www.facebook.com/marketplace/toronto/search?query=${q}" ${REL}>Marketplace ↗</a></div></article>`;
}
