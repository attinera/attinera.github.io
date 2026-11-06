// Shared UI: Tabler icons, animated logo, sheets, toasts with Undo, motion helpers (transform/opacity only).
import { TABLER } from './icons.js';

const ALIAS = { today: 'sun', closet: 'hanger', laundry: 'wash-machine', shop: 'shopping-bag', me: 'user', image: 'photo', back: 'arrow-left', shuffle: 'arrows-shuffle', swap: 'arrows-exchange', pin: 'map-pin', drop: 'droplet' };
export const icon = (name, size = 24, cls = '') =>
  `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TABLER[ALIAS[name] || name] || TABLER['tag']}</svg>`;

// Storage-location icon per type (picked when a location is created).
export const LOC_ICON = { rail: 'hanger', drawer: 'box', shelf: 'stack-2', rack: 'shoe', hook: 'anchor', bin: 'archive', hamper: 'basket' };
export const locIcon = (type, size = 20) => icon(LOC_ICON[type] || 'map-pin', size);

// The ATTINERA hanger. .swing on the <g> = damped swing around the hook; .bar = coral crossbar redraw.
export const logoSvg = (cls = '', tile = true) => `<svg class="logo-svg ${cls}" viewBox="0 0 120 120" aria-hidden="true">
  ${tile ? '<rect width="120" height="120" rx="28" fill="#F7F7FF"/>' : ''}
  <g class="hang"><path d="M60 40 V33 C60 26 69 24 69 17 C69 11 64 8 60 8 C55 8 51 11 51 16" fill="none" stroke="#495867" stroke-width="7" stroke-linecap="round"/>
  <path d="M60 40 L22 98 M60 40 L98 98" fill="none" stroke="#577399" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="bar" pathLength="1" d="M36 76 H84" fill="none" stroke="#FE5F55" stroke-width="10" stroke-linecap="round"/></g></svg>`;
export const loader = (label = 'Loading') => `<span class="loader" role="status" aria-label="${label}">${logoSvg('swinging', false)}</span>`;
export function replayLogo(el) {
  const svg = el?.querySelector('.logo-svg'); if (!svg) return;
  svg.classList.remove('play'); void svg.getBoundingClientRect(); svg.classList.add('play');
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
export const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const haptic = () => { try { navigator.vibrate?.(15); } catch {} };

let units = 'C';
export const setUnits = u => { units = u; };
export const getUnits = () => units;
export const tempVal = c => units === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
export const temp = c => c == null || isNaN(c) ? '--°' : tempVal(c) + '°' + units;
// Number that counts up on load: <span data-count="13" data-suffix="°C">13°C</span>
export const countSpan = (n, suffix = '') => `<span data-count="${esc(n)}" data-suffix="${esc(suffix)}">${esc(n)}${esc(suffix)}</span>`;
export function countUp(root = document) {
  if (reduced()) return;
  for (const el of $$('[data-count]', root)) {
    const end = +el.dataset.count, suf = el.dataset.suffix || '';
    if (!Number.isFinite(end) || end === 0) continue;
    const t0 = performance.now(), dur = 650;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - (1 - p) ** 3;
      el.textContent = Math.round(end * e) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
// Stagger children of [data-stagger] (30-40 ms each). Call again to re-stagger after filtering.
export function stagger(root = document) {
  for (const box of $$('[data-stagger]', root)) {
    [...box.children].forEach((c, i) => { c.style.setProperty('--i', Math.min(i, 18)); c.classList.remove('in'); void c.offsetWidth; c.classList.add('in'); });
  }
}

export const band = (title, sub = '', right = '') =>
  `<header class="band"><div class="band-row"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div></header>`;

export function toast(msg, { undo } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="undo">Undo</button>' : ''}`;
  t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  if (undo) $('.undo', t).onclick = async () => { t.hidden = true; await undo(); };
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, undo ? 5000 : 2600);
}

// Object URLs for photo Blobs, cached per item+version so lists don't leak.
const urls = new Map();
export function blobUrl(item, field = 'thumb') {
  const b = item?.[field]; if (!b) return '';
  const k = `${item.id}:${field}:${item.updatedAt}`;
  if (!urls.has(k)) urls.set(k, URL.createObjectURL(b));
  return urls.get(k);
}

// Bottom sheet (springs up, backdrop fades). full = full-screen panel on phones.
export function sheet(html, { full = false, onClose, fab = false } = {}) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap' + (full ? ' full' : '');
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="Close">${icon('x')}</button>${html}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
  wrap._onClose = onClose;
  document.body.append(wrap);
  document.body.classList.toggle('fab-open', fab);
  return $('.sheet', wrap);
}
export function closeSheet(instant = false) {
  const w = $('.sheet-wrap:not(.closing)'); if (!w) return;
  w._onClose?.(); w._onClose = null;
  document.body.classList.remove('fab-open');
  if (instant || reduced()) return w.remove();
  w.classList.add('closing');
  setTimeout(() => w.remove(), 220);
}
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Confirm sheet for destructive actions. Resolves true/false.
export function confirmSheet(title, body, action) {
  return new Promise(res => {
    const p = sheet(`<h2 class="h2">${esc(title)}</h2><p>${esc(body)}</p>
      <div class="actions"><button class="btn coral wide" id="cfmYes">${esc(action)}</button><button class="btn ghost wide" data-close>Cancel</button></div>`,
    { onClose: () => res(false) });
    $('#cfmYes', p).onclick = () => { p.parentElement._onClose = null; closeSheet(); res(true); };
  });
}

// Horizontal swipe on an element (pointer events). dir: 1 = right, -1 = left.
export function swipe(el, onSwipe, threshold = 64) {
  let x0 = null, y0 = 0, dx = 0, locked = false;
  el.addEventListener('pointerdown', e => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; dx = 0; locked = false; });
  el.addEventListener('pointermove', e => {
    if (x0 == null) return;
    dx = e.clientX - x0;
    if (!locked && Math.abs(e.clientY - y0) > Math.abs(dx) && Math.abs(e.clientY - y0) > 8) { x0 = null; return; } // vertical scroll wins
    if (Math.abs(dx) > 8) { locked = true; el.setPointerCapture?.(e.pointerId); el.style.transition = 'none'; el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; }
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null; el.style.transition = '';
    if (locked && Math.abs(dx) >= threshold) {
      el.dataset.swiped = '1'; setTimeout(() => delete el.dataset.swiped, 50);
      el.style.transform = `translateX(${Math.sign(dx) * 120}%)`; el.style.opacity = '0';
      setTimeout(() => onSwipe(Math.sign(dx)), 180);
    } else el.style.transform = '';
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('click', e => { if (locked && Math.abs(dx) > 8) { e.preventDefault(); e.stopPropagation(); } }, true);
}

// Fly a picture from one element to another (e.g. new item -> Closet tab icon).
export function flyTo(src, target, url) {
  if (!src || !target || reduced()) return;
  const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
  const img = Object.assign(document.createElement('img'), { src: url, className: 'flyer', alt: '' });
  Object.assign(img.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.append(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  img.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.08)`, opacity: 0.2 }],
    { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)' }).onfinish = () => {
    img.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300 });
  };
}

// Heart pop + particle burst (filled state is CSS on .on).
export function heartBurst(btn) {
  haptic();
  if (reduced() || !btn.classList.contains('on')) return;
  btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  const r = btn.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('i'), a = i / 8 * Math.PI * 2;
    d.className = 'spark';
    Object.assign(d.style, { left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px' });
    document.body.append(d);
    d.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * 22}px), calc(-50% + ${Math.sin(a) * 22}px)) scale(.3)`, opacity: 0 }],
      { duration: 420, easing: 'ease-out' }).onfinish = () => d.remove();
  }
}
export const statusLabel = { clean: 'Clean', worn: 'Worn', hamper: 'Needs washing', washing: 'Washing', drying: 'Drying' };
