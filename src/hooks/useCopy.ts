import { useCallback } from 'react';
import { copyText } from '../lib/clipboard';
import { CLIPBOARD_CLEAR_SECONDS } from '../lib/types';
import { useToast } from '../components/Toast';

/** Copy to clipboard with a toast. Sensitive values are wiped after 30 s. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, what: string, sensitive = false) => {
      if (!text) {
        toast(`No ${what.toLowerCase()} saved`, 'info');
        return;
      }
      try {
        await copyText(text, sensitive ? CLIPBOARD_CLEAR_SECONDS : 0);
        toast(sensitive ? `${what} copied · clears in ${CLIPBOARD_CLEAR_SECONDS}s` : `${what} copied`);
      } catch {
        toast('Could not access the clipboard', 'error');
      }
    },
    [toast],
  );
}
