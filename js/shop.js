// Shop tab: "Showing men's · Smart casual" line, "Recommended for you" (closet, style, weather, stops, Today gaps)
// as 2-column product grids, "I need…", store tiles with local logos, hearts, Saved view.
// "Shop for" is a hard filter on every product list (model.shopFits); fit, formality and colours rank.
import * as db from './db.js';
import { GAPS, FORMALITY_LABEL, toggleHeart, recommend, shopFits } from './model.js';
import { icon, esc, $, $$, opts, header, heartBurst, stagger } from './ui.js';
import { getForecast, todayStr } from './weather.js';
import { markSaved } from './sync.js';

// [name, link, logo file in assets/stores/, tag]. Logos downloaded once (Wikimedia, else the store's own site) and served locally.
export const STORES = [
  ["Mark's", 'https://www.marks.com/en.html', 'marks.png'],
  ['Sport Chek', 'https://www.sportchek.ca/en.html', 'sportchek.svg'],
  ['Pro Hockey Life', 'https://www.prohockeylife.com/', 'prohockeylife.png'],
  ['Roots', 'https://www.roots.com/ca/en/', 'roots.svg'],
  ['Old Navy', 'https://oldnavy.gapcanada.ca/', 'oldnavy.svg'],
  ['Gap', 'https://www.gapcanada.ca/', 'gap.svg'],
  ['Simons', 'https://www.simons.ca/en', 'simons.svg'],
  ['Nike', 'https://www.nike.com/ca/', 'nike.svg'],
  ['Lululemon', 'https://shop.lululemon.com/en-ca/', 'lululemon.svg'],
  ['Uniqlo', 'https://www.uniqlo.com/ca/en/', 'uniqlo.svg'],
  ['Winners', 'https://www.winners.ca/en', 'winners.svg'],
  ['Value Village', 'https://www.valuevillage.com/', 'valuevillage.png', 'Second-hand'],
  ['Aritzia', 'https://www.aritzia.com/en/home', 'aritzia.svg'],
  ['H&M', 'https://www2.hm.com/en_ca/index.html', 'hm.svg'],
  ['Zara', 'https://www.zara.com/ca/', 'zara.svg'],
  ['Joe Fresh', 'https://www.joefresh.com/ca', 'joefresh.svg'],
  ['RW&CO', 'https://www.rw-co.com/en/', 'rwco.svg'],
  ['Garage', 'https://www.garageclothing.com/ca/', 'garage.png'],
  ['Dynamite', 'https://www.dynamiteclothing.com/ca/', 'dynamite.svg'],
  ['Ardene', 'https://www.ardene.com/ca/en/', 'ardene.svg'],
  ['American Eagle', 'https://www.ae.com/ca/en', 'americaneagle.svg'],
  ['Urban Outfitters', 'https://www.urbanoutfitters.com/en-ca/', 'urbanoutfitters.svg'],
  ["Levi's", 'https://www.levi.com/CA/en_CA/', 'levis.svg'],
  ['Adidas', 'https://www.adidas.ca/en', 'adidas.svg'],
  ['MEC', 'https://www.mec.ca/en', 'mec.svg'],
  ['Atmosphere', 'https://www.atmosphere.ca/en.html', 'atmosphere.svg'],
  ["Arc'teryx", 'https://arcteryx.com/ca/en', 'arcteryx.svg'],
  ['Canada Goose', 'https://www.canadagoose.com/ca/en/home-page', 'canadagoose.svg'],
  ['Foot Locker', 'https://www.footlocker.ca/en/', 'footlocker.svg'],
  ['SoftMoc', 'https://www.softmoc.com/ca/', 'softmoc.png'],
  ['Walmart', 'https://www.walmart.ca/en', 'walmart.svg'],
  ['Reitmans', 'https://www.reitmans.com/en/', 'reitmans.svg'],
];
const REL = 'target="_blank" rel="noopener sponsored"';
const money = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
const SHOW = 4; // products per section before "Show all"
const FOR_LABEL = { all: 'everyone', m: 'men’s', w: 'women’s' };

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

const expanded = new Set();
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
  if (focus) sections = sections.filter(x => x.key === focus); // opened from a Today "Missing" link
  const savedList = Object.values(savedProducts).filter(p => shopFits(p, gender));
  const nSaved = savedStores.length + Object.keys(savedProducts).length;
  const showing = gender === 'all' ? 'Showing everyone’s' : `Showing ${FOR_LABEL[gender]}`;

  main.innerHTML = header(showSaved ? 'Saved' : 'Shop', {
    back: showSaved ? ['#shop', 'Shop'] : null,
    right: showSaved ? '' : `<a class="icon-btn" href="#shop?saved=1" aria-label="Saved (${nSaved})">${icon('heart', 22)}<span class="badge" ${nSaved ? '' : 'hidden'}>${nSaved}</span></a>`,
  }) + `<div class="content">
    <p class="shop-for">${esc(showing)} · ${esc(FORMALITY_LABEL[style.formality || 'casual'])} <a href="#me/style">Edit</a></p>
    ${focus ? `<div class="chips"><a class="chip on" href="#shop">${esc(GAPS[focus][0])} ${icon('x', 16)}</a></div>` : ''}
    ${showSaved ? `
      ${savedList.length ? `<h2 class="h2">Products</h2><div class="pgrid" data-stagger>${savedList.map(p => productCard(p, savedProducts)).join('')}</div>` : ''}
      ${savedStores.length ? `<h2 class="h2">Stores</h2><div class="stores">${STORES.filter(s => savedStores.includes(s[0])).map(s => storeTile(s, savedStores)).join('')}</div>` : ''}
      ${nSaved ? '' : '<div class="empty"><p>Tap a heart on any product or store to keep it here.</p></div>'}` : `
    <h2 class="h2">Recommended for you</h2>
    <div data-stagger>${sections.map(x => `<section class="rec" id="rec-${esc(x.key)}">
      <div class="sec-head"><h3 class="h3">${esc(x.label)}${x.gap && !manual.includes(x.key) ? ' <span class="tag">For today</span>' : ''}</h3>
        ${manual.includes(x.key) ? `<button class="icon-btn bare" data-rmgap="${esc(x.key)}" aria-label="Remove ${esc(x.label)}">${icon('x', 20)}</button>` : ''}</div>
      <div class="pgrid">${x.list.slice(0, expanded.has(x.key) || focus ? 12 : SHOW).map(p => productCard(p, savedProducts)).join('')}</div>
      ${x.list.length > SHOW && !expanded.has(x.key) && !focus ? `<button class="btn ghost wide sm" data-more="${esc(x.key)}">Show all ${x.list.length}</button>` : ''}
      ${x.secondHand ? secondHand(x.label) : ''}</section>`).join('')
      || `<p class="sub">${focus ? `No ${esc(GAPS[focus][0].toLowerCase())} in the catalog yet. Try a store below.` : 'Nothing to recommend yet.'}</p>`}</div>
    <label class="field">I need…<select id="need"><option value="">Choose a piece</option>${opts(Object.entries(GAPS).filter(([k]) => !needs.includes(k)).map(([k, v]) => [k, v[0]]))}</select></label>
    <h2 class="h2">Stores</h2>
    <div class="stores">${[...STORES].sort((a, b) => savedStores.includes(b[0]) - savedStores.includes(a[0])).map(s => storeTile(s, savedStores)).join('')}</div>
    <p class="sub small" style="margin-top:16px">Preview — affiliate partnerships pending. ${products.length ? `Catalog checked ${esc(window.PRODUCTS_UPDATED || '')}. Prices may change; confirm at the retailer.` : ''}</p>`}
    </div>`;

  const need = $('#need');
  if (need) need.onchange = async e => {
    if (!e.target.value) return;
    await db.setSetting('manualGaps', [...new Set([...manual, e.target.value])]);
    location.hash = '#shop?gap=' + e.target.value;
  };
  main.onclick = async e => {
    const more = e.target.closest('[data-more]');
    if (more) { expanded.add(more.dataset.more); return renderShop(main, params).then(() => stagger(main)); }
    const rm = e.target.closest('[data-rmgap]');
    if (rm) { await db.setSetting('manualGaps', manual.filter(g => g !== rm.dataset.rmgap)); location.hash = '#shop'; return renderShop(main, new URLSearchParams()); }
    const b = e.target.closest('.heart'); if (!b) return;
    const { kind, key } = b.dataset;
    const on = !b.classList.contains('on');
    // Same item can show twice; update every copy in place so the pop animation isn't lost to a re-render.
    $$(`.heart[data-kind="${kind}"][data-key="${CSS.escape(key)}"]`, main).forEach(h => { h.classList.toggle('on', on); h.setAttribute('aria-pressed', on); });
    heartBurst(b);
    if (kind === 'store') await db.setSetting('savedStores', toggleHeart(await db.getSetting('savedStores', []), key));
    else {
      const sp = await db.getSetting('savedProducts', {});
      const p = products.find(x => x.id === key) || sp[key];
      if (sp[key]) delete sp[key]; else if (p) sp[key] = p;
      await db.setSetting('savedProducts', sp);
    }
    await markSaved(kind, key);
    const n = (await db.getSetting('savedStores', [])).length + Object.keys(await db.getSetting('savedProducts', {})).length;
    const c = $('.hdr .badge', main); if (c) { c.hidden = !n; c.textContent = n; }
  };
}

const heart = (kind, key, on, label) => `<button class="heart${on ? ' on' : ''}" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="${on}" aria-label="Save ${esc(label)}">${icon('heart', 22)}</button>`;
function storeTile([n, url, logo, tag], saved) {
  return `<div class="store"><a href="${esc(url)}" ${REL}><span class="logo"><img src="assets/stores/${esc(logo)}" alt="${esc(n)} logo" loading="lazy"></span>
    <span class="sname">${esc(n)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</a>${heart('store', n, saved.includes(n), n)}</div>`;
}
// Saved products can come from imports or sync, so only https links/images reach the page (blocks javascript: etc).
const https = u => { try { return new URL(u).protocol === 'https:' ? u : ''; } catch { return ''; } };
function productCard(p, saved) {
  const url = https(p.url) || '#', img = https(p.img);
  return `<article class="pcard"><a class="pimg" href="${esc(url)}" ${REL}><img src="${esc(img)}" alt="" loading="lazy"></a>
    ${heart('prod', p.id, !!saved[p.id], p.name)}
    <div class="pb"><span class="brandname">${esc(p.brand)}</span><a class="pname" href="${esc(url)}" ${REL}>${esc(p.name)}</a>
    <b>${p.priceVaries ? 'From ' : ''}${money(p.price)}</b></div></article>`;
}
function secondHand(label) {
  const q = encodeURIComponent(label.toLowerCase());
  return `<div class="second"><span>${icon('arrow-back-up', 20)} Or find a used ${esc(label.toLowerCase())}</span>
    <span class="row nowrap"><a class="btn ghost sm" href="https://www.valuevillage.com/" ${REL}>Value Village</a>
    <a class="btn ghost sm" href="https://www.facebook.com/marketplace/toronto/search?query=${q}" ${REL}>Marketplace</a></span></div>`;
}
