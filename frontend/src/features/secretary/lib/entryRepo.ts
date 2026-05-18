import type { Entry } from '../types'

// IndexedDB 仓库：唯一接触 IDB 的层，对外暴露 Promise API
// 两个 object store：
//   entries  —— 纯 JSON 元数据，索引 byCreatedAt
//   blobs    —— 语音 / 附件的二进制，key 与 entry.id 一致

const DB_NAME = 'kai-toolbox/secretary'
const DB_VERSION = 1
const STORE_ENTRIES = 'entries'
const STORE_BLOBS = 'blobs'
const IDX_CREATED_AT = 'byCreatedAt'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const s = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' })
        s.createIndex(IDX_CREATED_AT, 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
  // 打开失败后下次重试，避免被坏的 promise 卡死
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'))
  })
}

function txAsPromise(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'))
  })
}

export async function listEntries(): Promise<Entry[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_ENTRIES, 'readonly')
  const idx = tx.objectStore(STORE_ENTRIES).index(IDX_CREATED_AT)
  const out: Entry[] = []
  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor(null, 'prev')
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        out.push(cursor.value as Entry)
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error ?? new Error('cursor failed'))
  })
  return out
}

export async function addEntry(entry: Entry, blob?: Blob): Promise<void> {
  const db = await openDb()
  const stores = blob ? [STORE_ENTRIES, STORE_BLOBS] : [STORE_ENTRIES]
  const tx = db.transaction(stores, 'readwrite')
  tx.objectStore(STORE_ENTRIES).add(entry)
  if (blob) {
    tx.objectStore(STORE_BLOBS).put({ id: entry.id, blob })
  }
  await txAsPromise(tx)
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  const tx = db.transaction(STORE_BLOBS, 'readonly')
  const rec = await reqAsPromise(tx.objectStore(STORE_BLOBS).get(id))
  if (!rec) return null
  const blob = (rec as { blob?: unknown }).blob
  return blob instanceof Blob ? blob : null
}

export async function removeEntry(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_ENTRIES, STORE_BLOBS], 'readwrite')
  tx.objectStore(STORE_ENTRIES).delete(id)
  tx.objectStore(STORE_BLOBS).delete(id)
  await txAsPromise(tx)
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_ENTRIES, STORE_BLOBS], 'readwrite')
  tx.objectStore(STORE_ENTRIES).clear()
  tx.objectStore(STORE_BLOBS).clear()
  await txAsPromise(tx)
}
