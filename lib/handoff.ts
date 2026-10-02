// Moves a file chosen on a public page to a freshly loaded scan page when Google Analytics is
// configured, so the file is only ever read on a page served with the strict Content Security
// Policy and without any third-party script (see lib/analytics.ts). For the moment it takes to open
// the scan page, the file sits in this browser's own storage (IndexedDB) under a random key carried
// in the address. The scan page reads it and deletes it; copies left behind (a closed tab, a failed
// load) are deleted after five minutes, the next time any PaidTwice page opens. Nothing leaves the
// computer.

const DB_NAME = "paidtwice-handoff";
const STORE = "files";
const MAX_AGE_MS = 5 * 60_000;

interface Entry {
  file: File;
  at: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = make(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Deletes expired entries, closes the connection, and deletes the whole database once it is empty. */
async function purge(db: IDBDatabase): Promise<void> {
  let remaining: number | undefined;
  try {
    const now = Date.now();
    await run(db, "readwrite", (store) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const entry = cursor.value as Entry | undefined;
        if (!entry || typeof entry.at !== "number" || now - entry.at > MAX_AGE_MS) cursor.delete();
        cursor.continue();
      };
    });
    remaining = await run<number>(db, "readonly", (store) => store.count());
  } finally {
    db.close();
  }
  if (remaining === 0) indexedDB.deleteDatabase(DB_NAME);
}

/** Puts the file aside for the scan page and returns its key, or null when storage is unavailable. */
export async function stashFile(file: File): Promise<string | null> {
  try {
    const db = await openDb();
    const key = newKey();
    try {
      await run(db, "readwrite", (s) => s.put({ file, at: Date.now() } satisfies Entry, key));
    } finally {
      db.close();
    }
    return key;
  } catch {
    return null;
  }
}

/**
 * Takes the file put aside under `key`. Call `release()` once the file has been read: it deletes
 * the stored copy (and any expired ones).
 */
export async function takeStashedFile(key: string): Promise<{ file: File; release: () => Promise<void> } | null> {
  if (typeof indexedDB === "undefined" || !key) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const conn = db;
    const entry = await run<Entry>(conn, "readonly", (s) => s.get(key));
    const release = async () => {
      try {
        await run(conn, "readwrite", (s) => s.delete(key));
      } catch {
        /* purge below still runs */
      }
      await purge(conn).catch(() => undefined);
    };
    if (!entry || !(entry.file instanceof Blob) || Date.now() - entry.at > MAX_AGE_MS) {
      await release();
      return null;
    }
    return { file: entry.file, release };
  } catch {
    db?.close();
    return null;
  }
}

/**
 * Deletes copies left behind. Where the browser can list its databases, this does nothing unless
 * the hand-off database exists. Where it cannot, the database is opened (and deleted again when
 * empty) only if `openIfUnlisted` is set, i.e. while hand-offs are in use.
 */
export async function purgeStaleHandoffs(openIfUnlisted: boolean): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === DB_NAME)) return;
    } else if (!openIfUnlisted) {
      return;
    }
    await purge(await openDb());
  } catch {
    /* nothing to clean up */
  }
}
