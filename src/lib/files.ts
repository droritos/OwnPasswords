/** Opens the native file picker. Resolves null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let done = false;
    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };
    // Fallback for browsers without the `cancel` event: focus returns after the dialog closes.
    const onFocus = () => setTimeout(() => finish(input.files?.[0] ?? null), 1500);
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

export function downloadText(filename: string, text: string, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function makeFile(filename: string, text: string, mime = 'application/octet-stream'): File {
  return new File([text], filename, { type: mime });
}

/** True when the Web Share API can share this exact file (mainly mobile). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Returns false if the user dismissed the share sheet. */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    throw e;
  }
}

export function backupFilename(date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `ownpasswords-${d}.vault.enc`;
}
