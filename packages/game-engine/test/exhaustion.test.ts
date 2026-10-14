import { describe, expect, it } from 'vitest';
import { checkWinner, countAllCards, findInvariantViolations, getLegalMoves, recycleDiscardPile } from '@ukbj/game-engine';
import { act, current, draw, hand, ids, pass, play, reject, scenario, top } from './helpers';

describe('deck exhaustion', () => {
  it('recycles discards except the visible top card, without duplicating cards', () => {
    const s0 = scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: [], leftovers: 'discard' });
    const before = s0.discardPile.length;
    const s = recycleDiscardPile(s0);
    expect(top(s)).toBe('9H');
    expect(s.discardPile).toHaveLength(1);
    expect(s.drawPile).toHaveLength(before - 1);
    expect(ids(s.drawPile)).not.toContain('9H');
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('recycling is deterministic and advances the stored RNG state', () => {
    const s0 = scenario({ hands: [['3C'], ['5D']], top: '9H', drawPile: [], leftovers: 'discard' });
    const a = recycleDiscardPile(s0);
    expect(ids(a.drawPile)).toEqual(ids(recycleDiscardPile(s0).drawPile));
    expect(a.rngState).not.toBe(s0.rngState);
  });

  it('automatically recycles mid-draw when the draw pile runs out', () => {
    let s = scenario({ hands: [['JS', '3S', '4S'], ['7D', '6D']], top: '9S', drawPile: ['5C'], leftovers: 'discard' });
    s = act(s, play('p1', 'JS'));
    s = act(s, draw('p2')); // penalty of 5 with only 1 card in the draw pile
    expect(hand(s, 'p2')).toHaveLength(7);
    expect(top(s)).toBe('JS');
    expect(s.events.some((e) => e.type === 'DISCARDS_RECYCLED')).toBe(true);
    expect(countAllCards(s)).toBe(52);
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('fulfils as much of a draw as possible when cards run short', () => {
    const spadesHearts = ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'QS', 'KS', 'AH', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', 'JH', 'QH', 'KH'];
    const diamondsClubs = ['AD', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD', 'QD', 'KD', 'AC', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C'];
    let s = scenario({
      hands: [['JS', ...spadesHearts.slice(0, 5)], [...diamondsClubs, ...spadesHearts.slice(5)]],
      top: 'JC',
      drawPile: ['QC'],
      discardUnder: ['KC'],
      leftovers: 'none',
    });
    expect(countAllCards(s)).toBe(52);
    s = act(s, play('p1', 'JS')); // black Jack attack of 5; only QC, KC and JC (under the new top) are drawable
    s = act(s, draw('p2'));
    expect(s.events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({ requested: 5, count: 3, reason: 'blackJackPenalty' });
    expect(s.drawPile).toHaveLength(0);
    expect(s.discardPile).toHaveLength(1);
    expect(countAllCards(s)).toBe(52);
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('rejects DRAW with MUST_PLAY when nothing is drawable and a play exists', () => {
    const s = scenario({ hands: [['5H', '7C'], ['3D']], top: '9H', drawPile: [], discardUnder: [], leftovers: 'none' });
    expect(reject(s, draw('p1'))).toBe('MUST_PLAY');
    expect(getLegalMoves(s, 'p1').some((m) => m.type === 'DRAW')).toBe(false);
  });

  it('allows drawing nothing (a pass) when nothing is drawable and no play exists', () => {
    const s = scenario({ hands: [['3C', '7C'], ['5H', '6D']], top: '9H', drawPile: [], discardUnder: [], leftovers: 'none' });
    const after = act(s, draw('p1'));
    expect(hand(after, 'p1')).toEqual(['3C', '7C']);
    expect(after.phase).toBe('playing');
    expect(after.players[after.currentPlayerIndex]!.id).toBe('p2');
  });
});

/*
 * Stalemates. With a full 52-card deck a true deadlock (nothing drawable and nobody
 * able to play) cannot arise under uk-classic-v1: the 15 cards matching any top card
 * cannot all be held as single, unplayable power cards by at most six players. The
 * engine still detects it defensively (tested on reduced layouts below), and a
 * configurable turn cap (rules.maxTurns) resolves endless no-progress games.
 */
describe('stalemate detection and resolution', () => {
  it('declares a stalemate when nothing can be drawn and nobody can play (tie → draw)', () => {
    const s = scenario({ hands: [['3C', '4C'], ['2H'], ['KH']], top: '9H', drawPile: [], discardUnder: [], leftovers: 'none' });
    const after = act(s, draw('p1'));
    expect(after.phase).toBe('finished');
    expect(checkWinner(after)).toEqual({ winnerId: null, endReason: 'stalemate' });
    expect(after.events.at(-1)).toMatchObject({ type: 'STALEMATE', winnerId: null });
  });

  it('awards a stalemate to the unique smallest hand', () => {
    const s = scenario({ hands: [['3C', '4C'], ['2H'], ['KC', '5C']], top: '9H', drawPile: [], discardUnder: [], leftovers: 'none' });
    expect(checkWinner(act(s, draw('p1')))).toEqual({ winnerId: 'p2', endReason: 'stalemate' });
  });

  it('does not declare a stalemate while an attack is outstanding', () => {
    const s = scenario({ hands: [['2C', '3C', '4C'], ['2H'], ['KH']], top: '9C', drawPile: [], discardUnder: [], leftovers: 'none' });
    const after = act(s, play('p1', '2C'));
    expect(after.phase).toBe('playing');
    expect(after.pendingAttack).toEqual({ kind: 'two', amount: 2 });
  });

  it('resolves a game that exceeds the turn cap', () => {
    let s = scenario({ hands: [['3C', '4C', '5C'], ['6D', '7D']], top: '9H', drawPile: ['2S', 'AH'], leftovers: 'discard' });
    s = { ...s, rules: { ...s.rules, maxTurns: 2 }, turnNumber: 1 };
    s = act(s, draw('p1')); // draws AH: picking up ends the turn (v1.2), turn 2 starts
    expect(s.phase).toBe('playing');
    expect(current(s)).toBe('p2');
    s = act(s, draw('p2')); // 2S does not match 9H: ending turn 2 hits the cap
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('stalemate');
    expect(s.winnerId).toBe('p2'); // 3 cards vs p1's 4
  });
});
