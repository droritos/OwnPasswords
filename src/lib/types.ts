export interface Entry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The decrypted vault. Only ever held in memory while unlocked. */
export interface VaultData {
  entries: Entry[];
  /** User-defined categories (the built-in ones are not stored). */
  categories: string[];
}

export const DEFAULT_CATEGORIES = ['Finance', 'Work', 'Social', 'Personal'] as const;
export const FALLBACK_CATEGORY = 'Personal';

export type Theme = 'dark' | 'light';

export interface Settings {
  /** Minutes of inactivity before auto-lock. 0 = never. */
  autoLockMinutes: number;
  /** Lock as soon as the app is hidden (tab switch / app switch). */
  lockOnHidden: boolean;
  theme: Theme;
}

export const CLIPBOARD_CLEAR_SECONDS = 30;
