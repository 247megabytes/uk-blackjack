import { describe, expect, it } from 'vitest';
import { applyAction, checkPlays, findInvariantViolations, nextCardOptions, playContext, type GameState } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq, top } from './helpers';

const ctxOf = (s: GameState, i = 0) => playContext(s, s.players[i]!);
const ids = (cards: { id: string }[]) => cards.map((c) => c.id).sort();

describe('multi-card sequences — legal transitions', () => {
  it("plays the confirmed example 7♥ → 7♠ 8♠ 9♠ in one turn", () => {
    const s0 = scenario({ hands: [['7S', '8S', '9S', '3C'], ['4D', '5D'], ['4H', '5H'], ['6C', '6D']], top: '7H' });
    const s = act(s0, seq('p1', ['7S', '8S', '9S']));
    expect(hand(s, 'p1')).toEqual(['3C']);
    expect(top(s)).toBe('9S');
    expect(s.discardPile.slice(-4).map((c) => c.id)).toEqual(['7H', '7S', '8S', '9S']);
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('allows same-rank chains across suits', () => {
    const s = act(scenario({ hands: [['5H', '5S', '5D', '9C', '10D'], ['3C', '4C']], top: '9H' }), seq('p1', ['5H', '5S', '5D']));
    expect(top(s)).toBe('5D');
    expect(current(s)).toBe('p2');
  });

  it('allows mixing rank steps and ascending runs: 6♥ 6♣ 7♣ 8♣ … 8♦', () => {
    const s = act(scenario({ hands: [['6H', '6C', '7C', '8C', '8D', 'KS'], ['3S', '4S'], ['3D', '4D']], top: '6S' }), seq('p1', ['6H', '6C', '7C', '8C', '8D']));
    expect(hand(s, 'p1')).toEqual(['KS']);
  });

  it('rejects a non-consecutive same-suit card (5♠ → K♠)', () => {
    expect(reject(scenario({ hands: [['5S', 'KS', '3D'], ['4C']], top: '5H' }), seq('p1', ['5S', 'KS']))).toBe('INVALID_SEQUENCE');
  });

  it('rejects runs that change suit (8♠ → 9♥)', () => {
    expect(reject(scenario({ hands: [['8S', '9H', '3D'], ['4C']], top: '8H' }), seq('p1', ['8S', '9H']))).toBe('INVALID_SEQUENCE');
  });

  it('rejects descending runs and runs past 10 (Jack/Queen/King are not numerical)', () => {
    expect(reject(scenario({ hands: [['9S', '8S', '3D'], ['4C']], top: '9H' }), seq('p1', ['9S', '8S']))).toBe('INVALID_SEQUENCE');
    expect(reject(scenario({ hands: [['10S', 'JS', '3D'], ['4C']], top: '10H' }), seq('p1', ['10S', 'JS']))).toBe('INVALID_SEQUENCE');
  });

  it('validates every transition, not just the first card', () => {
    const s = scenario({ hands: [['7S', '8S', '9S', '4D', '3C'], ['4C']], top: '7H' });
    expect(reject(s, seq('p1', ['7S', '8S', '9S', '4D']))).toBe('INVALID_SEQUENCE');
    expect(reject(s, seq('p1', ['8S', '9S']))).toBe('CARD_DOES_NOT_MATCH'); // first card must match the discard
  });

  it('rejects empty, duplicated and unknown cards', () => {
    const s = scenario({ hands: [['5H', '6H', '3C'], ['4C']], top: '9H' });
    expect(reject(s, seq('p1', []))).toBe('EMPTY_PLAY');
    expect(reject(s, seq('p1', ['5H', '5H']))).toBe('DUPLICATE_CARD');
    expect(reject(s, seq('p1', ['5H', '6D']))).toBe('CARD_NOT_IN_HAND');
  });

  it('nextCardOptions offers exactly the legal next cards', () => {
    const s = scenario({ hands: [['7S', '8S', '7D', '8H', 'KS', 'AC'], ['4C']], top: '7H' });
    const c = ctxOf(s);
    expect(ids(nextCardOptions(c, []))).toEqual(['7D', '7S', '8H', 'AC']);
    expect(ids(nextCardOptions(c, [{ cardId: '7S' }]))).toEqual(['7D', '8S', 'AC']);
    expect(ids(nextCardOptions(c, [{ cardId: '7S' }, { cardId: '8S' }]))).toEqual(['8H', 'AC']);
  });
});

describe('multi-card sequences — power cards (every power applies)', () => {
  it('an 8 inside a run still skips: 7♠ 8♠ 9♠ skips the next player', () => {
    const s = act(scenario({ hands: [['7S', '8S', '9S', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '7H' }), seq('p1', ['7S', '8S', '9S']));
    expect(current(s)).toBe('p3');
    expect(s.events.filter((e) => e.type === 'PLAYER_SKIPPED')).toHaveLength(1);
  });

  it('two 8s skip two players', () => {
    const s = act(scenario({ hands: [['8S', '8H', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '8D' }), seq('p1', ['8S', '8H']));
    expect(current(s)).toBe('p4');
  });

  it('two Kings reverse twice (direction unchanged)', () => {
    const s = act(scenario({ hands: [['KS', 'KH', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: 'KD' }), seq('p1', ['KS', 'KH']));
    expect(s.direction).toBe(1);
    expect(current(s)).toBe('p2');
    expect(s.events.filter((e) => e.type === 'DIRECTION_REVERSED')).toHaveLength(2);
  });

  it('2s stacked in one turn attack for 4; the next player must answer or pick up 4', () => {
    let s = act(scenario({ hands: [['2S', '2H', '3C', '10C'], ['4D', '5D'], ['4H']], top: '2D' }), seq('p1', ['2S', '2H']));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 4 });
    s = act(s, draw('p2'));
    expect(hand(s, 'p2')).toHaveLength(6);
  });

  it('black Jacks stacked in one turn attack for 10; a red Jack after them cancels your own attack', () => {
    const s = act(scenario({ hands: [['JS', 'JC', '3C'], ['4D'], ['4H']], top: 'JD' }), seq('p1', ['JS', 'JC']));
    expect(s.pendingAttack).toEqual({ kind: 'blackJack', amount: 10 });
    const s2 = act(scenario({ hands: [['JS', 'JH', '3C'], ['4D'], ['4H']], top: 'JD' }), seq('p1', ['JS', 'JH']));
    expect(s2.pendingAttack).toBeNull();
  });

  it('covering your own 2 with a normal card cancels its power (confirmed)', () => {
    const s = act(scenario({ hands: [['2S', '3S', '4S', '9C', '10D'], ['5D', '6D'], ['5H']], top: '2D' }), seq('p1', ['2S', '3S', '4S']));
    expect(s.pendingAttack).toBeNull();
    expect(s.events.some((e) => e.type === 'ATTACK_NEUTRALISED' && e.kind === 'two' && e.amount === 2)).toBe(true);
    expect(current(s)).toBe('p2');
  });

  it('two players: one 8 in a run gives another turn; two skips pass to the opponent', () => {
    const one = act(scenario({ hands: [['7S', '8S', '3C', '10D'], ['4D', '5D']], top: '7H' }), seq('p1', ['7S', '8S']));
    expect(current(one)).toBe('p1');
    const two = act(scenario({ hands: [['8S', '8H', '3C', '10D'], ['4D', '5D']], top: '8D' }), seq('p1', ['8S', '8H']));
    expect(current(two)).toBe('p2');
  });

  it('a final power card still cannot be the finishing card of a sequence', () => {
    const s = scenario({ hands: [['7S', '8S'], ['4D']], top: '7H' });
    expect(reject(s, seq('p1', ['7S', '8S']))).toBe('CANNOT_FINISH_ON_POWER_CARD');
    const win = act(scenario({ hands: [['7S', '8S', '9S'], ['4D']], top: '7H' }), seq('p1', ['7S', '8S', '9S']));
    expect(win.winnerId).toBe('p1');
  });
});

describe('multi-card sequences — attacks', () => {
  const twoAttack = () => act(scenario({ hands: [['2D', '5C', '6C'], ['2H', '2S', '3H', '4S'], ['9C']], top: '9D' }), play('p1', '2D'));

  it('the defender may stack several 2s in one turn', () => {
    const s = act(twoAttack(), seq('p2', ['2H', '2S']));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 6 });
    expect(current(s)).toBe('p3');
  });

  it('the defender may not continue with normal cards after stacking', () => {
    expect(reject(twoAttack(), seq('p2', ['2H', '3H']))).toBe('MUST_ANSWER_ATTACK');
  });

  it('under a black Jack attack: stack, then a red Jack may cancel — and nothing may follow it', () => {
    const bj = () => act(scenario({ hands: [['JS', '5C', '6C'], ['JC', 'JH', 'JD', '4S'], ['9C']], top: '9S' }), play('p1', 'JS'));
    const s = act(bj(), seq('p2', ['JC', 'JH']));
    expect(s.pendingAttack).toBeNull();
    expect(reject(bj(), seq('p2', ['JH', 'JD']))).toBe('MUST_ANSWER_ATTACK');
  });
});

describe('multi-card sequences — turn endings and Last Card', () => {
  it('a sequence leaving one card can declare Last Card with the play', () => {
    const s = act(scenario({ hands: [['5H', '6H', '9C'], ['4C', '3C']], top: '5S' }), seq('p1', ['5H', '6H'], true));
    expect(s.phase).toBe('playing');
    expect(s.players[0]!.declaredLastCard).toBe(true);
  });

  it('forgetting opens the Last Card window as before', () => {
    const s = act(scenario({ hands: [['5H', '6H', '9C'], ['4C', '3C']], top: '5S' }), seq('p1', ['5H', '6H']));
    expect(s.phase).toBe('lastCardWindow');
  });

  it('after drawing, only the drawn card may be played — never a sequence from it', () => {
    const s = act(scenario({ hands: [['3C', '6H'], ['4D', '5D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' }), draw('p1'));
    expect(s.turn.drawnCardId).toBe('5H');
    expect(reject(s, seq('p1', ['5H', '6H']))).toBe('ONLY_DRAWN_CARD_PLAYABLE');
    expect(top(act(s, play('p1', '5H')))).toBe('5H');
  });

  it('a whole sequence is one action: one version bump, ordered CARD_PLAYED events plus SEQUENCE_PLAYED', () => {
    const s0 = scenario({ hands: [['7S', '8S', '9S', '3C'], ['4D'], ['4H']], top: '7H' });
    const r = applyAction(s0, { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '7S' }, { cardId: '8S' }, { cardId: '9S' }], actionId: 'q' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.version).toBe(s0.version + 1);
    const played = r.events.filter((e) => e.type === 'CARD_PLAYED');
    expect(played.map((e) => (e.type === 'CARD_PLAYED' ? `${e.card.id}:${e.index}/${e.of}` : ''))).toEqual(['7S:0/3', '8S:1/3', '9S:2/3']);
    expect(r.events.some((e) => e.type === 'SEQUENCE_PLAYED')).toBe(true);
  });

  it('checkPlays agrees with the engine (shared rules for bots and UI)', () => {
    const s = scenario({ hands: [['7S', '8S', '9S', '3C'], ['4D']], top: '7H' });
    expect(checkPlays(ctxOf(s), [{ cardId: '7S' }, { cardId: '8S' }])).toBeNull();
    expect(checkPlays(ctxOf(s), [{ cardId: '8S' }])?.code).toBe('CARD_DOES_NOT_MATCH');
  });
});
