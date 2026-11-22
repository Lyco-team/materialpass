/** 极简 IndexedDB 封装：材料二进制与结构化元数据分库存储，刷新页面不丢。 */

const DB_NAME = "materialpass";
const DB_VERSION = 1;
const KV = "kv";
const BLOBS = "blobs";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.onabort = () => reject(t.error);
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const kvGet = <T>(key: string) => tx<T | undefined>(KV, "readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx(KV, "readwrite", (s) => s.put(value, key));
export const kvDel = (key: string) => tx(KV, "readwrite", (s) => s.delete(key));
export const kvKeys = () => tx<IDBValidKey[]>(KV, "readonly", (s) => s.getAllKeys());

export const blobGet = (key: string) => tx<Blob | undefined>(BLOBS, "readonly", (s) => s.get(key));
export const blobSet = (key: string, blob: Blob) => tx(BLOBS, "readwrite", (s) => s.put(blob, key));
export const blobDel = (key: string) => tx(BLOBS, "readwrite", (s) => s.delete(key));

export async function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
