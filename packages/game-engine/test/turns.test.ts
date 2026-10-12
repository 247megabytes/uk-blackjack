import { describe, expect, it } from 'vitest';
import { applyAction, getLegalMoves, startGame, validateAction } from '@ukbj/game-engine';
import { act, current, deepFreeze, draw, hand, pass, play, reject, scenario, top } from './helpers';

describe('matching suits and ranks', () => {
  const base = () => scenario({ hands: [['5H', '9S', 'QC', '4D'], ['3C', '6C']], top: '9H' });

  it('accepts a card matching the suit', () => {
    const s = act(base(), play('p1', '5H'));
    expect(top(s)).toBe('5H');
    expect(current(s)).toBe('p2');
  });

  it('accepts a card matching the rank', () => {
    expect(top(act(base(), play('p1', '9S')))).toBe('9S');
  });

  it('rejects a card matching neither', () => {
    expect(reject(base(), play('p1', 'QC'))).toBe('CARD_DOES_NOT_MATCH');
  });

  it('lists exactly the matching cards as legal plays, plus DRAW', () => {
    const moves = getLegalMoves(base(), 'p1');
    expect(moves).toEqual([
      { type: 'PLAY_CARD', cardId: '5H' },
      { type: 'PLAY_CARD', cardId: '9S' },
      { type: 'DRAW' },
    ]);
  });

  it('Aces and Queens are normal cards', () => {
    const s = act(scenario({ hands: [['AH', 'QH', '3S'], ['4C', '5C'], ['6C', '7C']], top: '2H' }), play('p1', 'AH'));
    expect(current(s)).toBe('p2');
    expect(s.pendingAttack).toBeNull();
    expect(s.direction).toBe(1);
    const s2 = act(scenario({ hands: [['QH', '3S', '4S'], ['4C'], ['6C']], top: 'QS' }), play('p1', 'QH'));
    expect(current(s2)).toBe('p2');
  });
});

describe('invalid moves', () => {
  const base = () => scenario({ hands: [['5H', '9S'], ['5C', '6C']], top: '9H' });

  it('rejects acting out of turn', () => {
    expect(reject(base(), play('p2', '5C'))).toBe('NOT_YOUR_TURN');
    expect(reject(base(), draw('p2'))).toBe('NOT_YOUR_TURN');
  });

  it('rejects cards not in hand', () => {
    expect(reject(base(), play('p1', '9C'))).toBe('CARD_NOT_IN_HAND');
  });

  it('rejects unknown players', () => {
    expect(reject(base(), play('zz', '5H'))).toBe('UNKNOWN_PLAYER');
  });

  it('rejects passing without drawing', () => {
    expect(reject(base(), pass('p1'))).toBe('NOTHING_TO_PASS');
  });

  it('rejects stale versions', () => {
    const s = base();
    expect(reject(s, { ...play('p1', '5H'), expectedVersion: s.version - 1 })).toBe('STALE_VERSION');
    expect(() => act(s, { ...play('p1', '5H'), expectedVersion: s.version })).not.toThrow();
  });

  it('rejects actions before dealing and after the game ends', () => {
    const s = { ...base(), phase: 'finished' as const, endReason: 'win' as const };
    expect(reject(s, play('p1', '5H'))).toBe('GAME_OVER');
    expect(reject({ ...base(), phase: 'dealing' as const }, play('p1', '5H'))).toBe('WRONG_PHASE');
  });

  it('validateAction returns typed errors without throwing', () => {
    const err = validateAction(base(), { type: 'PLAY_CARD', playerId: 'p1', cardId: 'KD', actionId: 'x' });
    expect(err).toMatchObject({ code: 'CARD_NOT_IN_HAND' });
    expect(validateAction(base(), { type: 'PLAY_CARD', playerId: 'p1', cardId: '5H', actionId: 'x' })).toBeNull();
  });
});

describe('drawing cards', () => {
  it('draws one unplayable card and ends the turn', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['7S'], leftovers: 'discard' });
    const s = act(s0, draw('p1'));
    expect(hand(s, 'p1')).toEqual(['3C', '4C', '7S']);
    expect(current(s)).toBe('p2');
  });

  it('a newly drawn playable card may be played immediately', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['2H'], leftovers: 'discard' });
    const s = act(s0, draw('p1'));
    expect(current(s)).toBe('p1');
    expect(s.turn.drawnCardId).toBe('2H');
    expect(getLegalMoves(s, 'p1')).toEqual([{ type: 'PLAY_CARD', cardId: '2H' }, { type: 'PASS' }]);
    const s2 = act(s, play('p1', '2H'));
    expect(top(s2)).toBe('2H');
    expect(s2.pendingAttack).toEqual({ kind: 'two', amount: 2 });
  });

  it('may decline the drawn playable card by passing', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' });
    const s = act(act(s0, draw('p1')), pass('p1'));
    expect(current(s)).toBe('p2');
    expect(hand(s, 'p1')).toContain('5H');
  });

  it('voluntary drawing is allowed, but only the drawn card may be played afterwards', () => {
    const s0 = scenario({ hands: [['9C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['3H'], leftovers: 'discard' });
    expect(getLegalMoves(s0, 'p1')).toContainEqual({ type: 'DRAW' });
    const s = act(s0, draw('p1'));
    expect(reject(s, play('p1', '9C'))).toBe('ONLY_DRAWN_CARD_PLAYABLE');
    expect(reject(s, draw('p1'))).toBe('ALREADY_DRAWN');
    expect(top(act(s, play('p1', '3H')))).toBe('3H');
  });
});

describe('action idempotency and immutability', () => {
  it('replaying the same actionId is a no-op returning the same state', () => {
    const s0 = scenario({ hands: [['5H', '9S', 'KC'], ['5C', '6C']], top: '9H' });
    const action = { type: 'PLAY_CARD', playerId: 'p1', cardId: '5H', actionId: 'dup-1' } as const;
    const r1 = applyAction(s0, action);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = applyAction(r1.state, action);
    expect(r2.ok && r2.duplicate).toBe(true);
    if (r2.ok) {
      expect(r2.state).toBe(r1.state);
      expect(r2.events).toHaveLength(0);
    }
  });

  it('rejected actions do not consume the actionId', () => {
    const s0 = scenario({ hands: [['5H', '9S', 'KC'], ['5C', '6C']], top: '9H' });
    const bad = applyAction(s0, { type: 'PLAY_CARD', playerId: 'p2', cardId: '5C', actionId: 'id-1' });
    expect(bad.ok).toBe(false);
    const good = applyAction(s0, { type: 'PLAY_CARD', playerId: 'p1', cardId: '5H', actionId: 'id-1' });
    expect(good.ok && !good.duplicate).toBe(true);
  });

  it('never mutates the input state and bumps version by exactly one', () => {
    const s0 = deepFreeze(startGame({ seed: 'imm', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }));
    const who = s0.players[s0.currentPlayerIndex]!.id;
    const move = getLegalMoves(s0, who)[0]!;
    const res = applyAction(s0, { ...move, playerId: who, actionId: 'm1' } as Parameters<typeof applyAction>[1]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.version).toBe(s0.version + 1);
  });

  it('emits events stamped with the new version', () => {
    const s0 = scenario({ hands: [['5H', '9S', 'KC'], ['5C', '6C']], top: '9H' });
    const r = applyAction(s0, { type: 'PLAY_CARD', playerId: 'p1', cardId: '5H', actionId: 'ev' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.type)).toEqual(['CARD_PLAYED', 'TURN_STARTED']);
    for (const e of r.events) expect(e.version).toBe(r.state.version);
  });
});
