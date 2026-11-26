import { avatarColor, initialOf } from '../lib/color';

export function Avatar({ title, size = 'md' }: { title: string; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-16 w-16 text-2xl rounded-2xl' : 'h-11 w-11 text-lg rounded-xl';
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold text-white shadow-inner ${dims}`}
      style={{ background: `linear-gradient(135deg, ${avatarColor(title)}, ${avatarColor(title + '~')})` }}
    >
      {initialOf(title)}
    </div>
  );
}
