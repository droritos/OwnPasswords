import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Switch } from '../components/Switch';
import { StrengthMeter } from '../components/StrengthMeter';
import { useCopy } from '../hooks/useCopy';
import {
  MAX_LENGTH,
  MIN_LENGTH,
  generatePassword,
  generatorEntropy,
  strengthFromBits,
  type GeneratorOptions,
} from '../lib/password';

const PREFS_KEY = 'ownpasswords.generator';
const DEFAULTS: GeneratorOptions = { length: 20, upper: true, lower: true, numbers: true, symbols: true };

function loadPrefs(): GeneratorOptions {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<GeneratorOptions>;
    return { ...DEFAULTS, ...p, length: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Number(p.length) || DEFAULTS.length)) };
  } catch {
    return DEFAULTS;
  }
}

interface PasswordGeneratorProps {
  open: boolean;
  onClose: () => void;
  onApply: (password: string) => void;
}

const TOGGLES: { key: keyof Omit<GeneratorOptions, 'length'>; label: string; sample: string }[] = [
  { key: 'upper', label: 'Uppercase', sample: 'A–Z' },
  { key: 'lower', label: 'Lowercase', sample: 'a–z' },
  { key: 'numbers', label: 'Numbers', sample: '0–9' },
  { key: 'symbols', label: 'Symbols', sample: '!@#$' },
];

export function PasswordGenerator({ open, onClose, onApply }: PasswordGeneratorProps) {
  const copy = useCopy();
  const [opts, setOpts] = useState<GeneratorOptions>(loadPrefs);
  const [value, setValue] = useState('');

  const regenerate = useCallback(() => setValue(generatePassword(opts)), [opts]);

  useEffect(() => {
    if (!open) return;
    regenerate();
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [open, opts, regenerate]);

  const strength = useMemo(() => strengthFromBits(generatorEntropy(opts)), [opts]);
  const enabledCount = TOGGLES.filter((t) => opts[t.key]).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Password generator"
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => onApply(value)} disabled={!value}>
          <Check className="h-4 w-4" />
          Apply password
        </button>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
          <p className="min-h-[3.5rem] break-all font-mono text-lg leading-snug tracking-wide" aria-live="polite">
            {value}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <StrengthMeter strength={strength} />
            </div>
            <button type="button" className="icon-btn" onClick={() => copy(value, 'Password', true)} aria-label="Copy">
              <Copy className="h-[18px] w-[18px]" />
            </button>
            <button type="button" className="icon-btn" onClick={regenerate} aria-label="Regenerate">
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="gen-length" className="label mb-0">
              Length
            </label>
            <span className="rounded-lg bg-brand-500/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-brand-500">
              {opts.length}
            </span>
          </div>
          <input
            id="gen-length"
            type="range"
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            value={opts.length}
            onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.target.value) }))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>{MIN_LENGTH}</span>
            <span>{MAX_LENGTH}</span>
          </div>
        </div>

        <div className="divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="font-mono text-xs text-slate-400">{t.sample}</div>
              </div>
              <Switch
                label={t.label}
                checked={opts[t.key]}
                // Keep at least one character set enabled.
                disabled={opts[t.key] && enabledCount === 1}
                onChange={(v) => setOpts((o) => ({ ...o, [t.key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
