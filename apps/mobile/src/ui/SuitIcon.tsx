import Svg, { Path } from 'react-native-svg';
import type { Suit } from '@ukbj/game-engine';
import { colors } from './theme';

/** Hand-drawn suit outlines on a 100×100 grid (no emoji, so they render identically everywhere). */
const SUIT_PATHS: Record<Suit, string> = {
  H: 'M50 90 C 22 68 5 51 5 31 C 5 16 16 6 29 6 C 39 6 46 12 50 21 C 54 12 61 6 71 6 C 84 6 95 16 95 31 C 95 51 78 68 50 90 Z',
  D: 'M50 3 C 61 21 75 37 91 50 C 75 63 61 79 50 97 C 39 79 25 63 9 50 C 25 37 39 21 50 3 Z',
  S: 'M50 5 C 62 25 94 39 94 61 C 94 75 84 83 72 83 C 64 83 57 79 53 73 C 54 83 58 90 67 96 L 33 96 C 42 90 46 83 47 73 C 43 79 36 83 28 83 C 16 83 6 75 6 61 C 6 39 38 25 50 5 Z',
  C: 'M31 29 A 19 19 0 1 0 69 29 A 19 19 0 1 0 31 29 Z M8 60 A 19 19 0 1 0 46 60 A 19 19 0 1 0 8 60 Z M54 60 A 19 19 0 1 0 92 60 A 19 19 0 1 0 54 60 Z M41 40 L 59 40 L 54 64 L 46 64 Z M50 52 C 52 73 56 86 66 96 L 34 96 C 44 86 48 73 50 52 Z',
};

export function suitColour(suit: Suit): string {
  return suit === 'H' || suit === 'D' ? colors.red : colors.ink;
}

export function SuitIcon({ suit, size, colour }: { suit: Suit; size: number; colour?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={SUIT_PATHS[suit]} fill={colour ?? suitColour(suit)} />
    </Svg>
  );
}
