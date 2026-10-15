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

  it('v1.2: runs go down as well as up (7♠ 6♠ 5♠ and 5♠ 6♠ 7♠)', () => {
    const down = act(scenario({ hands: [['7S', '6S', '5S', '3D'], ['4C']], top: '7H' }), seq('p1', ['7S', '6S', '5S']));
    expect(top(down)).toBe('5S');
    const up = act(scenario({ hands: [['5S', '6S', '7S', '3D'], ['4C']], top: '5H' }), seq('p1', ['5S', '6S', '7S']));
    expect(top(up)).toBe('7S');
  });

  it('v1.2: descending runs mix with same-rank steps (6♠ 5♠ 5♦ 4♦)', () => {
    const s = act(scenario({ hands: [['6S', '5S', '5D', '4D', '9C'], ['4C']], top: '6H' }), seq('p1', ['6S', '5S', '5D', '4D']));
    expect(top(s)).toBe('4D');
  });

  it('rejects jumps and runs past 10 (Jack/Queen/King are not numerical)', () => {
    expect(reject(scenario({ hands: [['9S', '7S', '3D'], ['4C']], top: '9H' }), seq('p1', ['9S', '7S']))).toBe('INVALID_SEQUENCE');
    expect(reject(scenario({ hands: [['10S', 'JS', '3D'], ['4C']], top: '10H' }), seq('p1', ['10S', 'JS']))).toBe('INVALID_SEQUENCE');
    expect(reject(scenario({ hands: [['JH', '10H', '3D'], ['4C']], top: 'JC' }), seq('p1', ['JH', '10H']))).toBe('INVALID_SEQUENCE');
    expect(reject(scenario({ hands: [['JS', '10S', '3D'], ['4C']], top: 'JH' }), seq('p1', ['JS', '10S']))).toBe('BLACK_JACK_FOLLOW');
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
    expect(ids(nextCardOptions(c, []))).toEqual(['7D', '7S', '8H', 'AC']); // an Ace on its own is always an option
    expect(ids(nextCardOptions(c, [{ cardId: '7S' }]))).toEqual(['7D', '8S']); // v1.2: no Ace mid-turn unless it ends 2→A
    expect(ids(nextCardOptions(c, [{ cardId: '7S' }, { cardId: '8S' }]))).toEqual(['8H']);
  });
});

describe('multi-card sequences — power cards (v1.2: only the final power block applies)', () => {
  it('an 8 covered by a later card does nothing: 7♠ 8♠ 9♠ skips nobody', () => {
    const s = act(scenario({ hands: [['7S', '8S', '9S', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '7H' }), seq('p1', ['7S', '8S', '9S']));
    expect(current(s)).toBe('p2');
    expect(s.events.filter((e) => e.type === 'PLAYER_SKIPPED')).toHaveLength(0);
    expect(s.events.find((e) => e.type === 'POWER_COVERED')).toMatchObject({ playerId: 'p1', cards: [{ id: '8S' }] });
  });

  it('an 8 that ends the sequence skips: 9♠ 8♠ skips the next player', () => {
    const s = act(scenario({ hands: [['9S', '8S', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '9H' }), seq('p1', ['9S', '8S']));
    expect(current(s)).toBe('p3');
  });

  it('persistent pick-up: stacked 2s cannot be covered by a normal card (3♠ 2♠ 2♣ 3♣ is refused); 3♠ 2♠ 2♣ attacks for 4', () => {
    const s0 = scenario({ hands: [['3S', '2S', '2C', '3C', '9D'], ['4D'], ['4H']], top: '3H' });
    expect(reject(s0, seq('p1', ['3S', '2S', '2C', '3C']))).toBe('PICKUP_LIVE');
    expect(act(s0, seq('p1', ['3S', '2S', '2C'])).pendingAttack).toEqual({ kind: 'two', amount: 4 });
  });

  it('a stacked power block at the end all counts even after normal cards: 6♠ 7♠ 8♠ 8♥ skips two', () => {
    const s = act(scenario({ hands: [['6S', '7S', '8S', '8H', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '6H' }), seq('p1', ['6S', '7S', '8S', '8H']));
    expect(current(s)).toBe('p4');
    expect(s.events.some((e) => e.type === 'POWER_COVERED')).toBe(false);
  });

  it('only the final block counts: in 8♠ 9♠ 9♦ 8♦ the first 8 is covered, the last one skips', () => {
    const s = act(scenario({ hands: [['8S', '9S', '9D', '8D', '3C', '10H'], ['4D'], ['4H'], ['6C']], top: '8C' }), seq('p1', ['8S', '9S', '9D', '8D']));
    expect(current(s)).toBe('p3'); // one skip, from 8♦ only
    expect(s.events.filter((e) => e.type === 'PLAYER_SKIPPED')).toHaveLength(1);
  });

  it('v1.2: an Ace can only cover a 2 of its suit (3♥ 2♥ A♥ — no pickup), not a King or 8', () => {
    expect(reject(scenario({ hands: [['KS', 'AS', '3C', '10D'], ['4D'], ['4H']], top: 'KH' }), seq('p1', ['KS', 'AS>D']))).toBe('INVALID_SEQUENCE');
    const s = act(scenario({ hands: [['3H', '2H', 'AH', '10D'], ['4D'], ['4H']], top: '3C' }), seq('p1', ['3H', '2H', 'AH>S']));
    expect(s.pendingAttack).toBeNull();
    expect(s.activeSuit).toBe('S');
  });

  it('three final 8s with four players skip everyone else: the player goes again', () => {
    const s = act(scenario({ hands: [['8S', '8H', '8D', '3C', '10D'], ['4D'], ['4H'], ['6C']], top: '8C' }), seq('p1', ['8S', '8H', '8D']));
    expect(current(s)).toBe('p1');
    expect(s.events.filter((e) => e.type === 'PLAYER_SKIPPED')).toHaveLength(3);
  });

  it('a power card can only be followed by its own rank (or a 2 by a 3 / an Ace), so final blocks are same-rank', () => {
    expect(reject(scenario({ hands: [['8S', 'KS', '3C'], ['4D']], top: '8H' }), seq('p1', ['8S', 'KS']))).toBe('INVALID_SEQUENCE');
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

  it('v1.2 correction: a normal card can no longer cover your own 2 (2♠ 3♠ 4♠ is refused)', () => {
    expect(reject(scenario({ hands: [['2S', '3S', '4S', '9C', '10D'], ['5D', '6D'], ['5H']], top: '2D' }), seq('p1', ['2S', '3S', '4S']))).toBe('PICKUP_LIVE');
  });

  it('two players: one final 8 gives another turn; two skips pass to the opponent', () => {
    const one = act(scenario({ hands: [['7S', '8S', '3C', '10D'], ['4D', '5D']], top: '7H' }), seq('p1', ['7S', '8S']));
    expect(current(one)).toBe('p1');
    const two = act(scenario({ hands: [['8S', '8H', '3C', '10D'], ['4D', '5D']], top: '8D' }), seq('p1', ['8S', '8H']));
    expect(current(two)).toBe('p2');
  });

  it('v1.2: ending the hand on a power card is played (the 8 skips) but does not win — the player picks up 1', () => {
    const s = act(scenario({ hands: [['7S', '8S'], ['4D', '5D'], ['4H', '5H']], top: '7H', drawPile: ['3C'], leftovers: 'discard' }), seq('p1', ['7S', '8S'], true));
    expect(s.phase).toBe('playing');
    expect(hand(s, 'p1')).toEqual(['3C']);
    expect(current(s)).toBe('p3');
    const win = act(scenario({ hands: [['7S', '8S', '9S'], ['4D']], top: '7H' }), seq('p1', ['7S', '8S', '9S'], true));
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

  it('under a black Jack attack: stack, then a red Jack cancels; normal rules continue after it (confirmed)', () => {
    const bj = () => act(scenario({ hands: [['JS', '5C', '6C'], ['JC', 'JH', 'JD', '4S'], ['9C']], top: '9S' }), play('p1', 'JS'));
    const s = act(bj(), seq('p2', ['JC', 'JH']));
    expect(s.pendingAttack).toBeNull();
    const s2 = act(bj(), seq('p2', ['JH', 'JD'])); // the second red Jack is an ordinary Jack now
    expect(s2.pendingAttack).toBeNull();
    const s3 = act(bj(), seq('p2', ['JH', 'JC'])); // cancel, then a fresh black Jack attack of 5
    expect(s3.pendingAttack).toEqual({ kind: 'blackJack', amount: 5 });
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

  it('v1.2: a drawn card is only playable next turn — then as part of any sequence', () => {
    let s = act(scenario({ hands: [['3C', '6H'], ['4D', '5D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' }), draw('p1'));
    expect(current(s)).toBe('p2');
    s = act(s, draw('p2'));
    expect(top(act(s, seq('p1', ['5H', '6H'])))).toBe('6H');
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
