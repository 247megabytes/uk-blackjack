import { describe, expect, it } from 'vitest';
import {
  countAllCards,
  createDeck,
  createGame,
  dealCards,
  findInvariantViolations,
  GameConfigError,
  shuffleDeck,
  startGame,
} from '@ukbj/game-engine';
import { deepFreeze } from './helpers';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));

describe('deck integrity', () => {
  it('creates 52 unique cards, 13 per suit, no Jokers', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const suit of ['S', 'H', 'D', 'C']) expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
  });

  it('shuffles deterministically from a seed', () => {
    const a = shuffleDeck(createDeck(), 'seed-1').map((c) => c.id);
    const b = shuffleDeck(createDeck(), 'seed-1').map((c) => c.id);
    const c = shuffleDeck(createDeck(), 'seed-2').map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBe(52);
  });

  it('does not mutate the input deck', () => {
    const deck = deepFreeze(createDeck());
    expect(() => shuffleDeck(deck, 42)).not.toThrow();
    expect(deck[0]!.id).toBe('AS');
  });
});

describe('dealing', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    it(`deals 7 cards each to ${n} players, turns a starter, conserves 52 cards`, () => {
      const s = startGame({ seed: `deal-${n}`, players: seats(n) });
      expect(s.phase).toBe('playing');
      for (const p of s.players) expect(p.hand).toHaveLength(7);
      expect(s.discardPile).toHaveLength(1);
      expect(s.drawPile).toHaveLength(52 - 7 * n - 1);
      expect(countAllCards(s)).toBe(52);
      expect(findInvariantViolations(s)).toEqual([]);
      expect(s.direction).toBe(1);
    });
  }

  it('is fully deterministic for a seed, including the first player', () => {
    const a = startGame({ seed: 'same', players: seats(4) });
    const b = startGame({ seed: 'same', players: seats(4) });
    expect(a).toEqual(b);
  });

  it('picks varied first players across seeds', () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 40; i++) firsts.add(startGame({ seed: i, players: seats(4) }).currentPlayerIndex);
    expect(firsts.size).toBe(4);
  });

  it('createGame and dealCards are separate, immutable steps', () => {
    const created = deepFreeze(createGame({ seed: 1, players: seats(3) }));
    expect(created.phase).toBe('dealing');
    const dealt = dealCards(created);
    expect(created.players[0]!.hand).toHaveLength(0);
    expect(dealt.players[0]!.hand).toHaveLength(7);
    expect(dealt.version).toBe(created.version + 1);
    expect(() => dealCards(dealt)).toThrow();
  });

  it('rejects invalid configurations', () => {
    expect(() => createGame({ seed: 1, players: seats(1) })).toThrow('Player count');
    expect(() => createGame({ seed: 1, players: seats(7) })).toThrow('Player count');
    expect(() => createGame({ seed: 1, players: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] })).toThrow('unique');
    let err: unknown;
    try {
      createGame({ seed: 1, players: seats(1) });
    } catch (e) {
      err = e;
    }
    expect(err instanceof GameConfigError).toBe(true);
  });

  it('records the ruleset id and schema version', () => {
    const s = startGame({ seed: 1, players: seats(2) });
    expect(s.rulesetId).toBe('uk-classic-v1');
    expect(s.schemaVersion).toBe(1);
  });
});
