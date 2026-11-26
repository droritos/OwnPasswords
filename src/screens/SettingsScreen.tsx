import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ChevronLeft,
  Download,
  FileSpreadsheet,
  FileUp,
  Fingerprint,
  KeyRound,
  Loader2,
  Moon,
  Plus,
  Share2,
  ShieldAlert,
  Tag,
  Timer,
  Trash2,
  EyeOff,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { Switch } from '../components/Switch';
import { PasswordInput } from '../components/PasswordInput';
import { PasswordPrompt } from '../components/PasswordPrompt';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StrengthMeter } from '../components/StrengthMeter';
import { useToast } from '../components/Toast';
import { useVault, PasswordRequiredError, type ImportSummary } from '../state/VaultContext';
import { useSettings } from '../state/SettingsContext';
import { parseBackup, PBKDF2_ITERATIONS, type BackupFile } from '../lib/crypto';
import { entriesFromCSV } from '../lib/csv';
import { backupFilename, canShareFile, downloadText, makeFile, pickFile, shareFile } from '../lib/files';
import { BiometricUnsupportedError, isBiometricAvailable } from '../lib/biometric';
import { assessPassword } from '../lib/password';
import { isBuiltInCategory } from '../lib/vaultModel';
import type { Entry } from '../lib/types';

const AUTO_LOCK_OPTIONS = [
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 0, label: 'Never' },
];

function summaryText(s: ImportSummary): string {
  const parts = [`${s.added} added`];
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.skipped) parts.push(`${s.skipped} skipped`);
  return `Import complete: ${parts.join(', ')}`;
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const vault = useVault();
  const { settings, updateSettings } = useSettings();
  const toast = useToast();

  const [exportFile, setExportFile] = useState<File | null>(null);
  const [exportNeedsPassword, setExportNeedsPassword] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [importBackup, setImportBackup] = useState<BackupFile | null>(null);
  const [csvEntries, setCsvEntries] = useState<Entry[] | null>(null);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [confirmBioOff, setConfirmBioOff] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [removeCat, setRemoveCat] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    void isBiometricAvailable().then(setBioAvailable);
  }, []);

  const entryCount = vault.data?.entries.length ?? 0;
  const customCategories = useMemo(
    () => (vault.data?.categories ?? []).filter((c) => !isBuiltInCategory(c)),
    [vault.data],
  );

  /** Native pickers/share sheets hide the page; don't let auto-lock fire meanwhile. */
  const withPausedLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
    vault.pauseAutoLock();
    try {
      return await fn();
    } finally {
      vault.resumeAutoLock();
    }
  };

  // ---------------------------------------------------------- export
  const prepareExport = async (password?: string) => {
    setExportBusy(true);
    try {
      const backup = await vault.buildBackup(password);
      setExportNeedsPassword(false);
      setExportFile(makeFile(backupFilename(), JSON.stringify(backup, null, 2), 'application/octet-stream'));
    } catch (err) {
      if (err instanceof PasswordRequiredError) setExportNeedsPassword(true);
      else if (password) throw err;
      else toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExportBusy(false);
    }
  };

  const doDownload = (file: File) => {
    void file.text().then((text) => downloadText(file.name, text));
    toast('Backup downloaded');
    setExportFile(null);
  };

  const doShare = async (file: File) => {
    try {
      const shared = await withPausedLock(() => shareFile(file));
      if (shared) {
        toast('Backup shared');
        setExportFile(null);
      }
    } catch {
      toast('Sharing failed — downloading instead', 'info');
      doDownload(file);
    }
  };

  // ---------------------------------------------------------- import
  const chooseBackup = async () => {
    const file = await withPausedLock(() => pickFile('.enc,.json,application/json,application/octet-stream'));
    if (!file) return;
    try {
      setImportBackup(parseBackup(await file.text()));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Invalid backup file', 'error');
    }
  };

  const chooseCsv = async () => {
    const file = await withPausedLock(() =>
      pickFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain'),
    );
    if (!file) return;
    try {
      const entries = entriesFromCSV(await file.text());
      if (!entries.length) toast('No entries found in that CSV', 'error');
      else setCsvEntries(entries);
    } catch {
      toast('Could not read that CSV file', 'error');
    }
  };

  // ---------------------------------------------------------- biometric
  const toggleBiometric = async (on: boolean) => {
    if (!on) {
      setConfirmBioOff(true);
      return;
    }
    setBioBusy(true);
    try {
      await withPausedLock(() => vault.enableBiometric());
      toast('Biometric unlock enabled');
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError') toast('Biometric setup cancelled', 'info');
      else if (err instanceof BiometricUnsupportedError) toast(err.message, 'error');
      else toast(err instanceof Error ? err.message : 'Biometric setup failed', 'error');
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-16">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/85 pt-safe backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/85">
        <div className="flex items-center gap-1 px-2 py-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to vault">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        </div>
      </header>

      <div className="space-y-7 px-4 pt-5">
        <Section title="Backup">
          <Row
            icon={<Download className="h-5 w-5" />}
            title="Export encrypted backup"
            subtitle="A .vault.enc file, protected by your master password"
            onClick={() => void prepareExport()}
            trailing={exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          />
          <Row
            icon={<FileUp className="h-5 w-5" />}
            title="Import encrypted backup"
            subtitle="Merge entries from a .vault.enc file"
            onClick={chooseBackup}
          />
          <Row
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="Import from another app"
            subtitle="CSV / TSV (comma, semicolon or tab) — encrypted immediately"
            onClick={chooseCsv}
          />
        </Section>

        <Section title="Security">
          <Row
            icon={<Timer className="h-5 w-5" />}
            title="Auto-lock"
            subtitle="Lock after inactivity"
            trailing={
              <select
                aria-label="Auto-lock timeout"
                className="rounded-lg border-0 bg-slate-100 py-1.5 pl-2.5 pr-7 text-sm font-medium dark:bg-slate-800"
                value={settings.autoLockMinutes}
                onChange={(e) => updateSettings({ autoLockMinutes: Number(e.target.value) })}
              >
                {AUTO_LOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            }
          />
          <Row
            icon={<EyeOff className="h-5 w-5" />}
            title="Lock when app is hidden"
            subtitle="Lock immediately when you switch apps or tabs"
            trailing={
              <Switch
                label="Lock when app is hidden"
                checked={settings.lockOnHidden}
                onChange={(v) => updateSettings({ lockOnHidden: v })}
              />
            }
          />
          <Row
            icon={<Fingerprint className="h-5 w-5" />}
            title="Biometric unlock"
            subtitle={
              bioAvailable
                ? 'Face ID / fingerprint via WebAuthn (this device only)'
                : 'Not available on this device or browser'
            }
            trailing={
              bioBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Switch
                  label="Biometric unlock"
                  checked={vault.hasBiometric}
                  disabled={!bioAvailable && !vault.hasBiometric}
                  onChange={toggleBiometric}
                />
              )
            }
          />
          <Row
            icon={<KeyRound className="h-5 w-5" />}
            title="Change master password"
            subtitle="Re-encrypts the vault with a new key, salt and IV"
            onClick={() => setChangePwOpen(true)}
          />
        </Section>

        <Section title="Appearance">
          <Row
            icon={<Moon className="h-5 w-5" />}
            title="Dark mode"
            trailing={
              <Switch
                label="Dark mode"
                checked={settings.theme === 'dark'}
                onChange={(v) => updateSettings({ theme: v ? 'dark' : 'light' })}
              />
            }
          />
        </Section>

        <Section title="Categories">
          <div className="space-y-3 p-4">
            <form
              className="flex gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const name = newCat.trim();
                if (!name) return;
                vault
                  .addCategory(name)
                  .then(() => {
                    setNewCat('');
                    toast(`Category “${name}” added`);
                  })
                  .catch(() => toast('Could not add category', 'error'));
              }}
            >
              <input
                className="input py-2.5"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="New category name"
                maxLength={32}
              />
              <button type="submit" className="btn-secondary px-3" disabled={!newCat.trim()} aria-label="Add category">
                <Plus className="h-4 w-4" />
              </button>
            </form>
            {customCategories.length === 0 ? (
              <p className="text-sm text-slate-500">No custom categories yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {customCategories.map((c) => (
                  <li
                    key={c}
                    className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm dark:bg-slate-800"
                  >
                    <Tag className="h-3.5 w-3.5 text-slate-400" />
                    {c}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-500 dark:hover:bg-slate-700"
                      onClick={() => setRemoveCat(c)}
                      aria-label={`Remove category ${c}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Danger zone">
          <Row
            icon={<ShieldAlert className="h-5 w-5 text-rose-500" />}
            title={<span className="text-rose-500">Erase vault from this device</span>}
            subtitle="Permanently deletes all entries stored here"
            onClick={() => setConfirmErase(true)}
          />
        </Section>

        <div className="space-y-1 pb-4 text-center text-xs text-slate-400">
          <p>
            Vaultly v{__APP_VERSION__} · {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </p>
          <p>
            AES-256-GCM · PBKDF2-SHA256 ({PBKDF2_ITERATIONS.toLocaleString()} iterations) · zero-knowledge, offline
          </p>
          <p>Built {new Date(__BUILD_TIME__).toLocaleString()}</p>
        </div>
      </div>

      {/* Export: second step so the share/download tap is a fresh user gesture. */}
      <Modal open={!!exportFile} onClose={() => setExportFile(null)} title="Backup ready">
        {exportFile && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-mono text-xs">{exportFile.name}</span> is encrypted with your current master
              password. Keep it somewhere safe, like Google Drive or Files — you’ll need that password to restore it.
            </p>
            {canShareFile(exportFile) && (
              <button type="button" className="btn-primary w-full" onClick={() => void doShare(exportFile)}>
                <Share2 className="h-4 w-4" />
                Share / Save to Drive
              </button>
            )}
            <button
              type="button"
              className={`${canShareFile(exportFile) ? 'btn-secondary' : 'btn-primary'} w-full`}
              onClick={() => doDownload(exportFile)}
            >
              <Download className="h-4 w-4" />
              Download file
            </button>
          </div>
        )}
      </Modal>

      <PasswordPrompt
        open={exportNeedsPassword}
        title="Confirm master password"
        description="You unlocked with biometrics. Enter your master password to encrypt the backup."
        confirmLabel="Create backup"
        onClose={() => setExportNeedsPassword(false)}
        onSubmit={(pw) => prepareExport(pw)}
      />

      <PasswordPrompt
        open={!!importBackup}
        title="Import backup"
        description="Enter the master password that was used when this backup was created. Entries are merged into your vault; newer versions win."
        confirmLabel="Decrypt & merge"
        onClose={() => setImportBackup(null)}
        onSubmit={async (pw) => {
          if (!importBackup) return;
          const summary = await vault.importBackup(importBackup, pw);
          setImportBackup(null);
          toast(summaryText(summary));
        }}
      />

      <ConfirmDialog
        open={!!csvEntries}
        onClose={() => setCsvEntries(null)}
        title="Import CSV"
        confirmLabel={`Import ${csvEntries?.length ?? 0}`}
        message={
          <>
            <p>
              Found <strong>{csvEntries?.length ?? 0}</strong> entries. They will be encrypted and merged into your vault
              (exact duplicates are skipped).
            </p>
            <p className="mt-3 font-medium text-amber-600 dark:text-amber-400">
              The CSV file is not encrypted — delete it from your device after importing.
            </p>
          </>
        }
        onConfirm={async () => {
          if (!csvEntries) return;
          try {
            const summary = await vault.importEntries(csvEntries);
            toast(summaryText(summary));
          } catch {
            toast('Import failed', 'error');
          }
          setCsvEntries(null);
        }}
      />

      <ChangePasswordModal open={changePwOpen} onClose={() => setChangePwOpen(false)} />

      <ConfirmDialog
        open={confirmBioOff}
        onClose={() => setConfirmBioOff(false)}
        title="Disable biometric unlock?"
        confirmLabel="Disable"
        message="The wrapped key is removed from this device. You'll need your master password to unlock. (You can delete the passkey from your device settings too.)"
        onConfirm={async () => {
          try {
            await vault.disableBiometric();
            toast('Biometric unlock disabled');
          } catch {
            toast('Could not update settings', 'error');
          }
          setConfirmBioOff(false);
        }}
      />

      <ConfirmDialog
        open={!!removeCat}
        onClose={() => setRemoveCat(null)}
        title="Remove category?"
        confirmLabel="Remove"
        destructive
        message={
          <>
            Entries in <strong>{removeCat}</strong> will be moved to <strong>Personal</strong>.
          </>
        }
        onConfirm={async () => {
          if (removeCat) await vault.removeCategory(removeCat).catch(() => toast('Could not remove', 'error'));
          setRemoveCat(null);
        }}
      />

      <ConfirmDialog
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        title="Erase vault?"
        destructive
        confirmLabel="Erase everything"
        message={
          <>
            All <strong>{entryCount}</strong> entries will be permanently deleted from this device. This cannot be
            undone. Export a backup first if you might need them.
          </>
        }
        onConfirm={async () => {
          await vault.eraseVault();
          toast('Vault erased', 'info');
        }}
      />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword, hasBiometric } = useVault();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => assessPassword(next), [next]);

  useEffect(() => {
    if (!open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const valid = !!current && next.length >= 8 && strength.score >= 2 && next === confirm && next !== current;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const hadBio = hasBiometric;
      await changePassword(current, next);
      toast(hadBio ? 'Master password changed · re-enable biometric unlock' : 'Master password changed');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change master password">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Current password</label>
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
        </div>
        <div>
          <label className="label">New password</label>
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <div className="mt-2.5">
            <StrengthMeter strength={strength} />
          </div>
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {confirm && confirm !== next && <p className="mt-1.5 text-xs text-rose-500">Passwords don’t match.</p>}
        </div>
        {hasBiometric && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Biometric unlock will be turned off and must be re-enabled afterwards.
          </p>
        )}
        <p className="text-xs text-slate-500">
          Old backups keep working with the password they were created with.
        </p>
        {error && <p className="text-sm font-medium text-rose-500">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={!valid || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Re-encrypting…' : 'Change password'}
        </button>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="card divide-y divide-slate-200/80 overflow-hidden dark:divide-slate-800">{children}</div>
    </section>
  );
}

function Row({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        {subtitle && <span className="block text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      {content}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3.5">{content}</div>
  );
}
