// Shared UI helpers + inline SVG icon set (stroke icons, 24px grid).
const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  closet: '<path d="M12 7V6a2 2 0 1 1 2 2c-1 0-2 .6-2 1.5L3 17h18z"/>',
  laundry: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h.01M11 6h2"/>',
  shop: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 1-4 0"/>',
  shuffle: '<path d="M4 7h4l8 10h4M4 17h4l8-10h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  swap: '<path d="M7 4L4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
};
export const icon = (name, size = 24) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
export const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');

let units = 'C';
export const setUnits = u => { units = u; };
export const temp = c => c == null || isNaN(c) ? '--°' : units === 'F' ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C';

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

// Object URLs for photo Blobs, cached per item+version so lists don't leak.
const urls = new Map();
export function blobUrl(item, field = 'thumb') {
  const b = item?.[field]; if (!b) return '';
  const k = `${item.id}:${field}:${item.updatedAt}`;
  if (!urls.has(k)) urls.set(k, URL.createObjectURL(b));
  return urls.get(k);
}

// Bottom sheet / full modal. Returns the panel element; close() removes it.
export function sheet(html, { full = false, onClose } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap' + (full ? ' full' : '');
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="sheet-x" data-close aria-label="Close">${icon('x')}</button>${html}</div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) closeSheet(); });
  wrap._onClose = onClose;
  document.body.append(wrap);
  $('.sheet', wrap).querySelector('button,input,select')?.focus({ preventScroll: true });
  return $('.sheet', wrap);
}
export function closeSheet() {
  const w = $('.sheet-wrap'); if (!w) return;
  w._onClose?.(); w.remove();
}
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Two-tap destructive confirm, no blocking browser dialog.
export function confirmTap(btn, label = 'Tap again to confirm') {
  if (btn.dataset.armed) return true;
  const old = btn.innerHTML;
  btn.dataset.armed = '1'; btn.classList.add('danger'); btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('danger'); btn.innerHTML = old; }, 3500);
  return false;
}
export const statusLabel = { clean: 'Clean', worn: 'Worn', hamper: 'Needs washing', washing: 'Washing', drying: 'Drying' };
