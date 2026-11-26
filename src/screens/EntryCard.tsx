import { memo } from 'react';
import { KeyRound, Star, User } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useCopy } from '../hooks/useCopy';
import type { Entry } from '../lib/types';

interface EntryCardProps {
  entry: Entry;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export const EntryCard = memo(function EntryCard({ entry, onOpen, onToggleFavorite }: EntryCardProps) {
  const copy = useCopy();
  return (
    <li className="card flex items-center gap-1 py-2.5 pl-3 pr-1.5 transition hover:ring-brand-500/40">
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5 text-left"
      >
        <Avatar title={entry.title} />
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{entry.title}</div>
          <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
            {entry.username || <span className="italic opacity-70">No username</span>}
          </div>
        </div>
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onToggleFavorite(entry.id)}
        aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={entry.favorite}
      >
        <Star className={`h-[18px] w-[18px] ${entry.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
      </button>
      <button
        type="button"
        className="icon-btn bg-slate-100 dark:bg-slate-800/70"
        onClick={() => copy(entry.username, 'Username')}
        aria-label={`Copy username for ${entry.title}`}
        title="Copy username"
      >
        <User className="h-[18px] w-[18px]" />
      </button>
      <button
        type="button"
        className="icon-btn ml-1 bg-brand-500/10 text-brand-500 hover:bg-brand-500/20 hover:text-brand-400 dark:text-brand-400"
        onClick={() => copy(entry.password, 'Password', true)}
        aria-label={`Copy password for ${entry.title}`}
        title="Copy password"
      >
        <KeyRound className="h-[18px] w-[18px]" />
      </button>
    </li>
  );
});
