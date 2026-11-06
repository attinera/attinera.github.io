// Tiny IndexedDB wrapper. Database `attinera` v1. Nothing leaves the device.
const STORES = ['items', 'locations', 'outfits'];
export const DEFAULT_LOCATIONS = [
  ['Closet rail', 'rail'], ['Dresser drawer 1', 'drawer'], ['Dresser drawer 2', 'drawer'],
  ['Shelf', 'shelf'], ['Shoe rack', 'rack'], ['Hooks', 'hook'],
].map(([name, type], order) => ({ id: 'loc' + order, name, type, order }));

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
export const all = store => run(store, 'readonly', s => s.getAll());
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
export const put = (store, obj) => run(store, 'readwrite', s => s.put(obj));
export const del = (store, id) => run(store, 'readwrite', s => s.delete(id));
export const clear = store => run(store, 'readwrite', s => s.clear());
export async function putMany(store, list) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    for (const x of list) tx.objectStore(store).put(x);
    tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error);
  });
}
export const getSetting = async (key, fallback) => (await get('settings', key))?.value ?? fallback;
export const setSetting = (key, value) => put('settings', { key, value });
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
