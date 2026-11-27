// Tiny IndexedDB key-value store for large local files (your videos, notebook documents, publication drafts).
// Data stays in this browser. Every call fails soft: callers get null/[] instead of an exception.
const DB = 'evidara', STORE = 'kv';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } catch (e) { reject(e); }
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode); const st = t.objectStore(STORE);
    const req = fn(st);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  }));
}
export const idb = {
  get: k => tx('readonly', s => s.get(k)).catch(() => null),
  set: (k, v) => tx('readwrite', s => s.put(v, k)).then(() => true).catch(() => false),
  del: k => tx('readwrite', s => s.delete(k)).then(() => true).catch(() => false),
  keys: prefix => tx('readonly', s => s.getAllKeys()).then(ks => (ks || []).filter(k => String(k).startsWith(prefix))).catch(() => []),
};
