# OwnPasswords

An offline-first, zero-knowledge password manager that runs as an installable PWA.
Everything is encrypted on your device with the Web Crypto API. There is no backend, no account and no network calls.

**Live:** `https://<your-github-user>.github.io/OwnPasswords/`

## Features

- Master-password vault: PBKDF2-SHA256 (310,000 iterations) → AES-256-GCM, with a fresh IV on every save
- Optional biometric quick-unlock (Face ID / Touch ID / fingerprint / Windows Hello) through WebAuthn PRF
- Auto-lock after inactivity (2 min by default, configurable), plus an optional lock whenever the app is hidden
- Copied passwords are cleared from the clipboard after 30 s
- Live search, category pills (built-in and custom), favorites, one-tap copy of username or password
- Password generator: 8–64 characters, choice of character sets, live entropy meter
- Encrypted `.vault.enc` export (shared to Drive/Files on mobile where supported), encrypted import with merge, plain-CSV import
- Dark mode by default, with a light theme; mobile-first layout
- Works fully offline. A new deploy updates installed copies in the background

## Security model

| Layer | Details |
| --- | --- |
| Password key | `PBKDF2(SHA-256, 310k iters, 16-byte random salt)` → non-extractable AES-GCM-256 key |
| Vault key | Random AES-GCM-256 key, stored only **wrapped** by the password key (and optionally by the biometric key) |
| Vault data | JSON encrypted with the vault key, with a new 96-bit IV on every save |
| Biometric | A WebAuthn platform credential with the PRF extension. The PRF output goes through HKDF to an AES key that wraps the vault key. Devices without PRF support are refused rather than given a weaker fallback |
| Storage | IndexedDB holds only `{kdf params, wrapped key, ciphertext}`. The master password and raw keys are never persisted |
| In memory | Decrypted data and keys live only in React state and refs, and are dropped on lock |
| Backups | `{ app, version, kdf, iterations, salt, iv, ciphertext, timestamp }`. The vault JSON is encrypted directly with the password key, so a backup opens anywhere with just the master password |

Settings such as the theme and the auto-lock timeout are not sensitive and are kept in `localStorage`.

> JavaScript cannot securely zero memory. "Wiping on lock" means every reference is dropped so the garbage collector can free it.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173/OwnPasswords/
npm test           # crypto / generator / CSV unit tests
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active)
```

## Deploying to GitHub Pages

1. Commit `package-lock.json` (made by `npm install`). The workflow runs `npm ci`, which requires it.
2. On GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds and deploys.

If you rename the repository, change `BASE` in `vite.config.ts`.

### How auto-update works

`vite-plugin-pwa` runs with `registerType: 'autoUpdate'`. Each build gets a new precache manifest. The installed app checks for an update on launch, every hour, and whenever it comes back to the foreground. A new service worker installs in the background, activates straight away and reloads the page, which also locks the vault.

## Backups

- **Export:** Settings → Export encrypted backup. On mobile this opens the share sheet, so you can save straight to Google Drive or Files. Otherwise the file is downloaded. (Android Chrome only shares a few file types; there it falls back to a download.)
- **Import:** Settings → Import encrypted backup. You enter the master password the backup was made with, and the entries are merged in; for the same entry, the newer version wins.
- **CSV:** Settings → Import from CSV. It reads the `name,url,username,password` format that Chrome, Firefox, Bitwarden, LastPass and others export. Delete the plaintext CSV afterwards.

There is **no way to recover a forgotten master password.** Keep a backup and remember its password.
