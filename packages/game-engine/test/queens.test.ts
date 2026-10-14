import { describe, expect, it } from 'vitest';
import { applyAction, findInvariantViolations, getLegalMoves, getPlayerView } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq, top } from './helpers';

describe('Queen covering', () => {
  it('Q♥ → 6♥ is valid; the cover becomes the top card', () => {
    const s = act(scenario({ hands: [['QH', '6H', '3C', '10D'], ['4D'], ['4S']], top: '9H' }), seq('p1', ['QH', '6H']));
    expect(top(s)).toBe('6H');
    expect(current(s)).toBe('p2');
    expect(s.events.some((e) => e.type === 'QUEEN_COVERED' && e.queen.id === 'QH' && e.cover.id === '6H')).toBe(true);
  });

  it('a Queen you could cover must be covered', () => {
    expect(reject(scenario({ hands: [['QH', '6H', '3C'], ['4D']], top: '9H' }), play('p1', 'QH'))).toBe('QUEEN_MUST_BE_COVERED');
  });

  it('the cover must be the same suit (not another Queen, not another suit)', () => {
    const s = scenario({ hands: [['QH', 'QS', '6S', '6H', '3C'], ['4D']], top: '9H' });
    expect(reject(s, seq('p1', ['QH', 'QS']))).toBe('QUEEN_MUST_BE_COVERED');
    expect(reject(s, seq('p1', ['QH', '6S']))).toBe('QUEEN_MUST_BE_COVERED');
  });

  it('the sequence may continue from the cover (Q♥ → 6♥ → 7♥ → 7♣)', () => {
    const s = act(scenario({ hands: [['QH', '6H', '7H', '7C', '3S'], ['4D']], top: '9H' }), seq('p1', ['QH', '6H', '7H', '7C']));
    expect(hand(s, 'p1')).toEqual(['3S']);
  });

  it('a power card can cover, and its power applies (Q♥ → 2♥ attacks)', () => {
    const s = act(scenario({ hands: [['QH', '2H', '3C'], ['4D', '5D']], top: '9H' }), seq('p1', ['QH', '2H']));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 2 });
  });

  it('only the Ace of the Queen’s suit can cover it', () => {
    const s = scenario({ hands: [['QH', 'AH', 'AS', '3C'], ['4D']], top: '9H' });
    expect(reject(s, seq('p1', ['QH', 'AS>D']))).toBe('QUEEN_MUST_BE_COVERED');
    const ok = act(s, seq('p1', ['QH', 'AH>C']));
    expect(ok.activeSuit).toBe('C');
  });

  it('a Queen can join a sequence by rank, but must be covered before anything else (Q♠ → Q♥ ✗, Q♠ → 5♠ → 5♥ ✓)', () => {
    const s = scenario({ hands: [['QS', 'QH', '5S', '5H', '3C'], ['4D']], top: 'QD' });
    expect(reject(s, seq('p1', ['QS', 'QH']))).toBe('QUEEN_MUST_BE_COVERED');
    expect(top(act(s, seq('p1', ['QS', '5S', '5H'])))).toBe('5H');
  });

  it('a Queen cannot be the winning card', () => {
    expect(reject(scenario({ hands: [['QH'], ['4D']], top: '9H' }), play('p1', 'QH'))).toBe('CANNOT_FINISH_ON_POWER_CARD');
  });

  it('getLegalMoves offers Queen + cover as one complete move', () => {
    const moves = getLegalMoves(scenario({ hands: [['QH', '6H', '3C', '10D'], ['4D']], top: '9H' }), 'p1');
    expect(moves).toContainEqual({ type: 'PLAY_CARDS', plays: [{ cardId: 'QH' }, { cardId: '6H' }] });
    expect(moves.some((m) => m.type === 'PLAY_CARDS' && m.plays.length === 1 && m.plays[0]!.cardId === 'QH')).toBe(false);
  });
});

describe('Queen penalty — cannot cover', () => {
  const base = () => scenario({ hands: [['QH', '3C', '4C'], ['5D', '6D'], ['5S']], top: '9H', drawPile: ['7H'], leftovers: 'discard' });

  it('picks up exactly one card, ends the turn, and the Queen stays on top', () => {
    const r = applyAction(base(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: 'QH' }], actionId: 'q1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    expect(hand(s, 'p1')).toEqual(['3C', '4C', '7H']);
    expect(top(s)).toBe('QH');
    expect(current(s)).toBe('p2');
    expect(r.events.some((e) => e.type === 'QUEEN_UNCOVERED')).toBe(true);
    expect(r.events.filter((e) => e.type === 'CARDS_DRAWN')).toMatchObject([{ reason: 'queenPenalty', count: 1, requested: 1 }]);
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('the drawn card cannot be played that turn (even though 7♥ would match)', () => {
    const s = act(base(), play('p1', 'QH'));
    expect(s.turn.drawnCardId).toBeNull();
    expect(reject(s, play('p1', '7H'))).toBe('NOT_YOUR_TURN');
  });

  it('the next player simply plays on the Queen (suit or Queen); no cover obligation passes on', () => {
    const s = act(base(), play('p1', 'QH'));
    expect(getLegalMoves(s, 'p2').filter((m) => m.type === 'PLAY_CARDS')).toEqual([]);
    const s2 = act(scenario({ hands: [['QH', '3C', '4C'], ['5H', '6D'], ['5S']], top: '9H', drawPile: ['7S'], leftovers: 'discard' }), play('p1', 'QH'));
    expect(top(act(s2, play('p2', '5H')))).toBe('5H');
  });

  it('a cover that would have to be an illegal finishing card does not count: play the Queen and pick up', () => {
    const s0 = scenario({ hands: [['QH', '2H'], ['5D', '6D']], top: '9H', drawPile: ['7S'], leftovers: 'discard' });
    expect(reject(s0, seq('p1', ['QH', '2H']))).toBe('CANNOT_FINISH_ON_POWER_CARD');
    const s = act(s0, play('p1', 'QH'));
    expect(hand(s, 'p1')).toEqual(['2H', '7S']);
  });

  it('a Queen penalty never opens the Last Card window (the hand grows back to 2+)', () => {
    const s = act(scenario({ hands: [['QH', '3C'], ['5D', '6D']], top: '9H', drawPile: ['7S'], leftovers: 'discard' }), play('p1', 'QH'));
    expect(s.phase).toBe('playing');
    expect(hand(s, 'p1')).toHaveLength(2);
  });

  it('opponents see the penalty count but not the card', () => {
    const s = act(base(), play('p1', 'QH'));
    const ev = getPlayerView(s, 'p2').events.find((e) => e.type === 'CARDS_DRAWN');
    expect(ev).toMatchObject({ reason: 'queenPenalty', count: 1, cards: [] });
    expect(JSON.stringify(getPlayerView(s, 'p2'))).not.toContain('"7H"');
  });
});

describe('Queens after drawing', () => {
  it('v1.2: a drawn Queen waits for the next turn (picking up ends the turn)', () => {
    const s = act(scenario({ hands: [['6H', '7H', '3C'], ['4D', '5D']], top: '9H', drawPile: ['QH'], leftovers: 'discard' }), draw('p1'));
    expect(s.turn.drawnCardId).toBeNull();
    expect(current(s)).toBe('p2');
    expect(reject(s, seq('p1', ['QH', '6H']))).toBe('NOT_YOUR_TURN');
  });
});
