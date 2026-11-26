/** Deterministic avatar colour for a service name. */
export function avatarColor(seed: string): string {
  let h = 2166136261;
  const s = seed.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue} 62% 48%)`;
}

export function initialOf(title: string): string {
  const m = title.trim().match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? '?').toUpperCase();
}
