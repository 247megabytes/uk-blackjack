/**
 * Table geometry, independent of React Native so it can be unit-tested.
 */

export interface SeatPosition {
  /** Horizontal centre as a fraction of the opponents area width (0..1). */
  readonly x: number;
  /** Vertical centre as a fraction of the opponents area height (0..1). */
  readonly y: number;
}

/**
 * Opponent seats around the top of the table, listed in seat (clockwise) order.
 * With you at the bottom, clockwise runs up the left side, across the top, down the right.
 */
export function opponentSeats(count: number): SeatPosition[] {
  switch (count) {
    case 1:
      return [{ x: 0.5, y: 0.3 }];
    case 2:
      return [{ x: 0.25, y: 0.35 }, { x: 0.75, y: 0.35 }];
    case 3:
      return [{ x: 0.15, y: 0.7 }, { x: 0.5, y: 0.25 }, { x: 0.85, y: 0.7 }];
    case 4:
      return [{ x: 0.13, y: 0.75 }, { x: 0.36, y: 0.25 }, { x: 0.64, y: 0.25 }, { x: 0.87, y: 0.75 }];
    case 5:
      return [
        { x: 0.11, y: 0.78 },
        { x: 0.27, y: 0.26 },
        { x: 0.5, y: 0.18 },
        { x: 0.73, y: 0.26 },
        { x: 0.89, y: 0.78 },
      ];
    default:
      return [];
  }
}

export interface HandLayout {
  /** Horizontal distance between the left edges of neighbouring cards. */
  readonly step: number;
  /** Total width of the fanned hand. */
  readonly width: number;
  /** True when the hand is too big to fit and should scroll horizontally. */
  readonly scroll: boolean;
}

/** Overlaps cards so the hand fits `available` width; falls back to scrolling below `minStep`. */
export function handLayout(count: number, available: number, cardWidth: number, minStep = 26): HandLayout {
  if (count <= 0) return { step: 0, width: 0, scroll: false };
  if (count === 1) return { step: 0, width: cardWidth, scroll: false };
  const ideal = cardWidth + 6;
  const fit = (available - cardWidth) / (count - 1);
  const step = Math.max(minStep, Math.min(ideal, fit));
  const width = cardWidth + step * (count - 1);
  return { step, width, scroll: width > available + 0.5 };
}

/** Gentle fan rotation (degrees) for card `index` of `count`. */
export function fanAngle(index: number, count: number, maxSpread = 14): number {
  if (count <= 1) return 0;
  const spread = Math.min(maxSpread, count * 1.6);
  return -spread / 2 + (spread * index) / (count - 1);
}

/** Small deterministic tilt for a discard so the pile looks hand-thrown. */
export function discardTilt(cardId: string): number {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 17) - 8) * 0.9;
}

/**
 * Splits a hand into one or two rows. Two rows are used once a single row would
 * need tighter overlap than `minStep`; scrolling is the last resort for huge hands.
 */
export function handRows(count: number, available: number, cardWidth: number, minStep = 26): number[] {
  if (count <= 0) return [];
  if (!handLayout(count, available, cardWidth, minStep).scroll) return [count];
  const top = Math.ceil(count / 2);
  return [top, count - top];
}

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 } as const;
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** Display order for the hand: by suit (alternating colours), then rank. Never mutates. */
export function sortHand<T extends { suit: keyof typeof SUIT_ORDER; rank: (typeof RANK_ORDER)[number] }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
}
