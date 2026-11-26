import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { PasswordInput } from './PasswordInput';

interface PasswordPromptProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** Throw to show an error and keep the prompt open. */
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}

export function PasswordPrompt({ open, title, description, confirmLabel = 'Continue', onSubmit, onClose }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {description && <div className="text-sm text-slate-600 dark:text-slate-300">{description}</div>}
        <PasswordInput
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
          autoComplete="current-password"
          aria-invalid={!!error}
        />
        {error && <p className="text-sm font-medium text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={!password || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Decrypting…' : confirmLabel}
        </button>
      </form>
    </Modal>
  );
}
