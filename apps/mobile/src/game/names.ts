/** Bot display names and avatar colours (seat order). */
export const BOT_NAMES = ['Ada', 'Monty', 'Priya', 'Reggie', 'Nell'] as const;

export const AVATAR_COLOURS = ['#C9A227', '#4E8F6E', '#B5566B', '#5B7DB1', '#9A6FB0', '#C47A3D'] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
