import { useMemo, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Star, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { StrengthMeter } from '../components/StrengthMeter';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useCopy } from '../hooks/useCopy';
import { assessPassword } from '../lib/password';
import { safeHttpUrl } from '../lib/vaultModel';
import type { Entry } from '../lib/types';
import { useVault } from '../state/VaultContext';

interface EntryDetailProps {
  entry: Entry;
  onClose: () => void;
  onEdit: () => void;
}

export function EntryDetail({ entry, onClose, onEdit }: EntryDetailProps) {
  const { deleteEntry, toggleFavorite } = useVault();
  const toast = useToast();
  const copy = useCopy();
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const strength = useMemo(() => assessPassword(entry.password), [entry.password]);
  const href = safeHttpUrl(entry.url);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Details"
        footer={
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1 text-rose-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
            <button type="button" className="btn-primary flex-1" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          </div>
        }
      >
        <div className="mb-5 flex items-center gap-4">
          <Avatar title={entry.title} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-bold">{entry.title}</h3>
            <span className="mt-1 inline-block rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-300">
              {entry.category}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => toggleFavorite(entry.id).catch(() => toast('Could not save change', 'error'))}
            aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={entry.favorite}
          >
            <Star className={`h-5 w-5 ${entry.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Username" onCopy={entry.username ? () => copy(entry.username, 'Username') : undefined}>
            <button
              type="button"
              className="w-full truncate text-left"
              onClick={() => copy(entry.username, 'Username')}
              disabled={!entry.username}
            >
              {entry.username || <Empty />}
            </button>
          </Field>

          <Field
            label="Password"
            onCopy={entry.password ? () => copy(entry.password, 'Password', true) : undefined}
            extra={
              entry.password ? (
                <button
                  type="button"
                  className="icon-btn h-9 w-9"
                  onClick={() => setRevealed((r) => !r)}
                  aria-label={revealed ? 'Hide password' : 'Reveal password'}
                >
                  {revealed ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              ) : null
            }
          >
            <button
              type="button"
              className="w-full break-all text-left font-mono tracking-wide"
              onClick={() => copy(entry.password, 'Password', true)}
              disabled={!entry.password}
            >
              {entry.password ? (revealed ? entry.password : '•'.repeat(Math.min(entry.password.length, 16))) : <Empty />}
            </button>
            {entry.password && (
              <div className="mt-3">
                <StrengthMeter strength={strength} />
              </div>
            )}
          </Field>

          <Field
            label="Website"
            onCopy={entry.url ? () => copy(entry.url, 'URL') : undefined}
            extra={
              href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn h-9 w-9"
                  aria-label="Open website"
                >
                  <ExternalLink className="h-[18px] w-[18px]" />
                </a>
              ) : null
            }
          >
            <span className="block truncate">{entry.url || <Empty />}</span>
          </Field>

          {entry.notes && (
            <Field label="Notes">
              <p className="whitespace-pre-wrap break-words text-sm">{entry.notes}</p>
            </Field>
          )}

          <p className="pt-1 text-center text-xs text-slate-400">
            Last updated {new Date(entry.updatedAt).toLocaleString()} · Created{' '}
            {new Date(entry.createdAt).toLocaleDateString()}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete entry?"
        destructive
        confirmLabel="Delete"
        message={
          <>
            <strong>{entry.title}</strong> will be permanently removed from this vault. Backups you exported earlier are
            not affected.
          </>
        }
        onConfirm={async () => {
          try {
            await deleteEntry(entry.id);
            toast('Entry deleted');
            onClose();
          } catch {
            toast('Could not delete entry', 'error');
          }
        }}
      />
    </>
  );
}

function Field({
  label,
  children,
  onCopy,
  extra,
}: {
  label: string;
  children: ReactNode;
  onCopy?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-100/80 p-3.5 dark:bg-slate-800/50">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="label mb-1">{label}</div>
          <div className="text-[15px]">{children}</div>
        </div>
        {extra}
        {onCopy && (
          <button type="button" className="icon-btn h-9 w-9" onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`}>
            <Copy className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}

const Empty = () => <span className="italic text-slate-400">Not set</span>;
