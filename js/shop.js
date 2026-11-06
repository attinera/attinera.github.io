// Shop tab: "Recommended for you" (closet, style, weather, stops, Today gaps), store row, hearts, Saved view.
import * as db from './db.js';
import { GAPS } from './model.js';
import { icon, esc, $, $$, opts, toast, band, heartBurst, stagger } from './ui.js';
import { toggleHeart, recommend } from './model.js';
import { getForecast, todayStr } from './weather.js';

// [name, domain, link, logo URL ('' = lettered tile), tag]. Logos: apple-touch-icon > Wikimedia > Google favicon > letter.
export const STORES = [
  ["Mark's", 'marks.com', 'https://www.marks.com/en.html', ''],
  ["Sport Chek", 'sportchek.ca', 'https://www.sportchek.ca/en.html', 'https://www.google.com/s2/favicons?domain=sportchek.ca&sz=128'],
  ["Pro Hockey Life", 'prohockeylife.com', 'https://www.prohockeylife.com/', 'https://www.google.com/s2/favicons?domain=prohockeylife.com&sz=128'],
  ["Roots", 'roots.com', 'https://www.roots.com/ca/en/', 'https://www.google.com/s2/favicons?domain=roots.com&sz=128'],
  ["Old Navy", 'oldnavy.gapcanada.ca', 'https://oldnavy.gapcanada.ca/', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Old_Navy_Logo.svg/330px-Old_Navy_Logo.svg.png'],
  ["Gap", 'gapcanada.ca', 'https://www.gapcanada.ca/', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/GAP_Logo.svg/330px-GAP_Logo.svg.png'],
  ["Simons", 'simons.ca', 'https://www.simons.ca/en', 'https://www.google.com/s2/favicons?domain=simons.ca&sz=128'],
  ["Nike", 'nike.com', 'https://www.nike.com/ca/', 'https://www.nike.com/apple-touch-icon.png'],
  ["Lululemon", 'lululemon.com', 'https://shop.lululemon.com/en-ca/', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Lululemon_Athletica_logo.svg/330px-Lululemon_Athletica_logo.svg.png'],
  ["Uniqlo", 'uniqlo.com', 'https://www.uniqlo.com/ca/en/', 'https://www.google.com/s2/favicons?domain=uniqlo.com&sz=128'],
  ["Winners", 'winners.ca', 'https://www.winners.ca/en', 'https://www.google.com/s2/favicons?domain=winners.ca&sz=128'],
  ["Value Village", 'valuevillage.com', 'https://www.valuevillage.com/', 'https://www.valuevillage.com/favicon.ico', 'Second-hand'],
  ["Aritzia", 'aritzia.com', 'https://www.aritzia.com/en/home', 'https://www.google.com/s2/favicons?domain=aritzia.com&sz=128'],
  ["H&M", 'hm.com', 'https://www2.hm.com/en_ca/index.html', 'https://www.google.com/s2/favicons?domain=hm.com&sz=128'],
  ["Zara", 'zara.com', 'https://www.zara.com/ca/', 'https://www.google.com/s2/favicons?domain=zara.com&sz=128'],
  ["Joe Fresh", 'joefresh.com', 'https://www.joefresh.com/ca', 'https://www.joefresh.com/ca/images/apple-touch-icon.png'],
  ["RW&CO", 'rw-co.com', 'https://www.rw-co.com/en/', 'https://www.google.com/s2/favicons?domain=rw-co.com&sz=128'],
  ["Garage", 'garageclothing.com', 'https://www.garageclothing.com/ca/', 'https://www.google.com/s2/favicons?domain=garageclothing.com&sz=128'],
  ["Dynamite", 'dynamiteclothing.com', 'https://www.dynamiteclothing.com/ca/', 'https://www.google.com/s2/favicons?domain=dynamiteclothing.com&sz=128'],
  ["Ardene", 'ardene.com', 'https://www.ardene.com/ca/en/', 'https://www.google.com/s2/favicons?domain=ardene.com&sz=128'],
  ["American Eagle", 'ae.com', 'https://www.ae.com/ca/en', 'https://www.google.com/s2/favicons?domain=ae.com&sz=128'],
  ["Urban Outfitters", 'urbanoutfitters.com', 'https://www.urbanoutfitters.com/en-ca/', 'https://www.google.com/s2/favicons?domain=urbanoutfitters.com&sz=128'],
  ["Levi's", 'levi.com', 'https://www.levi.com/CA/en_CA/', 'https://www.google.com/s2/favicons?domain=levi.com&sz=128'],
  ["Adidas", 'adidas.ca', 'https://www.adidas.ca/en', 'https://www.google.com/s2/favicons?domain=adidas.ca&sz=128'],
  ["MEC", 'mec.ca', 'https://www.mec.ca/en', 'https://www.mec.ca/favicons/apple-touch-icon.png'],
  ["Atmosphere", 'atmosphere.ca', 'https://www.atmosphere.ca/en.html', ''],
  ["Arc'teryx", 'arcteryx.com', 'https://arcteryx.com/ca/en', 'https://arcteryx.com/apple-touch-icon.png'],
  ["Canada Goose", 'canadagoose.com', 'https://www.canadagoose.com/ca/en/home-page', 'https://www.canadagoose.com/cdn/shop/t/43/assets/favicon.png?v=107036757834814679511793892504'],
  ["Foot Locker", 'footlocker.ca', 'https://www.footlocker.ca/en/', 'https://www.google.com/s2/favicons?domain=footlocker.ca&sz=128'],
  ["SoftMoc", 'softmoc.com', 'https://www.softmoc.com/ca/', 'https://www.softmoc.com/img/apple-touch-icon.png'],
  ["Walmart", 'walmart.ca', 'https://www.walmart.ca/en', 'https://www.google.com/s2/favicons?domain=walmart.ca&sz=128'],
  ["Reitmans", 'reitmans.com', 'https://www.reitmans.com/en/', 'https://www.google.com/s2/favicons?domain=reitmans.com&sz=128'],
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


export async function renderShop(main, params) {
  const focus = GAPS[params.get('gap')] ? params.get('gap') : '';
  const showSaved = params.get('saved') === '1';
  const [gaps, manual, savedStores, savedProducts, gender, products, items, style, wx, rec] = await Promise.all([
    db.getSetting('gaps', []), db.getSetting('manualGaps', []), db.getSetting('savedStores', []), db.getSetting('savedProducts', {}),
    db.getSetting('shopGender', 'all'), loadProducts(), db.all('items'), db.getSetting('style', {}), getForecast(), db.get('outfits', todayStr())]);
  const hours = wx?.hours[todayStr()] || [];
  const coldest = hours.length ? Math.min(...hours.filter(h => +h.time.slice(11, 13) >= 7).map(h => h.feels)) : 12;
  const rainMax = Math.max(0, ...hours.map(h => h.rain));
  const needs = [...new Set([...(focus ? [focus] : []), ...gaps, ...manual])];
  let sections = recommend({ products, items, style, gender, gaps: needs, stops: rec?.stops || [], coldest, rainMax });
  if (focus) sections = sections.filter(x => x.key === focus); // opened from a Today "Missing" chip
  const nSaved = savedStores.length + Object.keys(savedProducts).length;
  const storeTile = ([n, , url, logo, tag]) => `<div class="store">
    <a href="${esc(url)}" ${REL}><span class="logo">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<b ${logo ? 'hidden' : ''}>${esc(n[0])}</b></span>
    <span>${esc(n)}</span>${tag ? `<span class="sub small">${tag}</span>` : ''}</a>${heart('store', n, savedStores.includes(n), n)}</div>`;

  main.innerHTML = band('Shop', 'Picked for your closet') + `<div class="content">
    <div class="chips scroll"><a class="chip" href="${showSaved ? '#shop' : '#shop?saved=1'}" aria-pressed="${showSaved}">${icon('heart', 18)}Saved<span class="count" ${nSaved ? '' : 'hidden'}>${nSaved}</span></a>
      ${focus ? `<a class="chip on" href="#shop">${esc(GAPS[focus][0])} ${icon('x', 16)}</a>` : ''}</div>
    <p class="prev-note" style="margin-top:8px">Preview — affiliate partnerships pending</p>
    ${showSaved ? `<h2 class="h2">Saved</h2>
      ${savedStores.length ? `<div class="stores">${STORES.filter(s => savedStores.includes(s[0])).map(storeTile).join('')}</div>` : ''}
      ${Object.keys(savedProducts).length ? `<div class="grid" data-stagger style="margin-top:12px">${Object.values(savedProducts).map(p => productCard(p, savedProducts)).join('')}</div>` : ''}
      ${nSaved ? '' : '<p class="sub">Tap a heart on any store or product to keep it here.</p>'}` : `
    <h2 class="h2">Recommended for you</h2>
    <div data-stagger>${sections.map(x => `<div class="card gap-card${x.key === focus ? ' focus' : ''}" id="rec-${esc(x.key)}">
      <div class="between"><b>${esc(x.label)}</b>${manual.includes(x.key) ? `<button class="icon-btn bare" data-rmgap="${esc(x.key)}" aria-label="Remove ${esc(x.label)}">${icon('x', 18)}</button>`
        : x.gap ? '<span class="sub small">For today</span>' : ''}</div>
      <div class="hscroll">${x.list.map(p => productCard(p, savedProducts)).join('')}${x.secondHand ? secondHand(x.label) : ''}</div></div>`).join('')
      || `<p class="sub">${focus ? `No ${esc(GAPS[focus][0].toLowerCase())} in the catalog yet. Try a store below.` : 'Nothing to recommend yet.'}</p>`}</div>
    <label class="field">I need…<select id="need"><option value="">Choose a piece</option>${opts(Object.entries(GAPS).filter(([k]) => !needs.includes(k)).map(([k, v]) => [k, v[0]]))}</select></label>
    <h2 class="h2">Stores</h2>
    <div class="stores">${[...STORES].sort((a, b) => savedStores.includes(b[0]) - savedStores.includes(a[0])).map(storeTile).join('')}</div>
    ${products.length ? `<p class="sub small" style="margin-top:16px">${products.length} products · catalog checked ${esc(window.PRODUCTS_UPDATED || '')}. Prices may change; confirm at the retailer.</p>` : ''}`}
    </div>`;

  const need = $('#need');
  if (need) need.onchange = async e => {
    if (!e.target.value) return;
    await db.setSetting('manualGaps', [...new Set([...manual, e.target.value])]);
    location.hash = '#shop?gap=' + e.target.value;
  };
  main.onclick = async e => {
    const rm = e.target.closest('[data-rmgap]');
    if (rm) { await db.setSetting('manualGaps', manual.filter(g => g !== rm.dataset.rmgap)); location.hash = '#shop'; return renderShop(main, new URLSearchParams()); }
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
