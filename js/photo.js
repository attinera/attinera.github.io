// Pure photo-cleanup math (no DOM), so `node js/check.mjs` can test it.

// Square crop around the item. alpha: Uint8Array mask (0-255) or null.
// No mask, or an empty mask -> centred square of the whole image (the fallback path).
export function cropBox(alpha, w, h, pad = 0.08) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  if (alpha) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) { // fallback
    const size = Math.min(w, h);
    return { x: (w - size) / 2, y: (h - size) / 2, size, item: null };
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const size = Math.max(bw, bh) * (1 + 2 * pad);
  return { x: x0 + bw / 2 - size / 2, y: y0 + bh / 2 - size / 2, size, item: { x0, y0, x1, y1 } };
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
function percentile(hist, total, p) {
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * p) return i; }
  return 255;
}

// Gray-world white balance (gains clamped so a one-colour garment isn't washed grey),
// auto-levels on luminance (1st/99th percentile), +8% saturation. Mutates `px` (RGBA).
// stats: RGBA pixels to measure (usually the whole original photo).
export function lightingFix(px, stats = px) {
  let r = 0, g = 0, b = 0, n = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < stats.length; i += 4) {
    r += stats[i]; g += stats[i + 1]; b += stats[i + 2]; n++;
    hist[Math.round(lum(stats[i], stats[i + 1], stats[i + 2]))]++;
  }
  if (!n) return px;
  const avg = (r + g + b) / (3 * n);
  const gain = c => Math.min(1.15, Math.max(0.85, avg / Math.max(1, c / n)));
  const gr = gain(r), gg = gain(g), gb = gain(b);
  const lo = percentile(hist, n, 0.01), hi = Math.max(lo + 1, percentile(hist, n, 0.99));
  const scale = 255 / (hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    let R = (px[i] * gr - lo) * scale, G = (px[i + 1] * gg - lo) * scale, B = (px[i + 2] * gb - lo) * scale;
    const L = lum(R, G, B);
    R = L + (R - L) * 1.08; G = L + (G - L) * 1.08; B = L + (B - L) * 1.08;
    px[i] = R; px[i + 1] = G; px[i + 2] = B; // Uint8ClampedArray clamps to 0-255
  }
  return px;
}

// Light unsharp mask: px + amount * (px - box3x3(px)). Mutates `px` (RGBA, w x h).
export function unsharp(px, w, h, amount = 0.35) {
  const src = px.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[i + (dy * w + dx) * 4 + c];
      px[i + c] = src[i + c] + amount * (src[i + c] - s / 9);
    }
  }
  return px;
}
