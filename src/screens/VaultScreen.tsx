import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { KeyRound, Lock, Plus, Search, SearchX, Settings, X } from 'lucide-react';
import { useVault } from '../state/VaultContext';
import { allCategories } from '../lib/vaultModel';
import type { Entry } from '../lib/types';
import { useToast } from '../components/Toast';
import { EntryCard } from './EntryCard';
import { EntryDetail } from './EntryDetail';
import { EntryForm } from './EntryForm';

const ALL = 'All';
const FAVORITES = 'Favorites';

export function VaultScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, lock, toggleFavorite } = useVault();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const deferredQuery = useDeferredValue(query);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const categories = useMemo(() => (data ? allCategories(data) : []), [data]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (filter === FAVORITES && !e.favorite) return false;
        if (filter !== ALL && filter !== FAVORITES && e.category.toLowerCase() !== filter.toLowerCase()) return false;
        if (!q) return true;
        return [e.title, e.username, e.url, e.notes, e.category].some((f) => f.toLowerCase().includes(q));
      })
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }, [entries, filter, deferredQuery]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.category.toLowerCase(), (m.get(e.category.toLowerCase()) ?? 0) + 1);
    return m;
  }, [entries]);

  const onToggleFavorite = useCallback(
    (id: string) => {
      toggleFavorite(id).catch(() => toast('Could not save change', 'error'));
    },
    [toggleFavorite, toast],
  );

  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;
  const pills = [ALL, FAVORITES, ...categories];

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/85 pt-safe backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/85">
        <div className="flex items-center gap-2 px-4 pt-3">
          <h1 className="flex-1 text-xl font-bold tracking-tight">Passwords</h1>
          <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <Settings className="h-5 w-5" />
          </button>
          <button type="button" className="icon-btn" onClick={lock} aria-label="Lock vault">
            <Lock className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, username, URL, notes"
              aria-label="Search vault"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="input rounded-2xl py-2.5 pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3" aria-label="Categories">
          {pills.map((p) => {
            const active = filter.toLowerCase() === p.toLowerCase();
            const count =
              p === ALL ? entries.length : p === FAVORITES ? entries.filter((e) => e.favorite).length : counts.get(p.toLowerCase()) ?? 0;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setFilter(p)}
                aria-pressed={active}
                className={`pill ${
                  active
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800'
                }`}
              >
                {p}
                {count > 0 && <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="px-4 pt-4">
        {entries.length === 0 ? (
          <EmptyVault onAdd={() => setEditing('new')} />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center text-slate-500">
            <SearchX className="mb-3 h-10 w-10 opacity-60" />
            <p className="font-medium">No matches</p>
            <p className="text-sm">Try another search or category.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visible.map((e) => (
              <EntryCard key={e.id} entry={e} onOpen={setSelectedId} onToggleFavorite={onToggleFavorite} />
            ))}
          </ul>
        )}
      </main>

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Add password"
        className="fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-xl shadow-brand-500/40 transition hover:bg-brand-600 active:scale-95 sm:right-[max(1.25rem,calc(50vw-21rem))]"
      >
        <Plus className="h-7 w-7" />
      </button>

      {selected && (
        <EntryDetail
          entry={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditing(selected);
            setSelectedId(null);
          }}
        />
      )}
      {editing && (
        <EntryForm
          initial={editing === 'new' ? null : editing}
          defaultCategory={filter !== ALL && filter !== FAVORITES ? filter : undefined}
          defaultFavorite={filter === FAVORITES}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function EmptyVault({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/20">
        <KeyRound className="h-9 w-9" />
      </div>
      <h2 className="text-lg font-semibold">Your vault is empty</h2>
      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
        Add your first password, or import a backup / CSV from Settings.
      </p>
      <button type="button" className="btn-primary mt-6" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add password
      </button>
    </div>
  );
}
