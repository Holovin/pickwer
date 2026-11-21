interface DirectoryRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
}

export interface DirectoryIdentity {
  key: string;
  persistent: boolean;
}

function openRegistry(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('screenshot-compare-directories', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('directories', { keyPath: 'id' });
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Directory registry is blocked.'));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }

      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function readRegistry<T>(database: IDBDatabase, read: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('directories');
    const request = read(transaction.objectStore('directories'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

function writeRecord(database: IDBDatabase, record: DirectoryRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('directories', 'readwrite');
    transaction.objectStore('directories').put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

export function sessionIdentity(): DirectoryIdentity {
  return { key: `session:${crypto.randomUUID()}`, persistent: false };
}

let lastDirectoryId: string | undefined;

async function matches(handle: FileSystemDirectoryHandle, record: DirectoryRecord) {
  try {
    return await handle.isSameEntry(record.handle);
  } catch {
    return false;
  }
}

async function resolveDirectory(handle: FileSystemDirectoryHandle): Promise<DirectoryIdentity> {
  let database: IDBDatabase | undefined;

  try {
    database = await openRegistry();

    const lastId = lastDirectoryId;

    if (lastId) {
      const previous: DirectoryRecord | undefined = await readRegistry(database, (store) => store.get(lastId));

      if (previous && (await matches(handle, previous))) {
        return { key: previous.id, persistent: true };
      }
    }

    const records: DirectoryRecord[] = await readRegistry(database, (store) => store.getAll());

    for (const record of records) {
      if (record.id !== lastId && (await matches(handle, record))) {
        lastDirectoryId = record.id;
        return { key: record.id, persistent: true };
      }
    }

    const id = `directory:${crypto.randomUUID()}`;
    await writeRecord(database, { id, handle });
    lastDirectoryId = id;

    return { key: id, persistent: true };
  } catch {
    // A name or file list cannot prove identity. Never reuse another folder's cache.
    return sessionIdentity();
  } finally {
    database?.close();
  }
}

let registration: Promise<unknown> = Promise.resolve();

export async function identifyDirectory(handle: FileSystemDirectoryHandle): Promise<DirectoryIdentity> {
  try {
    if (navigator.locks) {
      return await navigator.locks.request('screenshot-compare-directories', () => resolveDirectory(handle));
    }
  } catch {
    return sessionIdentity();
  }

  const result = registration.then(() => resolveDirectory(handle));
  registration = result.catch(() => undefined);

  return result;
}
