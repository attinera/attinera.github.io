// Web Worker: CLIP zero-shot image classification via Transformers.js (free, runs on-device).
// Model files download once from a public CDN, then come from the browser cache (works offline).
import { pipeline, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
let clf = null;
const load = () => clf ??= pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
  dtype: 'q8',
  progress_callback: e => postMessage({ type: 'progress', file: e.file, status: e.status, loaded: e.loaded, total: e.total }),
}).catch(err => { clf = null; throw err; });

onmessage = async ({ data }) => {
  try {
    const c = await load();
    const img = await RawImage.fromBlob(data.blob), out = {};
    // ponytail: one CLIP pass per label set (4 per photo); share one image embedding if this gets slow
    for (const [k, labels] of Object.entries(data.sets)) out[k] = await c(img, labels, { hypothesis_template: 'a photo of {}' });
    postMessage({ type: 'result', id: data.id, out });
  } catch (err) {
    postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
