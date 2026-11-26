export function Logo({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logo-g)" />
      <path d="M176 232v-48a80 80 0 0 1 160 0v48" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" />
      <rect x="136" y="224" width="240" height="176" rx="36" fill="#fff" />
      <circle cx="256" cy="296" r="26" fill="#6366f1" />
      <rect x="244" y="300" width="24" height="52" rx="12" fill="#6366f1" />
    </svg>
  );
}
