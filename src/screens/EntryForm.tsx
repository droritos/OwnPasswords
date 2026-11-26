import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Save, Star, Wand2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { PasswordInput } from '../components/PasswordInput';
import { StrengthMeter } from '../components/StrengthMeter';
import { useToast } from '../components/Toast';
import { assessPassword } from '../lib/password';
import { hostFromUrl, newId } from '../lib/vaultModel';
import { FALLBACK_CATEGORY, type Entry } from '../lib/types';
import { useVault } from '../state/VaultContext';
import { PasswordGenerator } from './PasswordGenerator';

const NEW_CATEGORY = '__new__';

interface EntryFormProps {
  initial: Entry | null;
  categories: string[];
  defaultCategory?: string;
  defaultFavorite?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export function EntryForm({ initial, categories, defaultCategory, defaultFavorite, onClose, onSaved }: EntryFormProps) {
  const { upsertEntry } = useVault();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [category, setCategory] = useState(initial?.category ?? defaultCategory ?? FALLBACK_CATEGORY);
  const [newCategory, setNewCategory] = useState('');
  const [favorite, setFavorite] = useState(initial?.favorite ?? !!defaultFavorite);
  const [genOpen, setGenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => assessPassword(password), [password]);
  const effectiveTitle = title.trim() || hostFromUrl(url);
  const effectiveCategory = category === NEW_CATEGORY ? newCategory.trim() : category;
  const canSave = !!effectiveTitle && !!effectiveCategory && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    const now = Date.now();
    const entry: Entry = {
      id: initial?.id ?? newId(),
      title: effectiveTitle,
      username: username.trim(),
      password,
      url: url.trim(),
      notes,
      category: effectiveCategory,
      favorite,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await upsertEntry(entry);
      toast(initial ? 'Changes saved' : 'Password saved');
      onSaved(entry.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
      setBusy(false);
    }
  };

  const options = categories.some((c) => c.toLowerCase() === category.toLowerCase()) || category === NEW_CATEGORY
    ? categories
    : [...categories, category];

  return (
    <>
      <Modal
        open
        tall
        onClose={onClose}
        title={initial ? 'Edit password' : 'New password'}
        footer={
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="entry-form" className="btn-primary flex-1" disabled={!canSave}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        }
      >
        <form id="entry-form" onSubmit={submit} className="space-y-4 pt-1" autoComplete="off">
          <div>
            <label className="label" htmlFor="f-title">
              Title
            </label>
            <input
              id="f-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={hostFromUrl(url) || 'e.g. Gmail, Bank, Netflix'}
              autoFocus={!initial}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div>
              <label className="label" htmlFor="f-category">
                Category
              </label>
              <select
                id="f-category"
                className="input appearance-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {options.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>＋ New category…</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setFavorite((f) => !f)}
              aria-pressed={favorite}
              aria-label="Favorite"
              className={`flex h-[50px] w-[50px] items-center justify-center rounded-xl ring-1 transition ${
                favorite
                  ? 'bg-amber-400/15 text-amber-400 ring-amber-400/40'
                  : 'text-slate-400 ring-slate-200 dark:ring-slate-800'
              }`}
            >
              <Star className={`h-5 w-5 ${favorite ? 'fill-amber-400' : ''}`} />
            </button>
          </div>
          {category === NEW_CATEGORY && (
            <input
              className="input"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category name"
              maxLength={32}
              autoFocus
            />
          )}

          <div>
            <label className="label" htmlFor="f-username">
              Username / email
            </label>
            <input
              id="f-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="f-password">
              Password
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <PasswordInput
                  id="f-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <button type="button" className="btn-secondary px-3.5" onClick={() => setGenOpen(true)}>
                <Wand2 className="h-4 w-4" />
                Generate
              </button>
            </div>
            {password && (
              <div className="mt-2.5">
                <StrengthMeter strength={strength} />
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="f-url">
              Website
            </label>
            <input
              id="f-url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="f-notes">
              Notes
            </label>
            <textarea
              id="f-notes"
              className="input min-h-[96px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Security questions, recovery codes, PIN…"
            />
          </div>
        </form>
      </Modal>

      <PasswordGenerator
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onApply={(pw) => {
          setPassword(pw);
          setGenOpen(false);
        }}
      />
    </>
  );
}
