import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredVault } from './crypto';

interface VaultDB extends DBSchema {
  vault: { key: string; value: StoredVault };
}

const DB_NAME = 'ownpasswords';
const KEY = 'main';
let dbPromise: Promise<IDBPDatabase<VaultDB>> | null = null;

function db(): Promise<IDBPDatabase<VaultDB>> {
  dbPromise ??= openDB<VaultDB>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('vault');
    },
  });
  return dbPromise;
}

export async function loadVault(): Promise<StoredVault | undefined> {
  return (await db()).get('vault', KEY);
}

export async function saveVault(record: StoredVault): Promise<void> {
  await (await db()).put('vault', record, KEY);
}

export async function deleteVault(): Promise<void> {
  await (await db()).delete('vault', KEY);
}

/** Ask the browser not to evict our IndexedDB under storage pressure. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* best effort */
  }
}
