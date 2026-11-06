// Pure photo math for the cutout pipeline (no DOM), so `node js/check.mjs` can test it.
// No colour, lighting or sharpening changes anywhere: pixels pass through untouched.

// Share of the image the item covers, from the soft mask (0-255). 0..1.
export function coverage(alpha) {
  let s = 0;
  for (let i = 0; i < alpha.length; i++) s += alpha[i];
  return alpha.length ? s / (255 * alpha.length) : 0;
}

// Cutout only when the mask looks sane; otherwise keep the original photo.
export const maskOk = alpha => { const c = coverage(alpha); return c >= 0.10 && c <= 0.95; };

// 1px feather: 3x3 box blur of the soft mask (keeps it soft, never thresholds it). Returns a new Uint8ClampedArray.
export function feather(alpha, w, h) {
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        s += alpha[yy * w + xx]; n++;
      }
    }
    out[y * w + x] = s / n;
  }
  return out;
}

// Square box around the item (mask > 8 counts as item, so soft edges stay inside) plus `pad` on each side.
// No mask, or nothing in it: centred square of the whole image.
export function trimBox(alpha, w, h, pad = 0.06) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  if (alpha) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { const size = Math.min(w, h); return { x: (w - size) / 2, y: (h - size) / 2, size, item: null }; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, size = Math.max(bw, bh) * (1 + 2 * pad);
  return { x: x0 + bw / 2 - size / 2, y: y0 + bh / 2 - size / 2, size, item: { x0, y0, x1, y1 } };
}
