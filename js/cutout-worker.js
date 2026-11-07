// Web Worker: background removal with briaai/RMBG-1.4 via Transformers.js, on-device.
// LICENCE NOTE: RMBG-1.4 is released for NON-COMMERCIAL use only. Fine for this student prototype;
// it must be replaced (or commercially licensed from BRIA) before any commercial launch.
import { AutoModel, AutoProcessor, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
let ready = null;
const progress = e => postMessage({ type: 'progress', file: e.file, loaded: e.loaded, total: e.total });
// WebGPU when the browser has it (seconds); WASM fallback (slower, may hit the 20 s limit -> original photo kept).
// Phones never load the fp32 model (~180 MB on the GPU can crash a phone tab): fp16 (~90 MB) when the GPU supports it,
// otherwise q8 on WASM (~45 MB, slower).
const model = async phone => {
  const opts = { config: { model_type: 'custom' }, progress_callback: progress };
  const gpu = self.navigator?.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  const dtype = !gpu ? null : !phone ? 'fp32' : gpu.features.has('shader-f16') ? 'fp16' : null;
  if (dtype) {
    try { return await AutoModel.from_pretrained('briaai/RMBG-1.4', { ...opts, device: 'webgpu', dtype }); } catch (e) { console.warn('WebGPU unavailable, using WASM', e); }
  }
  return AutoModel.from_pretrained('briaai/RMBG-1.4', { ...opts, dtype: 'q8' });
};
const load = phone => ready ??= Promise.all([
  model(phone),
  AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
    config: {
      do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2,
      rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 },
    },
  }),
]).catch(err => { ready = null; throw err; });

onmessage = async ({ data }) => {
  try {
    const [model, processor] = await load(data.phone);
    postMessage({ type: 'start', id: data.id }); // model loaded: the 20 s speed limit starts now
    const image = await RawImage.fromBlob(data.blob);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    // Soft alpha (0-255), resized to the photo's full size. Never thresholded.
    const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);
    postMessage({ type: 'result', id: data.id, mask: mask.data, width: mask.width, height: mask.height }, [mask.data.buffer]);
  } catch (err) {
    postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
