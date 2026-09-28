// Persistenter Cache für große API-Antworten (Overpass, Wegenetz) in IndexedDB – 24 h gültig.
// Alles optional: Ohne IndexedDB (Privatmodus, Node) ist der Cache einfach leer.

const DB = 'search-a-hood';
const STORE = 'responses';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;

let dbPromise = null;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cacheGet(key) {
  const db = await open();
  if (!db) return undefined;
  const hit = await tx(db, 'readonly', (s) => s.get(key));
  if (!hit || Date.now() - hit.t > TTL_MS) return undefined;
  return hit.v;
}

export async function cachePut(key, value) {
  const db = await open();
  if (!db) return;
  await tx(db, 'readwrite', (s) => s.put({ t: Date.now(), v: value }, key));
  // Aufräumen: nur die neuesten MAX_ENTRIES behalten
  const keys = (await tx(db, 'readonly', (s) => s.getAllKeys())) || [];
  if (keys.length <= MAX_ENTRIES) return;
  const all = (await tx(db, 'readonly', (s) => s.getAll())) || [];
  const byAge = keys.map((k, i) => [k, all[i]?.t || 0]).sort((a, b) => a[1] - b[1]);
  await tx(db, 'readwrite', (s) => byAge.slice(0, keys.length - MAX_ENTRIES).forEach(([k]) => s.delete(k)));
}

export async function cacheClear() {
  const db = await open();
  if (db) await tx(db, 'readwrite', (s) => s.clear());
}
