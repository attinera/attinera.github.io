// Tiny IndexedDB wrapper. Database `attinera` v1: the local cache (works offline, with or without an account).
// Deletes are soft: the row becomes a small tombstone {id, _deleted, updatedAt} so sync can pass the delete on.
// all()/get() hide tombstones, so callers never see them. Every write fires `attinera:dirty` for sync.
const STORES = ['items', 'locations', 'outfits'];
export const DEFAULT_LOCATIONS = [
  ['Closet rail', 'rail'], ['Dresser drawer 1', 'drawer'], ['Dresser drawer 2', 'drawer'],
  ['Shelf', 'shelf'], ['Shoe rack', 'rack'], ['Hooks', 'hook'],
].map(([name, type], order) => ({ id: 'loc' + order, name, type, order, updatedAt: 0 }));

let dbp;
function open() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('attinera', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) db.createObjectStore(s, { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
      const tx = r.transaction;
      for (const l of DEFAULT_LOCATIONS) tx.objectStore('locations').put(l);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
// Settings that only make sense on this device (never synced).
export const LOCAL_KEYS = /^(wx:|sync|migrated|onboarded|gaps$|photoPipeline)/;
const dirty = store => dispatchEvent(new CustomEvent('attinera:dirty', { detail: store }));
const live = x => x && !x._deleted;

export const allRaw = store => run(store, 'readonly', s => s.getAll());
export const all = async store => (await allRaw(store)).filter(live);
export const getRaw = (store, id) => run(store, 'readonly', s => s.get(id));
export const get = async (store, id) => { const x = await getRaw(store, id); return live(x) ? x : undefined; };
// Every normal write stamps updatedAt (sync compares it with _syncedMs). raw = sync's own writes, kept as given.
export const put = (store, obj, opt) => putMany(store, [obj], opt);
export async function putMany(store, list, { raw = false } = {}) {
  if (!list.length) return;
  const now = Date.now(), db = await open();
  await new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    for (const x of list) tx.objectStore(store).put(raw ? x : { ...x, updatedAt: now });
    tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error);
  });
  if (!raw) dirty(store);
}
// Soft delete (tombstone). Undo = restore() the original objects.
export const del = (store, id) => delMany(store, [id]);
export const delMany = (store, ids) => putMany(store, ids.map(id => ({ id, _deleted: true })));
// Bring deleted rows back: fresh timestamp beats the delete everywhere, photos upload again.
export const restore = (store, list) => putMany(store, list.map(x => ({ ...x, _syncedMs: null, _uploadedRev: null })));
export const purge = (store, id) => run(store, 'readwrite', s => s.delete(id));
export const clear = store => run(store, 'readwrite', s => s.clear());
export const getSetting = async (key, fallback) => (await run('settings', 'readonly', s => s.get(key)))?.value ?? fallback;
export async function setSetting(key, value) {
  await run('settings', 'readwrite', s => s.put({ key, value, updatedAt: Date.now() }));
  if (!LOCAL_KEYS.test(key)) dirty('settings');
}
export const putSettingRaw = rec => run('settings', 'readwrite', s => s.put(rec));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
