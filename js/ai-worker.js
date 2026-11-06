// Web Worker: CLIP zero-shot image classification via Transformers.js (free, runs on-device).
// Model files download once from a public CDN, then come from the browser cache (works offline).
import { pipeline, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
import { GATE_CLOTHING, GATE_OTHER, clothingVerdict } from './model.js';

env.allowLocalModels = false;
let clf = null;
const load = () => clf ??= pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
  dtype: 'q8',
  progress_callback: e => postMessage({ type: 'progress', file: e.file, status: e.status, loaded: e.loaded, total: e.total }),
}).catch(err => { clf = null; throw err; });

onmessage = async ({ data }) => {
  try {
    const c = await load();
    const img = await RawImage.fromBlob(data.blob);
    // Pass 1: is this clothing at all? Labels are full phrases, so no extra template.
    const gate = clothingVerdict(await c(img, [...GATE_CLOTHING, ...GATE_OTHER], { hypothesis_template: '{}' }));
    if (!gate.ok && !data.force) return postMessage({ type: 'result', id: data.id, gate, out: null });
    const out = {};
    // ponytail: one CLIP pass per label set (5 per photo); share one image embedding if this gets slow
    for (const [k, labels] of Object.entries(data.sets)) out[k] = await c(img, labels, { hypothesis_template: 'a photo of {}' });
    postMessage({ type: 'result', id: data.id, gate, out });
  } catch (err) {
    postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
