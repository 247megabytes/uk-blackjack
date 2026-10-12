import { describe, expect, it } from 'vitest';
import { checkWinner, getLegalMoves } from '@ukbj/game-engine';
import { act, draw, play, reject, scenario } from './helpers';

describe('winning conditions', () => {
  it('playing a final normal card wins', () => {
    const s = act(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H' }), play('p1', '5H'));
    expect(s.phase).toBe('finished');
    expect(checkWinner(s)).toEqual({ winnerId: 'p1', endReason: 'win' });
    expect(s.events.at(-1)).toMatchObject({ type: 'GAME_WON', playerId: 'p1' });
  });

  it('Aces and Queens can finish', () => {
    expect(act(scenario({ hands: [['AH'], ['3D']], top: '9H' }), play('p1', 'AH')).winnerId).toBe('p1');
    expect(act(scenario({ hands: [['QS'], ['3D']], top: 'QH' }), play('p1', 'QS')).winnerId).toBe('p1');
  });

  for (const [card, topCard] of [
    ['2H', '9H'],
    ['8H', '9H'],
    ['KH', '9H'],
    ['JH', '9H'],
    ['JS', '9S'],
  ] as const) {
    it(`cannot finish on ${card}`, () => {
      const s = scenario({ hands: [[card], ['3D', '4D']], top: topCard });
      expect(reject(s, play('p1', card))).toBe('CANNOT_FINISH_ON_POWER_CARD');
      expect(getLegalMoves(s, 'p1').filter((m) => m.type === 'PLAY_CARD')).toEqual([]);
      expect(checkWinner(s)).toBeNull();
    });
  }

  it('cannot finish by defending an attack with a final power card', () => {
    const s = act(scenario({ hands: [['2H', '5C', '6C'], ['2D'], ['3S']], top: '9H' }), play('p1', '2H'));
    expect(reject(s, play('p2', '2D'))).toBe('CANNOT_FINISH_ON_POWER_CARD');
    const after = act(s, draw('p2'));
    expect(after.players[1]!.hand).toHaveLength(3);
    const j = act(scenario({ hands: [['JS', '5C', '6C'], ['JH'], ['3S']], top: '9S' }), play('p1', 'JS'));
    expect(reject(j, play('p2', 'JH'))).toBe('CANNOT_FINISH_ON_POWER_CARD');
  });

  it('holding only a power card, the player must draw instead and may play the drawn card', () => {
    const s0 = scenario({ hands: [['KH'], ['3D', '4D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' });
    expect(getLegalMoves(s0, 'p1')).toEqual([{ type: 'DRAW' }, { type: 'DECLARE_LAST_CARD' }]);
    const s1 = act(s0, draw('p1'));
    expect(s1.turn.drawnCardId).toBe('5H');
    const s2 = act(s1, play('p1', '5H', true)); // back down to one card (KH), declared
    expect(s2.phase).toBe('playing');
    expect(s2.players[0]!.declaredLastCard).toBe(true);
  });

  it('no further actions are accepted after a win', () => {
    const s = act(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H' }), play('p1', '5H'));
    expect(reject(s, draw('p2'))).toBe('GAME_OVER');
    expect(getLegalMoves(s, 'p2')).toEqual([]);
  });
});
