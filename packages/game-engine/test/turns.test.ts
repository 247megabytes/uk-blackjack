import { describe, expect, it } from 'vitest';
import { applyAction, getLegalMoves, startGame, validateAction } from '@ukbj/game-engine';
import { act, current, deepFreeze, draw, hand, pass, play, reject, scenario, single, top } from './helpers';

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
      single('5H'),
      single('9S'),
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
    const err = validateAction(base(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: 'KD' }], actionId: 'x' });
    expect(err).toMatchObject({ code: 'CARD_NOT_IN_HAND' });
    expect(validateAction(base(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '5H' }], actionId: 'x' })).toBeNull();
  });
});

describe('drawing cards', () => {
  it('draws one unplayable card and ends the turn', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['7S'], leftovers: 'discard' });
    const s = act(s0, draw('p1'));
    expect(hand(s, 'p1')).toEqual(['3C', '4C', '7S']);
    expect(current(s)).toBe('p2');
  });

  it('v1.2: drawing a playable card still ends the turn — it waits for the next turn', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['2H'], leftovers: 'discard' });
    const s = act(s0, draw('p1'));
    expect(current(s)).toBe('p2');
    expect(s.turn.drawnCardId).toBeNull();
    expect(hand(s, 'p1')).toEqual(['3C', '4C', '2H']);
    expect(reject(s, play('p1', '2H'))).toBe('NOT_YOUR_TURN');
    expect(s.pendingAttack).toBeNull();
  });

  it('v1.2: PASS is never legal (there is no drawn card to decline)', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' });
    expect(reject(s0, pass('p1'))).toBe('NOTHING_TO_PASS');
    const s = act(s0, draw('p1'));
    expect(reject(s, pass('p2'))).toBe('NOTHING_TO_PASS');
    expect(getLegalMoves(s, 'p2').some((m) => m.type === 'PASS')).toBe(false);
  });

  it('voluntary drawing is allowed while holding a playable card, and ends the turn', () => {
    const s0 = scenario({ hands: [['9C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['3H'], leftovers: 'discard' });
    expect(getLegalMoves(s0, 'p1')).toContainEqual({ type: 'DRAW' });
    const s = act(s0, draw('p1'));
    expect(current(s)).toBe('p2');
    expect(reject(s, draw('p1'))).toBe('NOT_YOUR_TURN');
  });

  it('v1.2: taking an attack penalty ends the turn and none of the cards can be played', () => {
    let s = act(scenario({ hands: [['2H', '5C', '6C'], ['3D', '4D'], ['9S', '9D']], top: '9H', drawPile: ['5H', '2D'], leftovers: 'discard' }), play('p1', '2H'));
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toEqual(['3D', '4D', '2D', '5H']);
    expect(current(s)).toBe('p3');
  });
});

describe('action idempotency and immutability', () => {
  it('replaying the same actionId is a no-op returning the same state', () => {
    const s0 = scenario({ hands: [['5H', '9S', 'KC'], ['5C', '6C']], top: '9H' });
    const action = { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '5H' }], actionId: 'dup-1' } as const;
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
    const bad = applyAction(s0, { type: 'PLAY_CARDS', playerId: 'p2', plays: [{ cardId: '5C' }], actionId: 'id-1' });
    expect(bad.ok).toBe(false);
    const good = applyAction(s0, { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '5H' }], actionId: 'id-1' });
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
    const r = applyAction(s0, { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '5H' }], actionId: 'ev' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.type)).toEqual(['CARD_PLAYED', 'TURN_STARTED']);
    for (const e of r.events) expect(e.version).toBe(r.state.version);
  });
});
