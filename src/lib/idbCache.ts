/**
 * Tiny IndexedDB key/value cache for persistent app data.
 *
 * Strategy: stale-while-revalidate.
 *   - On boot, hydrate module-level caches from IDB so the UI shows data immediately.
 *   - In parallel, fetch fresh data from the network and replace the cache.
 *
 * No external deps — uses the native IndexedDB API.
 */

const DB_NAME = "fastcache";
const STORE = "kv";
// Bump this when payload shapes change to invalidate all stored entries.
export const CACHE_VERSION = 1;

interface Envelope<T> {
  v: number;
  t: number; // timestamp ms
  d: T;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const env = req.result as Envelope<T> | undefined;
        if (!env || env.v !== CACHE_VERSION) resolve(null);
        else resolve(env.d);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const env: Envelope<T> = { v: CACHE_VERSION, t: Date.now(), d: data };
      tx.objectStore(STORE).put(env, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export async function idbClearAll(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

export async function idbMeta(key: string): Promise<{ updatedAt: number } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const env = req.result as Envelope<unknown> | undefined;
        if (!env || env.v !== CACHE_VERSION) resolve(null);
        else resolve({ updatedAt: env.t });
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Known cache keys — keep centralized to avoid typos.
export const CACHE_KEYS = {
  centri: "centri",
  categorie: "categorie",
  sales: "sales",
  purchases: "purchases",
} as const;