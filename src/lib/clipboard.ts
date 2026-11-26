/**
 * Clipboard helper with automatic clearing of sensitive values.
 * Browsers only allow clipboard writes while the page is focused, so if the
 * timer fires in the background we retry as soon as the app is visible again.
 */
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingClear = false;
let clearAt = 0;

async function write(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Legacy fallback for older WebViews.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy failed');
}

export async function copyText(text: string, clearAfterSeconds = 0): Promise<void> {
  await write(text);
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (clearAfterSeconds > 0) {
    pendingClear = true;
    clearAt = Date.now() + clearAfterSeconds * 1000;
    timer = setTimeout(() => void clearClipboard(), clearAfterSeconds * 1000);
  } else {
    pendingClear = false;
  }
}

/** Clears the clipboard if we put a secret there. `force` clears before the timer (e.g. on lock). */
export async function clearClipboard(force = false): Promise<void> {
  if (!pendingClear || (!force && Date.now() < clearAt)) return;
  try {
    await write('');
    pendingClear = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  } catch {
    /* page not focused; retried on next visibilitychange */
  }
}

if (typeof document !== 'undefined') {
  const retry = () => {
    if (document.visibilityState === 'visible') void clearClipboard();
  };
  document.addEventListener('visibilitychange', retry);
  window.addEventListener('focus', retry);
}
