import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';
type ShowToast = (message: string, kind?: ToastKind) => void;

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const Ctx = createContext<ShowToast>(() => undefined);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((message, kind = 'success') => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 4500 : 3000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className="flex max-w-sm animate-toast-in items-center gap-2.5 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm font-medium text-white shadow-xl ring-1 ring-white/10 backdrop-blur dark:bg-slate-800/95"
            >
              {t.kind === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />}
              {t.kind === 'error' && <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />}
              {t.kind === 'info' && <Info className="h-5 w-5 shrink-0 text-sky-400" />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export const useToast = (): ShowToast => useContext(Ctx);
