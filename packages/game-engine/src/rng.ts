/**
 * Seeded deterministic randomness.
 *
 * mulberry32: a small, fast 32-bit PRNG. Its entire state is one uint32, which we
 * store inside GameState so every transition (including reshuffles) is reproducible.
 * Not cryptographically secure — the server must choose seeds from a secure source
 * and never reveal them to clients.
 */

import type { Card } from './cards';

/** Converts any string or number seed into a uint32 initial state (FNV-1a for strings). */
export function seedToState(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Advances the PRNG. Returns a float in [0, 1) and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Returns an integer in [0, max) and the next state. */
export function nextInt(state: number, max: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * max), state: r.state };
}

/** Fisher–Yates shuffle driven by an explicit RNG state. Does not mutate input. */
export function shuffleWithState<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1);
    s = r.state;
    const j = r.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { items: out, state: s };
}

/** Public helper: deterministic shuffle of a deck from a seed. Same seed ⇒ same order. */
export function shuffleDeck(deck: readonly Card[], seed: string | number): Card[] {
  return shuffleWithState(deck, seedToState(seed)).items;
}
