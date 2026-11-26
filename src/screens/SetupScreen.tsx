import { useMemo, useState, type FormEvent } from 'react';
import { FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordPrompt } from '../components/PasswordPrompt';
import { StrengthMeter } from '../components/StrengthMeter';
import { useToast } from '../components/Toast';
import { assessPassword } from '../lib/password';
import { parseBackup, type BackupFile } from '../lib/crypto';
import { pickFile } from '../lib/files';
import { useVault } from '../state/VaultContext';

const MIN_MASTER_LENGTH = 8;

export function SetupScreen() {
  const { createVault, restoreVault } = useVault();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backup, setBackup] = useState<BackupFile | null>(null);

  const strength = useMemo(() => assessPassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < MIN_MASTER_LENGTH;
  const canSubmit = password.length >= MIN_MASTER_LENGTH && password === confirm && strength.score >= 2 && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await createVault(password);
      toast('Vault created');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const chooseBackup = async () => {
    const file = await pickFile('.enc,.json,application/json,application/octet-stream');
    if (!file) return;
    try {
      setBackup(parseBackup(await file.text()));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Invalid backup file', 'error');
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10 pt-safe">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo className="mb-5 h-20 w-20 drop-shadow-xl" />
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Vaultly</h1>
        <p className="mt-1 text-sm font-medium text-brand-400">Your little keeper of secrets</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Choose a strong master password. It encrypts everything on this device and{' '}
          <strong className="text-slate-700 dark:text-slate-200">cannot be recovered</strong> if you forget it.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="master">
            Master password
          </label>
          <PasswordInput
            id="master"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <div className="mt-2.5">
            <StrengthMeter strength={strength} />
          </div>
          {tooShort && <p className="mt-1.5 text-xs text-rose-500">Use at least {MIN_MASTER_LENGTH} characters.</p>}
          {!tooShort && password.length > 0 && strength.score < 2 && (
            <p className="mt-1.5 text-xs text-amber-500">Too easy to guess — try a longer passphrase.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Confirm password
          </label>
          <PasswordInput
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Repeat master password"
            aria-invalid={mismatch}
          />
          {mismatch && <p className="mt-1.5 text-xs text-rose-500">Passwords don’t match.</p>}
        </div>
        {error && <p className="text-sm font-medium text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={!canSubmit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? 'Securing vault…' : 'Create vault'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        or
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      <button type="button" className="btn-secondary w-full" onClick={chooseBackup}>
        <FileUp className="h-4 w-4" />
        Restore from backup file
      </button>

      <p className="mt-8 text-center text-xs text-slate-400">
        Zero-knowledge · AES-256-GCM · works fully offline. Nothing ever leaves your device.
      </p>

      <PasswordPrompt
        open={!!backup}
        title="Restore backup"
        description="Enter the master password that was used when this backup was created. It becomes this vault's master password."
        confirmLabel="Restore vault"
        onClose={() => setBackup(null)}
        onSubmit={async (pw) => {
          if (!backup) return;
          const count = await restoreVault(backup, pw);
          toast(`Restored ${count} ${count === 1 ? 'entry' : 'entries'}`);
        }}
      />
    </div>
  );
}
