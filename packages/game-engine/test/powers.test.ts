import { describe, expect, it } from 'vitest';
import { getLegalMoves, startGame } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, single, top } from './helpers';

const filler = ['3S', '4S', '5S', '6S'];

describe('stacking 2s', () => {
  it('a 2 forces the next player to draw 2 and lose their turn', () => {
    let s = scenario({ hands: [['2H', ...filler], ['9C', '7D', '6D'], ['3C', '4C']], top: '9H' });
    s = act(s, play('p1', '2H'));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 2 });
    expect(current(s)).toBe('p2');
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toHaveLength(5);
    expect(s.pendingAttack).toBeNull();
    expect(current(s)).toBe('p3'); // p2 lost their turn
  });

  it('2s stack across suits, adding 2 each', () => {
    let s = scenario({ hands: [['2H', ...filler], ['2C', '7D', '6D'], ['2S', '4C', '5C'], ['8D', 'JD']], top: '9H' });
    s = act(s, play('p1', '2H'));
    s = act(s, play('p2', '2C'));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 4 });
    s = act(s, play('p3', '2S'));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 6 });
    s = act(s, draw('p4'));
    expect(hand(s, 'p4')).toHaveLength(8);
    expect(current(s)).toBe('p1');
  });

  it('only 2s (or a red Jack, v1.2) may answer a 2 attack — no black Jacks, no suit matches', () => {
    const s = act(scenario({ hands: [['2H', ...filler], ['JS', 'JH', '5H', '9C'], ['3C']], top: '9H' }), play('p1', '2H'));
    expect(reject(s, play('p2', 'JS'))).toBe('MUST_ANSWER_ATTACK');
    expect(reject(s, play('p2', '5H'))).toBe('MUST_ANSWER_ATTACK');
    expect(getLegalMoves(s, 'p2')).toEqual([single('JH'), { type: 'DRAW' }]);
  });
});

describe('stacking black Jacks', () => {
  it('a black Jack forces the next player to draw 5', () => {
    let s = scenario({ hands: [['JS', ...filler], ['9C', '7D'], ['3C', '4C']], top: '9S' });
    s = act(s, play('p1', 'JS'));
    expect(s.pendingAttack).toEqual({ kind: 'blackJack', amount: 5 });
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toHaveLength(7);
    expect(current(s)).toBe('p3');
  });

  it('black Jacks stack for 10', () => {
    let s = scenario({ hands: [['JS', ...filler], ['JC', '7D', '6D'], ['3C', '4C']], top: '9S' });
    s = act(s, play('p1', 'JS'));
    s = act(s, play('p2', 'JC'));
    expect(s.pendingAttack).toEqual({ kind: 'blackJack', amount: 10 });
    s = act(s, draw('p3'));
    expect(hand(s, 'p3')).toHaveLength(12);
    expect(current(s)).toBe('p1');
  });

  it('a 2 cannot be mixed into a Jack attack, nor a black Jack into a 2 attack', () => {
    const jackAttack = act(scenario({ hands: [['JS', ...filler], ['2S', '9C', '7D'], ['3C']], top: '9S' }), play('p1', 'JS'));
    expect(reject(jackAttack, play('p2', '2S'))).toBe('MUST_ANSWER_ATTACK');
    expect(reject(jackAttack, play('p2', '9C'))).toBe('MUST_ANSWER_ATTACK');
    const twoAttack = act(scenario({ hands: [['2S', ...filler], ['JS', 'JC', '7D'], ['3C']], top: '9S' }), play('p1', '2S'));
    expect(reject(twoAttack, play('p2', 'JS'))).toBe('MUST_ANSWER_ATTACK');
  });
});

describe('red Jack cancellation', () => {
  it('cancels the entire pending black Jack penalty and ends the defender turn', () => {
    let s = scenario({ hands: [['JS', ...filler], ['JC', '7D', '6D'], ['JH', '4C', '5C'], ['8C', '9C']], top: '9S' });
    s = act(s, play('p1', 'JS'));
    s = act(s, play('p2', 'JC'));
    s = act(s, play('p3', 'JH'));
    expect(s.pendingAttack).toBeNull();
    expect(hand(s, 'p3')).toEqual(['4C', '5C']);
    expect(current(s)).toBe('p4');
    expect(top(s)).toBe('JH');
    expect(s.events.some((e) => e.type === 'ATTACK_CANCELLED' && e.cancelledAmount === 10)).toBe(true);
  });

  it('the next player continues normally on the red Jack', () => {
    let s = scenario({ hands: [['JS', ...filler], ['JD', '7D', '6D'], ['5D', '4C', 'QH']], top: '9S' });
    s = act(act(s, play('p1', 'JS')), play('p2', 'JD'));
    expect(getLegalMoves(s, 'p3')).toEqual([single('5D'), { type: 'DRAW' }]);
  });

  it('v1.2: also cancels a 2 attack — the whole stacked amount', () => {
    let s = scenario({ hands: [['2S', ...filler], ['2C', '8C', '9C'], ['JH', 'JD', '7D'], ['3C', '4C']], top: '9S' });
    s = act(act(s, play('p1', '2S')), play('p2', '2C'));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 4 });
    s = act(s, play('p3', 'JH'));
    expect(s.pendingAttack).toBeNull();
    expect(s.events.at(-2)).toMatchObject({ type: 'ATTACK_CANCELLED', playerId: 'p3', cancelledAmount: 4 });
    expect(hand(s, 'p3')).toEqual(['JD', '7D']);
    expect(current(s)).toBe('p4');
  });

  it('outside attacks, red Jacks match normally by suit or rank', () => {
    const base = scenario({ hands: [['JH', 'JD', ...filler], ['7C', '6C']], top: '9H' });
    const s = act(base, play('p1', 'JH'));
    expect(s.pendingAttack).toBeNull();
    expect(current(s)).toBe('p2');
    expect(reject(base, play('p1', 'JD'))).toBe('CARD_DOES_NOT_MATCH');
    // Rank match: red Jack on a black Jack top with no pending attack.
    const s2 = act(scenario({ hands: [['JD', ...filler], ['7C']], top: 'JS' }), play('p1', 'JD'));
    expect(top(s2)).toBe('JD');
  });

  it('a black Jack played outside an attack must still match suit or rank', () => {
    expect(reject(scenario({ hands: [['JS', ...filler], ['7C']], top: '9H' }), play('p1', 'JS'))).toBe('CARD_DOES_NOT_MATCH');
  });
});

describe('reverse direction (Kings)', () => {
  it('reverses play direction with 3+ players', () => {
    let s = scenario({ hands: [['3C', '4C', '5C'], ['KH', '9C', '7D'], ['3D', '4D'], ['5S', '6S']], top: '9H', current: 1 });
    s = act(s, play('p2', 'KH'));
    expect(s.direction).toBe(-1);
    expect(current(s)).toBe('p1');
  });

  it('double reverse restores clockwise', () => {
    let s = scenario({ hands: [['KC', '4C', '5C'], ['KH', '9C', '7D'], ['3D', '4D']], top: '9H', current: 1 });
    s = act(s, play('p2', 'KH'));
    s = act(s, play('p1', 'KC'));
    expect(s.direction).toBe(1);
    expect(current(s)).toBe('p2');
  });

  it('wraps around correctly anticlockwise from seat 0', () => {
    const s = act(scenario({ hands: [['KH', '4C', '5C'], ['3D'], ['4D'], ['5D']], top: '9H' }), play('p1', 'KH'));
    expect(current(s)).toBe('p4');
  });
});

describe('skipping players (Eights)', () => {
  it('skips exactly one player', () => {
    const s = act(scenario({ hands: [['8H', '4C', '5C'], ['3D'], ['4D'], ['5D']], top: '9H' }), play('p1', '8H'));
    expect(current(s)).toBe('p3');
    expect(s.pendingAttack).toBeNull();
  });

  it('respects direction when skipping', () => {
    const s = act(scenario({ hands: [['8H', '4C', '5C'], ['3D'], ['4D'], ['5D']], top: '9H', direction: -1 }), play('p1', '8H'));
    expect(current(s)).toBe('p3');
    const s2 = act(scenario({ hands: [['3H'], ['8H', '4C', '5C'], ['4D'], ['5D'], ['6D']], top: '9H', current: 1, direction: -1 }), play('p2', '8H'));
    expect(current(s2)).toBe('p5');
  });

  it('skips do not accumulate: the player after the skipped one plays normally', () => {
    let s = scenario({ hands: [['8H', '4C', '5C'], ['8C', '6C'], ['8S', '7S', '6S'], ['9D', '5D']], top: '9H' });
    s = act(s, play('p1', '8H')); // skips p2
    expect(current(s)).toBe('p3');
    s = act(s, play('p3', '8S')); // skips p4
    expect(current(s)).toBe('p1');
    expect(getLegalMoves(s, 'p1').some((m) => m.type === 'PLAY_CARDS')).toBe(false); // 4C/5C don't match 8S
  });
});

describe('two-player edge cases', () => {
  it('King gives the same player another turn', () => {
    const s = act(scenario({ hands: [['KH', '4C', '5C'], ['3D', '4D']], top: '9H' }), play('p1', 'KH'));
    expect(current(s)).toBe('p1');
    expect(s.direction).toBe(-1);
  });

  it('Eight gives the same player another turn', () => {
    const s = act(scenario({ hands: [['8H', '4C', '5C'], ['3D', '4D']], top: '9H' }), play('p1', '8H'));
    expect(current(s)).toBe('p1');
  });

  it('attacks pass to the only opponent and back', () => {
    let s = scenario({ hands: [['2H', '2D', '5C', '6C'], ['2C', '4D', '7S']], top: '9H' });
    s = act(s, play('p1', '2H'));
    s = act(s, play('p2', '2C'));
    s = act(s, play('p1', '2D'));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 6 });
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toHaveLength(8);
    expect(current(s)).toBe('p1');
  });

  it('red Jack cancel in a two-player game returns the turn to the attacker', () => {
    let s = scenario({ hands: [['JS', '5C', '6C'], ['JH', '4D', '7S']], top: '9S' });
    s = act(act(s, play('p1', 'JS')), play('p2', 'JH'));
    expect(current(s)).toBe('p1');
    expect(s.pendingAttack).toBeNull();
  });
});

describe('starter card', () => {
  it('has no power effect, even when it is a power card', () => {
    for (let i = 0; i < 300; i++) {
      const s = startGame({ seed: i, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] });
      expect(s.pendingAttack).toBeNull();
      expect(s.direction).toBe(1);
    }
  });
});
