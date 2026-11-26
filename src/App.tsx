import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { SettingsProvider } from './state/SettingsContext';
import { VaultProvider, useVault } from './state/VaultContext';
import { ToastProvider } from './components/Toast';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { VaultScreen } from './screens/VaultScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <VaultProvider>
          <Root />
        </VaultProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}

function Root() {
  const { status, error } = useVault();
  switch (status) {
    case 'loading':
      return (
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      );
    case 'error':
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <h1 className="text-lg font-semibold">Storage unavailable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This browser blocked local storage (IndexedDB), which the vault needs. Private browsing modes often do
            this. {error}
          </p>
        </div>
      );
    case 'setup':
      return <SetupScreen />;
    case 'locked':
      return <UnlockScreen />;
    case 'unlocked':
      return <Main />;
  }
}

function Main() {
  const [view, setView] = useState<'vault' | 'settings'>('vault');
  return view === 'vault' ? (
    <VaultScreen onOpenSettings={() => setView('settings')} />
  ) : (
    <SettingsScreen onBack={() => setView('vault')} />
  );
}
