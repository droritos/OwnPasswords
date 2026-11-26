import type { Strength } from '../lib/password';

const COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'];
const TEXT = ['text-rose-500', 'text-orange-500', 'text-amber-500', 'text-lime-600 dark:text-lime-400', 'text-emerald-500'];

export function StrengthMeter({ strength, showBits = true }: { strength: Strength; showBits?: boolean }) {
  const filled = strength.bits === 0 ? 0 : strength.score + 1;
  return (
    <div className="space-y-1.5" aria-label={`Password strength: ${strength.label}`}>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${i < filled ? COLORS[strength.score] : 'w-0'}`}
              style={{ width: i < filled ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>
      {strength.bits > 0 && (
        <div className="flex justify-between text-xs">
          <span className={`font-semibold ${TEXT[strength.score]}`}>{strength.label}</span>
          {showBits && <span className="text-slate-500">~{strength.bits} bits of entropy</span>}
        </div>
      )}
    </div>
  );
}
