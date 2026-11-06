// On-device photo analysis: CLIP (in a worker) for type/gender/formality/weight, canvas k-means for colours,
// and the cutout pipeline (RMBG-1.4 soft mask in a second worker -> trim -> plain white square). No other edits.
import { SUBTYPES, pickColours, categoryOf } from './model.js';
import { maskOk, feather, trimBox } from './photo.js';

const SETS = {
  subtype: Object.keys(SUBTYPES),
  gender: ["men's clothing", "women's clothing", 'unisex clothing'],
  formality: ['formal clothing', 'smart casual clothing', 'casual clothing'],
  weight: ['thick heavy winter clothing', 'medium weight clothing', 'thin lightweight summer clothing'],
};
const GENDER = { "men's clothing": 'mens', "women's clothing": 'womens' };
const FORMALITY = { 'formal clothing': 'formal', 'smart casual clothing': 'smart-casual', 'casual clothing': 'casual' };
const WEIGHT = { 'thick heavy winter clothing': 1, 'medium weight clothing': 0, 'thin lightweight summer clothing': -1 };

let worker = null, seq = 0;
const pending = new Map();
export let onProgress = null; // (pct) => void, set by the Add flow
export const setProgress = fn => { onProgress = fn; };
const files = {};

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      if (data.total) files[data.file] = [data.loaded, data.total];
      const v = Object.values(files), done = v.reduce((s, x) => s + x[0], 0), tot = v.reduce((s, x) => s + x[1], 0);
      if (tot) onProgress?.(Math.round(done / tot * 100));
      return;
    }
    const p = pending.get(data.id); if (!p) return;
    pending.delete(data.id);
    data.type === 'result' ? p.res(data) : p.rej(new Error(data.error));
  };
  worker.onerror = e => { for (const p of pending.values()) p.rej(e); pending.clear(); worker = null; };
  return worker;
}
const classify = (blob, force) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  try { getWorker().postMessage({ id, blob, sets: SETS, force }); } catch (e) { pending.delete(id); rej(e); }
});
const top = r => r.reduce((a, b) => b.score > a.score ? b : a);

export const modelReady = () => { try { return localStorage.getItem('attinera-ai-ready') === '1'; } catch { return false; } };

// Never throws: on AI failure returns colours only, with ai:false.
// Not clothing -> {notClothing:true, gate}; force=true ("Add anyway") skips the gate and tags anyway.
export async function analyze(blob, force = false) {
  const colours = await coloursOf(blob).catch(() => []);
  try {
    const { gate, out: r } = await classify(blob, force);
    try { localStorage.setItem('attinera-ai-ready', '1'); } catch {}
    if (!r) return { ai: true, notClothing: true, gate, colours };
    const st = top(r.subtype), g = top(r.gender), f = top(r.formality), w = top(r.weight);
    const base = SUBTYPES[st.label][2];
    return {
      ai: true, colours, subtype: st.label, category: categoryOf(st.label), confidence: st.score,
      gender: g.score >= 0.6 && GENDER[g.label] || 'unisex',
      formality: FORMALITY[f.label], warmth: Math.max(1, Math.min(5, base + WEIGHT[w.label])),
    };
  } catch (e) {
    console.warn('AI unavailable, manual tagging', e);
    return { ai: false, colours };
  }
}

// ---- image helpers
const bitmap = blob => createImageBitmap(blob, { imageOrientation: 'from-image' });
export async function resize(blob, max, quality = 0.8) {
  const bmp = await bitmap(blob), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}
async function coloursOf(blob) {
  const bmp = await bitmap(blob), N = 64;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // Border average of the whole photo = background estimate.
  ctx.drawImage(bmp, 0, 0, N, N);
  const full = ctx.getImageData(0, 0, N, N).data, border = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x > 1 && y > 1 && x < N - 2 && y < N - 2) continue;
    const i = (y * N + x) * 4; border[0] += full[i]; border[1] += full[i + 1]; border[2] += full[i + 2]; n++;
  }
  // Centre-crop 70%, downscale to 64x64, k-means.
  const w = bmp.width, h = bmp.height;
  ctx.clearRect(0, 0, N, N);
  ctx.drawImage(bmp, w * 0.15, h * 0.15, w * 0.7, h * 0.7, 0, 0, N, N);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, N, N).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  return pickColours(px, border.map(v => v / n));
}

// ---- cutout pipeline
let cutWorker = null;
const cutFiles = {};
const SLOW_MS = 20000; // removal slower than this (after the model has loaded) -> keep the original photo
const cutoutReady = () => { try { return localStorage.getItem('attinera-cutout-ready') === '1'; } catch { return false; } };
export const cleanupReady = () => modelReady() && cutoutReady();

// Soft mask (Uint8Array, 0-255, same size as blob) or throws.
function cutout(blob) {
  return new Promise((res, rej) => {
    cutWorker ??= new Worker(new URL('./cutout-worker.js', import.meta.url), { type: 'module' });
    const w = cutWorker, id = ++seq;
    let timer = null;
    const done = () => { clearTimeout(timer); w.removeEventListener('message', on); };
    const on = ({ data }) => {
      if (data.type === 'progress') {
        if (data.total) cutFiles[data.file] = [data.loaded, data.total];
        const v = Object.values(cutFiles), a = v.reduce((t, x) => t + x[0], 0), b = v.reduce((t, x) => t + x[1], 0);
        if (b) onProgress?.(Math.round(a / b * 100));
        return;
      }
      if (data.id !== id) return;
      if (data.type === 'start') {
        timer = setTimeout(() => { done(); w.terminate(); cutWorker = null; rej(new Error('too slow')); }, SLOW_MS);
      } else if (data.type === 'result') { done(); try { localStorage.setItem('attinera-cutout-ready', '1'); } catch {} res(data); }
      else { done(); rej(new Error(data.error)); }
    };
    w.addEventListener('message', on);
    w.onerror = e => { done(); cutWorker = null; rej(e); };
    w.postMessage({ id, blob });
  });
}

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const jpeg = (c, q = 0.9) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
const S = 1024;
export const makeThumb = blob => resize(blob, 256, 0.85);

// Photo -> { original: 1024 square JPEG, cutout: 1024 JPEG on white or null, colours, pick }.
// Never throws on the cutout: failure, >20 s, or a mask covering <10% / >95% keeps the original photo.
export async function cleanPhoto(blob, { noCutout = false } = {}) {
  const work = await resize(blob, 2048, 0.95); // ponytail: 2048px working size; full camera res only costs memory, output is 1024
  const bmp = await bitmap(work), W = bmp.width, H = bmp.height;
  const src = canvas(W, H), sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bmp, 0, 0); bmp.close?.();

  // Original: centred square crop, nothing else.
  const sq = Math.min(W, H), o = canvas(S, S), og = o.getContext('2d');
  og.drawImage(src, (W - sq) / 2, (H - sq) / 2, sq, sq, 0, 0, S, S);
  const original = await jpeg(o);

  let mask = null, reason = noCutout ? 'skipped' : '';
  if (!noCutout) {
    try {
      const r = await cutout(work);
      if (r.width !== W || r.height !== H) reason = 'size mismatch';
      else if (!maskOk(r.mask)) reason = 'mask coverage';
      else mask = feather(r.mask, W, H);
    } catch (e) { reason = e.message || 'failed'; }
    if (reason) console.warn('Cutout skipped:', reason);
  }
  if (!mask) return { original, cutout: null, colours: null, pick: 'original', reason };

  const img = sctx.getImageData(0, 0, W, H);
  for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i];
  sctx.putImageData(img, 0, 0);
  const box = trimBox(mask, W, H, 0.06), k = S / box.size;
  const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, S, S);
  g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
  g.drawImage(src, 0, 0);
  const cut = await jpeg(c);

  // Colours from item pixels only.
  const t = canvas(64, 64).getContext('2d', { willReadFrequently: true });
  t.drawImage(src, box.x, box.y, box.size, box.size, 0, 0, 64, 64);
  const d = t.getImageData(0, 0, 64, 64).data, px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  return { original, cutout: cut, colours: px.length > 40 ? pickColours(px, null) : null, pick: 'cutout', reason: '' };
}
