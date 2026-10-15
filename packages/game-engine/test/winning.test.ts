import { describe, expect, it } from 'vitest';
import { checkWinner, findInvariantViolations, getLegalMoves } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq } from './helpers';

describe('winning conditions', () => {
  it('playing a final normal card wins', () => {
    const s = act(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H', declared: [true, false] }), play('p1', '5H'));
    expect(s.phase).toBe('finished');
    expect(checkWinner(s)).toEqual({ winnerId: 'p1', endReason: 'win' });
    expect(s.events.at(-1)).toMatchObject({ type: 'GAME_WON', playerId: 'p1' });
  });

  it('v1.2: Aces and Queens are still never winning cards', () => {
    const a = act(scenario({ hands: [['AH'], ['3D', '4D']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', 'AH', true));
    expect(a.phase).toBe('playing');
    const q = act(scenario({ hands: [['QS'], ['3D', '4D']], top: 'QH', drawPile: ['6C'], leftovers: 'discard' }), play('p1', 'QS', true));
    expect(q.phase).toBe('playing');
  });

  for (const [card, topCard, reason] of [
    ['2H', '9H', 'blockedFinish'],
    ['8H', '9H', 'blockedFinish'],
    ['KH', '9H', 'blockedFinish'],
    ['JH', '9H', 'blockedFinish'],
    ['JS', '9S', 'blockedFinish'],
    ['QH', '9H', 'queenPenalty'],
    ['AH', '9C', 'blockedFinish'],
  ] as const) {
    it(`v1.2: ending on ${card} is played, takes effect, picks up exactly 1 and does not win`, () => {
      const s = scenario({ hands: [[card], ['3D', '4D'], ['3S', '4S']], top: topCard, drawPile: ['6C'], leftovers: 'discard' });
      expect(getLegalMoves(s, 'p1').filter((m) => m.type === 'PLAY_CARDS')).not.toEqual([]);
      const after = act(s, play('p1', card, true));
      expect(after.phase).not.toBe('finished');
      expect(checkWinner(after)).toBeNull();
      expect(hand(after, 'p1')).toEqual(['6C']);
      const draws = after.events.filter((e) => e.type === 'CARDS_DRAWN' && e.playerId === 'p1');
      expect(draws).toHaveLength(1);
      expect(draws[0]).toMatchObject({ reason, count: 1 });
      expect(after.events.find((e) => e.type === 'FINISH_BLOCKED')).toMatchObject({ playerId: 'p1', card: { id: card } });
      expect(findInvariantViolations(after)).toEqual([]);
    });
  }

  it('the automatic pickup keeps the final card\'s power: a last 2 still attacks, a last 8 still skips', () => {
    const two = act(scenario({ hands: [['2H'], ['3D', '4D'], ['3S', '4S']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', '2H', true));
    expect(two.pendingAttack).toEqual({ kind: 'two', amount: 2 });
    expect(current(two)).toBe('p2');
    const eight = act(scenario({ hands: [['8H'], ['3D', '4D'], ['3S', '4S']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', '8H', true));
    expect(current(eight)).toBe('p3');
  });

  it('defending a pickup with your last card: it stacks, you pick up 1, and the next player faces the total', () => {
    const s = act(scenario({ hands: [['2H', '5C', '6C'], ['2D'], ['3S', '4S']], top: '9H', drawPile: ['7C'], leftovers: 'discard' }), play('p1', '2H'));
    const after = act(s, play('p2', '2D', true));
    expect(after.pendingAttack).toEqual({ kind: 'two', amount: 4 });
    expect(hand(after, 'p2')).toEqual(['7C']);
    expect(current(after)).toBe('p3');
  });

  it('after a blocked finish the one-card Last Card rules apply: declared → safe, undeclared → catch window (confirmed)', () => {
    const base = () => scenario({ hands: [['7S', '8S'], ['3D', '4D'], ['3H', '4H']], top: '7H', drawPile: ['6C'], leftovers: 'discard' });
    const declared = act(base(), seq('p1', ['7S', '8S'], true));
    expect(declared.phase).toBe('playing');
    expect(declared.players[0]!.declaredLastCard).toBe(true);
    const forgot = act(base(), seq('p1', ['7S', '8S']));
    expect(forgot.phase).toBe('lastCardWindow');
    expect(forgot.lastCardWindow).toMatchObject({ playerId: 'p1' });
  });

  it('holding only a power card, the player may play it (and pick up 1) or draw', () => {
    const s0 = scenario({ hands: [['KH'], ['3D', '4D']], top: '9H', drawPile: ['6D', '5H'], leftovers: 'discard' });
    expect(getLegalMoves(s0, 'p1')).toEqual([{ type: 'PLAY_CARDS', plays: [{ cardId: 'KH' }], declareLastCard: true }, { type: 'DRAW' }, { type: 'DECLARE_LAST_CARD' }]);
    const s1 = act(s0, draw('p1'));
    expect(s1.turn.drawnCardId).toBeNull();
    expect(current(s1)).toBe('p2');
  });

  it('no further actions are accepted after a win', () => {
    const s = act(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H' }), play('p1', '5H', true));
    expect(reject(s, draw('p2'))).toBe('GAME_OVER');
    expect(getLegalMoves(s, 'p2')).toEqual([]);
  });
});
