import { useState, type FormEvent } from 'react';
import { Fingerprint, Loader2, LockOpen } from 'lucide-react';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { WrongPasswordError } from '../lib/crypto';
import { useVault } from '../state/VaultContext';

export function UnlockScreen() {
  const { unlock, unlockBiometric, hasBiometric, eraseVault } = useVault();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'bio' | null>(null);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [forgot, setForgot] = useState(false);

  const fail = (err: unknown) => {
    setError(err instanceof WrongPasswordError ? 'Incorrect master password' : err instanceof Error ? err.message : String(err));
    setShake((n) => n + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy('password');
    setError('');
    try {
      await unlock(password);
    } catch (err) {
      fail(err);
      setPassword('');
      setBusy(null);
    }
  };

  const biometric = async () => {
    if (busy) return;
    setBusy('bio');
    setError('');
    try {
      await unlockBiometric();
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') setError('Biometric unlock was cancelled.');
      else fail(err);
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10 pt-safe">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo className="mb-5 h-20 w-20 drop-shadow-xl" />
        <h1 className="text-2xl font-bold tracking-tight">Vault locked</h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Enter your master password to unlock.</p>
      </div>

      <form key={shake} onSubmit={submit} className={`space-y-3 ${shake ? 'animate-shake' : ''}`}>
        <PasswordInput
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
          autoComplete="current-password"
          aria-invalid={!!error}
          aria-label="Master password"
        />
        {error && <p className="text-center text-sm font-medium text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={!password || !!busy}>
          {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
          {busy === 'password' ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>

      {hasBiometric && (
        <button
          type="button"
          onClick={biometric}
          disabled={!!busy}
          className="mx-auto mt-6 flex flex-col items-center gap-2 rounded-2xl p-3 text-sm font-medium text-brand-500 transition hover:bg-brand-500/10 disabled:opacity-50"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10 ring-1 ring-brand-500/30">
            {busy === 'bio' ? <Loader2 className="h-8 w-8 animate-spin" /> : <Fingerprint className="h-8 w-8" />}
          </span>
          Unlock with biometrics
        </button>
      )}

      <button
        type="button"
        className="mx-auto mt-10 text-xs text-slate-400 underline-offset-4 hover:underline"
        onClick={() => setForgot(true)}
      >
        Forgot master password?
      </button>

      <ConfirmDialog
        open={forgot}
        onClose={() => setForgot(false)}
        title="Forgot master password"
        destructive
        confirmLabel="Erase vault"
        message={
          <>
            <p>
              Your vault is end-to-end encrypted with your master password. Nobody — including this app — can recover
              it.
            </p>
            <p className="mt-3">
              You can erase this vault and start over, then restore from an encrypted backup if you remember{' '}
              <em>that</em> backup’s password. <strong>This permanently deletes all entries on this device.</strong>
            </p>
          </>
        }
        onConfirm={async () => {
          await eraseVault();
          setForgot(false);
          toast('Vault erased', 'info');
        }}
      />
    </div>
  );
}
