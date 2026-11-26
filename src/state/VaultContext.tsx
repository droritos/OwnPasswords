import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as vaultCrypto from '../lib/crypto';
import type { BackupFile, StoredVault, VaultSession } from '../lib/crypto';
import { deleteVault, loadVault, requestPersistentStorage, saveVault } from '../lib/storage';
import { registerBiometric, unlockWithBiometric } from '../lib/biometric';
import { clearClipboard } from '../lib/clipboard';
import { emptyVault, isBuiltInCategory, mergeVaults, normalizeEntry, allCategories } from '../lib/vaultModel';
import { FALLBACK_CATEGORY, type Entry, type VaultData } from '../lib/types';
import { useSettings } from './SettingsContext';

export type VaultStatus = 'loading' | 'error' | 'setup' | 'locked' | 'unlocked';

export class PasswordRequiredError extends Error {
  constructor() {
    super('Master password required');
    this.name = 'PasswordRequiredError';
  }
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
}

interface VaultContextValue {
  status: VaultStatus;
  error: string | null;
  data: VaultData | null;
  hasBiometric: boolean;
  /** False after biometric unlock: password-protected operations must ask for it. */
  hasPasswordKey: boolean;
  createVault(password: string): Promise<void>;
  restoreVault(backup: BackupFile, password: string): Promise<number>;
  unlock(password: string): Promise<void>;
  unlockBiometric(): Promise<void>;
  lock(): void;
  upsertEntry(entry: Entry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  addCategory(name: string): Promise<void>;
  removeCategory(name: string): Promise<void>;
  importEntries(entries: Entry[]): Promise<ImportSummary>;
  importBackup(backup: BackupFile, password: string): Promise<ImportSummary>;
  buildBackup(password?: string): Promise<BackupFile>;
  changePassword(current: string, next: string): Promise<void>;
  enableBiometric(): Promise<void>;
  disableBiometric(): Promise<void>;
  eraseVault(): Promise<void>;
  /** Suspend auto-lock while a native picker/share sheet hides the page. */
  pauseAutoLock(ms?: number): void;
  resumeAutoLock(): void;
}

const Ctx = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [record, setRecordState] = useState<StoredVault | null>(null);
  const [data, setDataState] = useState<VaultData | null>(null);
  const [hasPasswordKey, setHasPasswordKey] = useState(false);

  // Refs hold the latest values for async work; key material lives ONLY here (memory).
  const recordRef = useRef<StoredVault | null>(null);
  const dataRef = useRef<VaultData | null>(null);
  const sessionRef = useRef<VaultSession | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pausedUntilRef = useRef(0);

  const setRecord = useCallback((r: StoredVault | null) => {
    recordRef.current = r;
    setRecordState(r);
  }, []);
  const setData = useCallback((d: VaultData | null) => {
    dataRef.current = d;
    setDataState(d);
  }, []);

  useEffect(() => {
    loadVault()
      .then((r) => {
        if (r) {
          setRecord(r);
          setStatus('locked');
        } else setStatus('setup');
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
  }, [setRecord]);

  const startSession = useCallback(
    (rec: StoredVault, session: VaultSession, d: VaultData) => {
      sessionRef.current = session;
      setHasPasswordKey(!!session.passwordKey);
      setRecord(rec);
      setData(d);
      setStatus('unlocked');
    },
    [setRecord, setData],
  );

  const lock = useCallback(() => {
    // Drop every reference to keys and plaintext so they can be garbage-collected.
    sessionRef.current = null;
    setHasPasswordKey(false);
    setData(null);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
    void clearClipboard(true);
  }, [setData]);

  /** Serialises writes so concurrent edits never overwrite each other. */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.catch(() => undefined).then(task);
    queueRef.current = run;
    return run;
  }, []);

  const persist = useCallback(
    (update: (rec: StoredVault, session: VaultSession) => Promise<StoredVault>) =>
      enqueue(async () => {
        const session = sessionRef.current;
        const rec = recordRef.current;
        if (!session || !rec) throw new Error('Vault is locked');
        const next = await update(rec, session);
        await saveVault(next);
        setRecord(next);
        return next;
      }),
    [enqueue, setRecord],
  );

  const mutate = useCallback(
    async (fn: (d: VaultData) => VaultData) => {
      const current = dataRef.current;
      if (!current) throw new Error('Vault is locked');
      const next = fn(current);
      setData(next);
      await persist((rec, s) => vaultCrypto.sealVault(rec, s.vaultKey, next));
    },
    [persist, setData],
  );

  // ------------------------------------------------------------ auto-lock
  useEffect(() => {
    if (status !== 'unlocked') return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const isPaused = () => pausedUntilRef.current > Date.now();
    const check = () => {
      if (isPaused()) {
        last = Date.now();
        return;
      }
      const ms = settings.autoLockMinutes * 60_000;
      if (ms > 0 && Date.now() - last >= ms) lock();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (settings.lockOnHidden && !isPaused()) lock();
      } else check();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', lock);
    const interval = setInterval(check, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', lock);
      clearInterval(interval);
    };
  }, [status, settings.autoLockMinutes, settings.lockOnHidden, lock]);

  // ------------------------------------------------------------ actions
  const value = useMemo<VaultContextValue>(() => {
    const requireRecord = () => {
      const r = recordRef.current;
      if (!r) throw new Error('No vault on this device');
      return r;
    };
    const requireSession = () => {
      const s = sessionRef.current;
      if (!s) throw new Error('Vault is locked');
      return s;
    };
    const merge = async (incoming: VaultData): Promise<ImportSummary> => {
      let summary: ImportSummary = { added: 0, updated: 0, skipped: 0 };
      await mutate((d) => {
        const r = mergeVaults(d, incoming);
        summary = { added: r.added, updated: r.updated, skipped: r.skipped };
        return r.data;
      });
      return summary;
    };

    return {
      status,
      error,
      data,
      hasBiometric: !!record?.biometric,
      hasPasswordKey,

      async createVault(password) {
        const initial = emptyVault();
        const { record: rec, session } = await vaultCrypto.createVault(password, initial);
        await saveVault(rec);
        void requestPersistentStorage();
        startSession(rec, session, initial);
      },

      async restoreVault(backup, password) {
        const restored = await vaultCrypto.openBackup(backup, password);
        const { record: rec, session } = await vaultCrypto.createVault(password, restored);
        await saveVault(rec);
        void requestPersistentStorage();
        startSession(rec, session, restored);
        return restored.entries.length;
      },

      async unlock(password) {
        const rec = requireRecord();
        const { data: d, session } = await vaultCrypto.unlockWithPassword(rec, password);
        startSession(rec, session, d);
      },

      async unlockBiometric() {
        const rec = requireRecord();
        if (!rec.biometric) throw new Error('Biometric unlock is not set up');
        const vaultKey = await unlockWithBiometric(rec.biometric);
        const d = await vaultCrypto.openVault(rec, vaultKey);
        startSession(rec, { vaultKey, passwordKey: null }, d);
      },

      lock,

      async upsertEntry(entry) {
        const clean = normalizeEntry({ ...entry, updatedAt: Date.now() });
        await mutate((d) => {
          const exists = d.entries.some((e) => e.id === clean.id);
          const entries = exists ? d.entries.map((e) => (e.id === clean.id ? clean : e)) : [...d.entries, clean];
          const known = allCategories(d).some((c) => c.toLowerCase() === clean.category.toLowerCase());
          return { entries, categories: known ? d.categories : [...d.categories, clean.category] };
        });
      },

      async deleteEntry(id) {
        await mutate((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
      },

      async toggleFavorite(id) {
        await mutate((d) => ({
          ...d,
          entries: d.entries.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e)),
        }));
      },

      async addCategory(name) {
        const n = name.trim();
        if (!n) return;
        await mutate((d) =>
          allCategories(d).some((c) => c.toLowerCase() === n.toLowerCase())
            ? d
            : { ...d, categories: [...d.categories, n] },
        );
      },

      async removeCategory(name) {
        if (isBuiltInCategory(name)) return;
        const key = name.toLowerCase();
        await mutate((d) => ({
          categories: d.categories.filter((c) => c.toLowerCase() !== key),
          entries: d.entries.map((e) =>
            e.category.toLowerCase() === key ? { ...e, category: FALLBACK_CATEGORY, updatedAt: Date.now() } : e,
          ),
        }));
      },

      importEntries: (entries) => merge({ entries, categories: [] }),

      async importBackup(backup, password) {
        return merge(await vaultCrypto.openBackup(backup, password));
      },

      async buildBackup(password) {
        const session = requireSession();
        const rec = requireRecord();
        let key = session.passwordKey;
        if (!key) {
          if (!password) throw new PasswordRequiredError();
          key = (await vaultCrypto.verifyPassword(rec, password)).passwordKey;
          session.passwordKey = key;
          setHasPasswordKey(true);
        }
        const d = dataRef.current;
        if (!d) throw new Error('Vault is locked');
        return vaultCrypto.createBackup(d, key, rec.kdf);
      },

      async changePassword(current, next) {
        await enqueue(async () => {
          const rec = requireRecord();
          const d = dataRef.current;
          if (!d || !sessionRef.current) throw new Error('Vault is locked');
          const res = await vaultCrypto.changeMasterPassword(rec, current, next, d);
          await saveVault(res.record);
          sessionRef.current = res.session;
          setHasPasswordKey(true);
          setRecord(res.record);
        });
      },

      async enableBiometric() {
        const wrap = await registerBiometric(requireSession().vaultKey);
        await persist(async (rec) => ({ ...rec, biometric: wrap }));
      },

      async disableBiometric() {
        await persist(async (rec) => {
          const next: StoredVault = { ...rec };
          delete next.biometric;
          return next;
        });
      },

      async eraseVault() {
        await enqueue(() => deleteVault());
        sessionRef.current = null;
        setHasPasswordKey(false);
        setData(null);
        setRecord(null);
        setStatus('setup');
        void clearClipboard(true);
      },

      pauseAutoLock(ms = 5 * 60_000) {
        pausedUntilRef.current = Date.now() + ms;
      },
      resumeAutoLock() {
        pausedUntilRef.current = 0;
      },
    };
  }, [status, error, data, record, hasPasswordKey, lock, mutate, persist, enqueue, startSession, setData, setRecord]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault must be used inside VaultProvider');
  return v;
}
