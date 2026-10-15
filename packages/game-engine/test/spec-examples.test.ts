/**
 * Every example from the v1.2 brief (docs/RULES.md), as an executable check.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, findInvariantViolations, type GameAction } from '@ukbj/game-engine';
import { act, current, deepFreeze, draw, hand, play, reject, scenario, seq, top } from './helpers';

const F = ['3C', '4C', '9D', '10D']; // filler so plays never empty the hand
const four = (p1: string[], topCard: string, extra: Partial<Parameters<typeof scenario>[0]> = {}) =>
  scenario({ hands: [[...p1, ...F], ['QD', '4D'], ['QC', '4H'], ['6C', '4S']], top: topCard, ...extra });

describe('1. Consecutive sequences — ascending and descending', () => {
  it('5♠ → 6♠ → 7♠ (ascending)', () => expect(top(act(four(['5S', '6S', '7S'], '5H'), seq('p1', ['5S', '6S', '7S'])))).toBe('7S'));
  it('9♥ → 8♥ → 7♥ (descending)', () => expect(top(act(four(['9H', '8H', '7S'], '9S'), seq('p1', ['9H', '8H'])))).toBe('8H'));
  it('9♥ → 8♥ → 7♥ in full', () => {
    const s = scenario({ hands: [['9H', '8H', '7H', ...F], ['5D'], ['5S']], top: '9S' });
    expect(top(act(s, seq('p1', ['9H', '8H', '7H'])))).toBe('7H');
  });
  it('7♠ → 7♦ (same rank)', () => expect(top(act(four(['7S', '7D'], '7C'), seq('p1', ['7S', '7D'])))).toBe('7D'));
  it('7♥ on the table → 7♠ → 8♠ → 9♠', () => expect(top(act(four(['7S', '8S', '9S'], '7H'), seq('p1', ['7S', '8S', '9S'])))).toBe('9S'));
  it('an invalid combination never partially changes the state', () => {
    const s = deepFreeze(four(['7S', '8S', '10S'], '7H'));
    const r = applyAction(s, { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '7S' }, { cardId: '8S' }, { cardId: '10S' }], actionId: 'bad' } as GameAction);
    expect(r.ok).toBe(false);
    expect(hand(s, 'p1')).toContain('7S');
    expect(s.version).toBe(1);
  });
});

describe('2. Unified pickup-card system', () => {
  it('2♠ → 2♥ = pickup 4', () => expect(act(four(['2S', '2H'], '2D'), seq('p1', ['2S', '2H'])).pendingAttack?.amount).toBe(4));
  it('J♠ → J♣ = pickup 10', () => expect(act(four(['JS', 'JC'], 'JH'), seq('p1', ['JS', 'JC'])).pendingAttack?.amount).toBe(10));
  it('2♠ → J♣ = pickup 7', () => expect(act(four(['2S', 'JC'], '2D'), seq('p1', ['2S', 'JC'])).pendingAttack?.amount).toBe(7));
  it('J♠ → 2♦ → J♣ = pickup 12', () => expect(act(four(['JS', '2D', 'JC'], 'JH'), seq('p1', ['JS', '2D', 'JC'])).pendingAttack?.amount).toBe(12));
  it('2♠ → J♣ → J♥ = pickup cancelled', () => expect(act(four(['2S', 'JC', 'JH'], '2D'), seq('p1', ['2S', 'JC', 'JH'])).pendingAttack).toBeNull());

  it('the same totals build across players: 2♠ | J♣ | 2♦ = 9, then a red Jack cancels all 9', () => {
    let s = scenario({ hands: [['2S', ...F], ['JC', 'KD', 'QD'], ['2D', '5H', '6H'], ['JH', '8S', '9S'], ['5C', '6C']], top: '2H' });
    s = act(s, play('p1', '2S'));
    s = act(s, play('p2', 'JC'));
    s = act(s, play('p3', '2D'));
    expect(s.pendingAttack?.amount).toBe(9);
    s = act(s, play('p4', 'JH'));
    expect(s.pendingAttack).toBeNull();
    expect(s.events.find((e) => e.type === 'ATTACK_CANCELLED')).toMatchObject({ cancelledAmount: 9 });
  });

  it('a player who cannot or will not answer picks up the total and the turn ends at once', () => {
    let s = act(four(['2S', 'JC'], '2D'), seq('p1', ['2S', 'JC']));
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toHaveLength(2 + 7);
    expect(current(s)).toBe('p3');
    expect(s.pendingAttack).toBeNull();
  });

  it('no other card can interrupt a pickup (suit matches, 8s, Kings, Queens and Aces are refused)', () => {
    const s = act(four(['2S'], '2D'), play('p1', '2S'));
    const p2 = scenario({ ...{ hands: [s.players[0]!.hand.map((c) => c.id), ['5S', '8S', 'KS', 'QS', 'AS'], ['5H'], ['8C']] }, top: '2S', pendingAttack: { kind: 'two', amount: 2 }, current: 1 });
    for (const c of ['5S', '8S', 'KS', 'QS', 'AS>H']) expect(reject(p2, play('p2', c))).toBe('MUST_ANSWER_ATTACK');
  });
});

describe('3. Restrictions after a Black Jack', () => {
  for (const next of ['10S', 'QS', 'KS', '8S', 'AS>H']) {
    it(`J♠ → ${next.split('>')[0]} is refused`, () => expect(reject(four(['JS', next.split('>')[0]!], '9S'), seq('p1', ['JS', next]))).toBe('BLACK_JACK_FOLLOW'));
  }
  it('J♠ → J♣, J♠ → 2♥ and J♠ → J♦ are allowed', () => {
    expect(act(four(['JS', 'JC'], '9S'), seq('p1', ['JS', 'JC'])).pendingAttack?.amount).toBe(10);
    expect(act(four(['JS', '2H'], '9S'), seq('p1', ['JS', '2H'])).pendingAttack?.amount).toBe(7);
    expect(act(four(['JS', 'JD'], '9S'), seq('p1', ['JS', 'JD'])).pendingAttack).toBeNull();
  });
  it('the restriction also applies when answering someone else’s pickup', () => {
    const s = scenario({ hands: [['5C', ...F], ['JS', 'QS', '2S', '9C'], ['5H']], top: '9S', pendingAttack: { kind: 'two', amount: 2 }, current: 1 });
    expect(reject(s, seq('p2', ['JS', 'QS']))).toBe('MUST_ANSWER_ATTACK');
    expect(act(s, seq('p2', ['JS', '2S'])).pendingAttack?.amount).toBe(9);
  });
});

describe('4. Drawing always ends the turn', () => {
  it('normal draw, pickup penalty, Queen penalty and the blocked-finish pickup all end the turn', () => {
    const normal = act(four(['5H'], '9S', { drawPile: ['9C'], leftovers: 'discard' }), draw('p1'));
    expect(current(normal)).toBe('p2');
    const penalty = act(act(four(['2S'], '2D'), play('p1', '2S')), draw('p2'));
    expect(current(penalty)).toBe('p3');
    const queen = act(four(['QH'], '9H'), play('p1', 'QH'));
    expect(current(queen)).toBe('p2');
    const blocked = act(scenario({ hands: [['KH'], ['5D', '6D'], ['5S', '6S']], top: '9H', drawPile: ['9C'], leftovers: 'discard' }), play('p1', 'KH', true));
    expect(current(blocked)).not.toBe('p1');
  });
});

describe('5. Only the top card activates its power', () => {
  it('2♠ → 3♠ is refused (correction 1 supersedes the brief\'s "no pickup" example)', () => expect(reject(four(['2S', '3S'], '2D'), seq('p1', ['2S', '3S']))).toBe('PICKUP_LIVE'));
  it('3♠ → 2♠ = pickup 2', () => expect(act(four(['3S', '2S'], '3D'), seq('p1', ['3S', '2S'])).pendingAttack?.amount).toBe(2));
  it('8♠ → 9♠ = no skip', () => expect(current(act(four(['8S', '9S'], '8D'), seq('p1', ['8S', '9S'])))).toBe('p2'));
  it('K♥ → K♣ → 7♣ = no reverse', () => {
    expect(reject(four(['KH', 'KC', '7C'], 'KD'), seq('p1', ['KH', 'KC', '7C']))).toBe('INVALID_SEQUENCE'); // K → 7 is not a legal step…
    const s = act(four(['KH', 'KC'], 'KD'), seq('p1', ['KH', 'KC'])); // …so the closest legal case: two final Kings reverse twice
    expect(s.direction).toBe(1);
  });
  it('3♥ → 2♥ → A♥ = no pickup from the Two', () => expect(act(four(['3H', '2H', 'AH'], '3S'), seq('p1', ['3H', '2H', 'AH>C'])).pendingAttack).toBeNull());
  it('every card in a final run of 8s or Kings counts (confirmed): 7♠ 8♠ 8♥ skips two', () => {
    expect(current(act(four(['7S', '8S', '8H'], '7D'), seq('p1', ['7S', '8S', '8H'])))).toBe('p4');
  });
});

describe('6. Wild Aces', () => {
  it('an Ace on its own at any time in normal play, calling a suit; the turn ends', () => {
    const s = act(four(['AS'], '9H'), play('p1', 'AS>D'));
    expect(s.activeSuit).toBe('D');
    expect(current(s)).toBe('p2');
  });
  it('no cards of the called suit (or anything else) may follow the Ace in that turn', () => {
    expect(reject(four(['AS', '5D'], '9H'), seq('p1', ['AS>D', '5D']))).toBe('ACE_MUST_BE_LAST');
  });
  it('an Ace cannot interrupt a pickup', () => {
    const s = act(four(['2S'], '2D'), play('p1', '2S'));
    const p2 = scenario({ hands: [s.players[0]!.hand.map((c) => c.id), ['AH', '5S'], ['5H'], ['8C']], top: '2S', pendingAttack: { kind: 'two', amount: 2 }, current: 1 });
    expect(reject(p2, play('p2', 'AH>S'))).toBe('MUST_ANSWER_ATTACK');
  });
  it('3♥ → 2♥ → A♥ is valid; the Ace must match the run’s suit and be last', () => {
    expect(act(four(['3H', '2H', 'AH'], '3S'), seq('p1', ['3H', '2H', 'AH>S'])).activeSuit).toBe('S');
    expect(reject(four(['3H', '2H', 'AS'], '3S'), seq('p1', ['3H', '2H', 'AS>S']))).toBe('PICKUP_LIVE');
  });
  it('a Queen can still be covered by the Ace of its suit (confirmed)', () => {
    expect(act(four(['QH', 'AH'], '9H'), seq('p1', ['QH', 'AH>C'])).activeSuit).toBe('C');
  });
});

describe('7. Queen covering', () => {
  it('Q♥ → 6♥ covers; Q♥ → Q♠ does not; a held cover must be used; the sequence may continue', () => {
    expect(top(act(four(['QH', '6H'], '9H'), seq('p1', ['QH', '6H'])))).toBe('6H');
    expect(reject(four(['QH', 'QS', '6H'], '9H'), seq('p1', ['QH', 'QS']))).toBe('QUEEN_MUST_BE_COVERED');
    expect(reject(four(['QH', '6H'], '9H'), play('p1', 'QH'))).toBe('QUEEN_MUST_BE_COVERED');
    expect(top(act(four(['QH', '6H', '7H', '7S'], '9H'), seq('p1', ['QH', '6H', '7H', '7S'])))).toBe('7S');
  });
  it('the final card of a covered-Queen sequence decides the power (Q♥ → 8♥ skips)', () => {
    expect(current(act(four(['QH', '8H'], '9H'), seq('p1', ['QH', '8H'])))).toBe('p3');
  });
});

describe('8. Playing your last card when it cannot win', () => {
  it('the card is played, its effect applies, one card is drawn, the turn ends and nobody wins', () => {
    const s = act(scenario({ hands: [['9S', '8S'], ['5D', '6D'], ['5H', '6H'], ['5C', '6C']], top: '9C', drawPile: ['9D'], leftovers: 'discard' }), seq('p1', ['9S', '8S'], true));
    expect(s.phase).toBe('playing');
    expect(s.winnerId).toBeNull();
    expect(current(s)).toBe('p3'); // the final 8 still skipped p2
    expect(hand(s, 'p1')).toEqual(['9D']);
    expect(findInvariantViolations(s)).toEqual([]);
  });
});

describe('9. Last Card with multi-card finishing sequences', () => {
  it('7♠ 8♠ 9♠ from three cards, Last Card announced with the play: a legal win, no penalty', () => {
    const s = act(scenario({ hands: [['7S', '8S', '9S'], ['5D', '6D']], top: '7H' }), seq('p1', ['7S', '8S', '9S'], true));
    expect(s.winnerId).toBe('p1');
    expect(s.endReason).toBe('win');
    expect(s.events.some((e) => e.type === 'CARDS_DRAWN' && e.reason === 'lastCardPenalty')).toBe(false);
  });
  it('without the announcement the winning play is refused (confirmed)', () => {
    expect(reject(scenario({ hands: [['7S', '8S', '9S'], ['5D', '6D']], top: '7H' }), seq('p1', ['7S', '8S', '9S']))).toBe('LAST_CARD_NOT_DECLARED');
  });
});

describe('regression: answering a pick-up always counts', () => {
  it('J♥ (cancel) → J♠ → 2♠ under a pick-up: the cancel stands and the new pick-up of 7 is live', () => {
    const s = scenario({ hands: [['5C', ...F], ['JH', 'JS', '2S', '3S', '9H'], ['5H', '6H'], ['8C', '7C']], top: '2D', pendingAttack: { kind: 'two', amount: 6 }, current: 1 });
    const after = act(s, seq('p2', ['JH', 'JS', '2S']));
    expect(after.pendingAttack).toEqual({ kind: 'two', amount: 7 });
    expect(after.events.find((e) => e.type === 'ATTACK_CANCELLED')).toMatchObject({ cancelledAmount: 6 });
    expect(findInvariantViolations(after)).toEqual([]);
    expect(reject(s, seq('p2', ['JH', 'JS', '2S', '3S']))).toBe('PICKUP_LIVE'); // nothing ordinary can cover the new pick-up
  });
});
