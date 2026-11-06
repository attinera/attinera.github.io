// Optional accounts + two-way sync with Supabase (free tier). IndexedDB stays the local cache: the app works
// offline and in guest mode exactly as before. Rule: last write wins on updatedAt; deletes are soft (deleted_at).
// Remote tables share one shape: (user_id, id, data jsonb, updated_at, deleted_at, synced_at). See supabase/setup.sql.
import * as db from './db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const accountsOn = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const SB_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const BUCKET = 'closet';
const BLOBS = ['original', 'cutout', 'thumb', 'photo'];
const LOCAL_ONLY = ['_syncedMs', '_uploadedRev', '_needPhotos', 'updatedAt', 'id'];
const SAVED_KEYS = new Set(['savedProducts', 'savedStores', 'savedTimes']); // hearts live in their own `saved` table

// ---- pure helpers (tested in check.mjs)
// What to do with a pulled row, given the local copy. Last write wins; ties keep local.
export function decide(local, remoteMs, remoteDeleted) {
  if (local && (local.updatedAt || 0) >= remoteMs) return 'skip';
  return remoteDeleted ? 'delete' : 'apply';
}
export const isDirty = x => (x.updatedAt || 0) !== (x._syncedMs ?? -1);
// Local row -> remote `data` (no blobs, no local bookkeeping).
export function toData(x) {
  const out = {};
  for (const [k, v] of Object.entries(x)) if (!LOCAL_ONLY.includes(k) && !BLOBS.includes(k) && k !== '_deleted') out[k] = v;
  return out;
}
// Hearts: local {savedStores:[names], savedProducts:{id:product}, savedTimes:{'store:x':ms}} <-> rows.
export function savedRows(stores, products, times) {
  const keys = new Set([...stores.map(s => 'store:' + s), ...Object.keys(products).map(p => 'prod:' + p), ...Object.keys(times)]);
  return [...keys].map(id => {
    const [kind, ...rest] = id.split(':'), key = rest.join(':');
    const on = kind === 'store' ? stores.includes(key) : !!products[key];
    return { id, on, updatedAt: times[id] || 0, data: { kind, key, ...(kind === 'prod' && products[key] ? { product: products[key] } : {}) } };
  });
}
export const relTime = ms => { const s = (Date.now() - ms) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ms).toLocaleDateString('en-CA'); };

// ---- client + status
let sb = null, user = null, status = { state: 'guest', at: 0, error: '' };
export const getUser = () => user;
export const getStatus = () => status;
const setStatus = s => { status = { ...status, ...s }; dispatchEvent(new CustomEvent('attinera:sync', { detail: status })); };
export function statusText() {
  if (!user) return 'Guest · this device only';
  if (!navigator.onLine || status.state === 'offline') return 'Offline — will sync';
  if (status.state === 'syncing') return 'Syncing…';
  if (status.state === 'error') return 'Sync paused — will retry';
  return status.at ? `Synced ${relTime(status.at)}` : 'Not synced yet';
}
export async function client() {
  if (!accountsOn) return null;
  if (sb) return sb;
  const { createClient } = await import(SB_ESM);
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return sb;
}
export const redirectUrl = () => location.origin + location.pathname;

// Start at app launch. onMerge(n) -> Promise<boolean>: ask "Add your n guest items to your account?"
export async function initSync({ onMerge, onRecovery } = {}) {
  if (!accountsOn) return;
  const c = await client();
  c.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => onRecovery?.(), 0);
    const next = session?.user || null;
    if (next?.id === user?.id) return;
    user = next;
    if (user) setTimeout(() => signedIn(onMerge), 0); // never await Supabase calls inside this callback
    else setStatus({ state: 'guest' });
  });
  if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
  addEventListener('attinera:dirty', () => schedule());
  addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(0); });
  setInterval(() => schedule(0), 60000);
}

async function signedIn(onMerge) {
  const c = await client(), prev = await db.getSetting('syncUser', null);
  await c.from('profiles').upsert({ id: user.id, email: user.email, updated_at: new Date().toISOString() }).then(() => {}, () => {});
  if (prev !== user.id) {
    const guest = (await db.all('items')).length;
    const keep = !guest || prev ? false : await onMerge?.(guest);
    if (prev || !keep) await wipeLocal();
    else await markAllDirty();
    for (const t of TABLES) await db.setSetting('syncPull:' + t, '1970-01-01T00:00:00Z');
    await db.setSetting('syncUser', user.id);
  }
  dispatchEvent(new Event('attinera:account'));
  schedule(0);
}

let timer = null, running = null, again = false;
export function schedule(ms = 2000) {
  if (!user) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (running) again = true; else running = syncNow().finally(() => { running = null; if (again) { again = false; schedule(0); } }); }, ms);
}
export const flush = () => running || (user ? syncNow() : Promise.resolve());

// ---- the sync pass: pull, then push. Each table on its own so one failure doesn't block the rest.
const TABLES = ['items', 'locations', 'outfits', 'settings', 'saved'];
async function syncNow() {
  if (!user) return;
  if (!navigator.onLine) return setStatus({ state: 'offline' });
  setStatus({ state: 'syncing' });
  const c = await client();
  try {
    let pulled = false;
    for (const t of TABLES) pulled = (await pull(c, t)) || pulled;
    await downloadMissingPhotos(c);
    for (const t of TABLES) await push(c, t);
    setStatus({ state: 'synced', at: Date.now(), error: '' });
    if (pulled) dispatchEvent(new Event('attinera:pulled'));
  } catch (e) {
    console.warn('Sync failed', e);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: String(e?.message || e) });
  }
}

async function pull(c, table) {
  const since = await db.getSetting('syncPull:' + table, '1970-01-01T00:00:00Z');
  let last = since, changed = false;
  for (;;) {
    const { data, error } = await c.from(table).select('*').gt('synced_at', last).order('synced_at').limit(500);
    if (error) throw error;
    for (const r of data) { changed = (await apply(table, r)) || changed; last = r.synced_at; }
    if (data.length < 500) break;
  }
  if (last !== since) await db.setSetting('syncPull:' + table, last);
  return changed;
}

async function apply(table, r) {
  const ms = Date.parse(r.updated_at), deleted = !!r.deleted_at;
  if (table === 'saved') return applySaved(r, ms, deleted);
  if (table === 'settings') {
    const local = await getSettingRec(r.id);
    if (decide(local, ms, deleted) === 'skip') return false;
    await db.putSettingRaw({ key: r.id, value: deleted ? undefined : r.data?.value, updatedAt: ms, _syncedMs: ms });
    return true;
  }
  const local = await db.getRaw(table, r.id), what = decide(local, ms, deleted);
  if (what === 'skip') return false;
  if (what === 'delete') { await db.putMany(table, [{ id: r.id, _deleted: true, updatedAt: ms, _syncedMs: ms }], { raw: true }); return true; }
  const row = { ...r.data, id: r.id, updatedAt: ms, _syncedMs: ms };
  if (table === 'items') {
    const same = local && !local._deleted && local.photoRev === row.photoRev && (local.original || local.cutout);
    if (same) { for (const k of BLOBS) if (local[k]) row[k] = local[k]; row._uploadedRev = local._uploadedRev; }
    else { row._needPhotos = true; row._uploadedRev = row.photoRev; }
  }
  await db.putMany(table, [row], { raw: true });
  return true;
}
const getSettingRec = async key => (await db.allRaw('settings')).find(s => s.key === key);

async function applySaved(r, ms, deleted) {
  const times = await db.getSetting('savedTimes', {});
  if ((times[r.id] || 0) >= ms) return false;
  const [stores, products] = await Promise.all([db.getSetting('savedStores', []), db.getSetting('savedProducts', {})]);
  const { kind, key, product } = r.data || {};
  if (kind === 'store') {
    const has = stores.includes(key);
    if (deleted && has) stores.splice(stores.indexOf(key), 1); else if (!deleted && !has) stores.push(key);
  } else if (deleted) delete products[key]; else if (product) products[key] = product;
  times[r.id] = ms;
  for (const [k, v] of [['savedStores', stores], ['savedProducts', products], ['savedTimes', times]]) await db.putSettingRaw({ key: k, value: v, updatedAt: ms, _syncedMs: ms });
  return true;
}

const iso = ms => new Date(ms || 0).toISOString();
async function push(c, table) {
  if (table === 'saved') return pushSaved(c);
  if (table === 'settings') {
    const recs = (await db.allRaw('settings')).filter(s => !db.LOCAL_KEYS.test(s.key) && !SAVED_KEYS.has(s.key) && isDirty(s));
    if (!recs.length) return;
    const { error } = await c.from('settings').upsert(recs.map(s => ({ user_id: user.id, id: s.key, data: { value: s.value ?? null },
      updated_at: iso(s.updatedAt), deleted_at: s.value === undefined ? iso(s.updatedAt) : null })), { onConflict: 'user_id,id' });
    if (error) throw error;
    for (const s of recs) await markSynced('settings', s);
    return;
  }
  const rows = (await db.allRaw(table)).filter(isDirty);
  if (!rows.length) return;
  if (table === 'items') for (const it of rows) await uploadPhotos(c, it);
  const { error } = await c.from(table).upsert(rows.map(x => ({ user_id: user.id, id: x.id, data: x._deleted ? {} : toData(x),
    updated_at: iso(x.updatedAt), deleted_at: x._deleted ? iso(x.updatedAt) : null })), { onConflict: 'user_id,id' });
  if (error) throw error;
  for (const x of rows) await markSynced(table, x);
  // Tombstones older than the Undo window are no longer needed locally once the server has them.
  for (const x of rows) if (x._deleted && Date.now() - x.updatedAt > 60000) await db.purge(table, x.id);
}
// Record the sync only if nothing changed the row meanwhile.
async function markSynced(table, x) {
  if (table === 'settings') { const cur = await getSettingRec(x.key); if (cur && cur.updatedAt === x.updatedAt) await db.putSettingRaw({ ...cur, _syncedMs: x.updatedAt }); return; }
  const cur = await db.getRaw(table, x.id);
  if (cur && cur.updatedAt === x.updatedAt) await db.putMany(table, [{ ...cur, _syncedMs: x.updatedAt, ...(x._uploadedRev !== undefined ? { _uploadedRev: x._uploadedRev } : {}) }], { raw: true });
}

async function pushSaved(c) {
  const [stores, products, times] = await Promise.all([db.getSetting('savedStores', []), db.getSetting('savedProducts', {}), db.getSetting('savedTimes', {})]);
  const synced = await db.getSetting('syncSavedAt', {});
  const rows = savedRows(stores, products, times).filter(r => r.updatedAt && synced[r.id] !== r.updatedAt);
  if (!rows.length) return;
  const { error } = await c.from('saved').upsert(rows.map(r => ({ user_id: user.id, id: r.id, data: r.data,
    updated_at: iso(r.updatedAt), deleted_at: r.on ? null : iso(r.updatedAt) })), { onConflict: 'user_id,id' });
  if (error) throw error;
  for (const r of rows) synced[r.id] = r.updatedAt;
  await db.setSetting('syncSavedAt', synced);
}
// Call when a heart changes so its own timestamp syncs.
export async function markSaved(kind, key) {
  const t = await db.getSetting('savedTimes', {});
  t[`${kind}:${key}`] = Date.now();
  await db.setSetting('savedTimes', t);
}

// ---- photos: private bucket, paths user_id/item_id/{cutout,original,thumb}.jpg
const path = (id, f) => `${user.id}/${id}/${f}.jpg`;
async function uploadPhotos(c, it) {
  const st = c.storage.from(BUCKET);
  if (it._deleted) { await st.remove(['cutout', 'original', 'thumb'].map(f => path(it.id, f))).catch(() => {}); return; }
  if (!it.photoRev || it._uploadedRev === it.photoRev) return;
  for (const f of ['original', 'cutout', 'thumb']) {
    if (!it[f]) { if (f === 'cutout') await st.remove([path(it.id, f)]).catch(() => {}); continue; }
    const { error } = await st.upload(path(it.id, f), it[f], { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
  }
  it._uploadedRev = it.photoRev;
}
async function downloadMissingPhotos(c) {
  const need = (await db.all('items')).filter(i => i._needPhotos);
  for (const it of need) {
    const files = ['original', 'cutout', 'thumb'], { data, error } = await c.storage.from(BUCKET).createSignedUrls(files.map(f => path(it.id, f)), 120);
    if (error) continue;
    const got = {};
    for (const [n, s] of (data || []).entries()) {
      if (!s.signedUrl) continue;
      const r = await fetch(s.signedUrl).catch(() => null);
      if (r?.ok) got[files[n]] = await r.blob();
    }
    if (!got.original && !got.cutout) continue; // try again next pass
    const cur = await db.getRaw('items', it.id);
    if (cur && cur.photoRev === it.photoRev) await db.putMany('items', [{ ...cur, ...got, _needPhotos: false }], { raw: true });
  }
}

// ---- local data on account switches
const WIPE = ['items', 'locations', 'outfits'];
export async function wipeLocal() {
  for (const s of WIPE) await db.clear(s);
  await db.putMany('locations', db.DEFAULT_LOCATIONS.map(l => ({ ...l, _syncedMs: 0 })), { raw: true });
  for (const s of await db.allRaw('settings')) if (!db.LOCAL_KEYS.test(s.key)) await db.purge('settings', s.key);
}
async function markAllDirty() {
  for (const t of WIPE) await db.putMany(t, (await db.allRaw(t)).map(x => ({ ...x, updatedAt: x.updatedAt || Date.now(), _syncedMs: null, _uploadedRev: null })), { raw: true });
  for (const s of await db.allRaw('settings')) await db.putSettingRaw({ ...s, updatedAt: s.updatedAt || Date.now(), _syncedMs: null });
  await db.setSetting('syncSavedAt', {});
  const t = await db.getSetting('savedTimes', {}), [stores, products] = await Promise.all([db.getSetting('savedStores', []), db.getSetting('savedProducts', {})]);
  for (const r of savedRows(stores, products, t)) if (!t[r.id]) t[r.id] = Date.now();
  await db.setSetting('savedTimes', t);
}

// ---- auth actions (used by the account screen). Each returns {error?}.
export async function signIn(email, password) { return (await client()).auth.signInWithPassword({ email, password }); }
export async function signUp(email, password) { return (await client()).auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } }); }
export async function magicLink(email) { return (await client()).auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } }); }
export async function resetPassword(email) { return (await client()).auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() + '#me/account' }); }
export async function setPassword(password) { return (await client()).auth.updateUser({ password }); }
export async function signOut() {
  try { await flush(); } catch {}
  await (await client()).auth.signOut();
  user = null; await wipeLocal(); await db.setSetting('syncUser', null);
  setStatus({ state: 'guest', at: 0 }); dispatchEvent(new Event('attinera:account'));
}
// Deletes every row and photo, then the login itself (SQL function delete_my_account), then signs out.
export async function deleteAccount() {
  const c = await client(), st = c.storage.from(BUCKET);
  const { data: folders } = await st.list(user.id, { limit: 1000 });
  for (const f of folders || []) {
    const { data: files } = await st.list(`${user.id}/${f.name}`, { limit: 100 });
    if (files?.length) await st.remove(files.map(x => `${user.id}/${f.name}/${x.name}`));
  }
  for (const t of [...TABLES, 'profiles']) {
    const { error } = await c.from(t).delete().eq(t === 'profiles' ? 'id' : 'user_id', user.id);
    if (error) throw error;
  }
  const { error } = await c.rpc('delete_my_account');
  if (error) throw error;
  await c.auth.signOut().catch(() => {});
  user = null; await wipeLocal(); await db.setSetting('syncUser', null);
  setStatus({ state: 'guest', at: 0 }); dispatchEvent(new Event('attinera:account'));
}
