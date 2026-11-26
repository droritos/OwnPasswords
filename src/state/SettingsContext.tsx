import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '../lib/types';

const STORAGE_KEY = 'ownpasswords.settings';

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 2,
  lockOnHidden: false,
  theme: 'dark',
};

/** Non-sensitive UI preferences only. Never put secrets here. */
function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      autoLockMinutes:
        typeof raw.autoLockMinutes === 'number' && raw.autoLockMinutes >= 0
          ? raw.autoLockMinutes
          : DEFAULT_SETTINGS.autoLockMinutes,
      lockOnHidden: typeof raw.lockOnHidden === 'boolean' ? raw.lockOnHidden : DEFAULT_SETTINGS.lockOnHidden,
      theme: raw.theme === 'light' ? 'light' : 'dark',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in memory */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark');
    const color = settings.theme === 'dark' ? '#020617' : '#f8fafc';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside SettingsProvider');
  return v;
}
