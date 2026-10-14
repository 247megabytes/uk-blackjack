import { describe, expect, it } from 'vitest';
import { checkPlays, findInvariantViolations, getLegalMoves, getPlayerView, playContext, playMove, resolvePlays } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq, single, top } from './helpers';

const filler = ['3C', '4C', '9D'];

describe('v1.2 rule 1 — runs in both directions', () => {
  it('7♠ → 6♠ → 5♠ and 5♠ → 6♠ → 7♠ are both legal', () => {
    const s = scenario({ hands: [['7S', '6S', '5S', ...filler], ['4D']], top: '7H' });
    expect(top(act(s, seq('p1', ['7S', '6S', '5S'])))).toBe('5S');
    const up = scenario({ hands: [['5S', '6S', '7S', ...filler], ['4D']], top: '5H' });
    expect(top(act(up, seq('p1', ['5S', '6S', '7S'])))).toBe('7S');
  });

  it('a descending run may end on a 2 (power: attack) or continue onto an Ace (wild, ends the turn)', () => {
    const s = act(scenario({ hands: [['4S', '3S', '2S', ...filler], ['5D', '6D'], ['5H']], top: '4H' }), seq('p1', ['4S', '3S', '2S']));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 2 });
    const a = act(scenario({ hands: [['3S', '2S', 'AS', ...filler], ['5D'], ['5H']], top: '3H' }), seq('p1', ['3S', '2S', 'AS>C']));
    expect(a.activeSuit).toBe('C');
    expect(a.pendingAttack).toBeNull();
  });

  it('same-rank transitions still work between run steps', () => {
    const s = act(scenario({ hands: [['7S', '6S', '6H', '5H', ...filler], ['4D']], top: '7C' }), seq('p1', ['7S', '6S', '6H', '5H']));
    expect(top(s)).toBe('5H');
  });
});

describe('v1.2 rule 2 — red Jacks cancel any pickup attack', () => {
  it('a red Jack cancels a single 2', () => {
    const s = act(act(scenario({ hands: [['2S', ...filler], ['JD', '7D', '8D'], ['5C', '6C']], top: '9S' }), play('p1', '2S')), play('p2', 'JD'));
    expect(s.pendingAttack).toBeNull();
    expect(current(s)).toBe('p3');
    expect(hand(s, 'p2')).toEqual(['7D', '8D']);
  });

  it('a red Jack cancels the full accumulated black-Jack penalty', () => {
    let s = scenario({ hands: [['JS', ...filler], ['JC', '5D', '6D'], ['JH', '7H', '8H'], ['5C', '6C']], top: '9S' });
    s = act(act(s, play('p1', 'JS')), play('p2', 'JC'));
    expect(s.pendingAttack).toEqual({ kind: 'blackJack', amount: 10 });
    s = act(s, play('p3', 'JH'));
    expect(s.pendingAttack).toBeNull();
    expect(s.events.find((e) => e.type === 'ATTACK_CANCELLED')).toMatchObject({ cancelledAmount: 10 });
  });

  it('the defender may stack 2s and finish with a red Jack — which cancels everything, their own 2s included', () => {
    const s = act(act(scenario({ hands: [['2S', ...filler], ['2H', 'JD', '7D'], ['5C', '6C']], top: '9S' }), play('p1', '2S')), seq('p2', ['2H', 'JD']));
    expect(s.pendingAttack).toBeNull();
  });

  it('nothing may follow the cancelling red Jack', () => {
    const s = act(scenario({ hands: [['2S', ...filler], ['JD', 'JH', '7D'], ['5C']], top: '9S' }), play('p1', '2S'));
    expect(reject(s, seq('p2', ['JD', 'JH']))).toBe('MUST_ANSWER_ATTACK');
  });

  it('a red Jack cannot be the last card in hand (finishing restriction still applies)', () => {
    const s = act(scenario({ hands: [['2S', ...filler], ['JD'], ['5C']], top: '9S' }), play('p1', '2S'));
    expect(reject(s, play('p2', 'JD', true))).toBe('CANNOT_FINISH_ON_POWER_CARD');
  });
});

describe('v1.2 rule 3 — any pickup ends the turn', () => {
  it('a normal draw ends the turn even when the drawn card would be playable', () => {
    const s = act(scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['9S'], leftovers: 'discard' }), draw('p1'));
    expect(current(s)).toBe('p2');
    expect(hand(s, 'p1')).toContain('9S');
  });

  it('getLegalMoves never offers PASS', () => {
    const s = act(scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['9S'], leftovers: 'discard' }), draw('p1'));
    for (const id of ['p1', 'p2']) expect(getLegalMoves(s, id).some((m) => m.type === 'PASS')).toBe(false);
  });

  it('the one-card Queen pick-up ends the turn and the Queen stays on top', () => {
    const s = act(scenario({ hands: [['QH', '3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' }), play('p1', 'QH'));
    expect(top(s)).toBe('QH');
    expect(current(s)).toBe('p2');
    expect(hand(s, 'p1')).toEqual(['3C', '4C', '5H']);
  });
});

describe('v1.2 rule 4 — power cards only act when final', () => {
  const ctx = (hands: string[], topCard: string) => playContext(scenario({ hands: [hands, ['4D']], top: topCard }), scenario({ hands: [hands, ['4D']], top: topCard }).players[0]!);
  const P = { two: 2, blackJack: 5 };

  it('resolvePlays: covered 2 → no attack; final stacked 2s → +4', () => {
    expect(resolvePlays(ctx(['2S', '3S', ...filler], '2H'), [{ cardId: '2S' }, { cardId: '3S' }], P).attack).toBeNull();
    expect(resolvePlays(ctx(['2S', '2H', ...filler], '2D'), [{ cardId: '2S' }, { cardId: '2H' }], P).attack).toEqual({ kind: 'two', amount: 4 });
  });

  it('a black Jack covered by an Ace does nothing; a final black Jack attacks', () => {
    const covered = act(scenario({ hands: [['JS', 'AS', ...filler], ['4D'], ['4H']], top: 'JH' }), seq('p1', ['JS', 'AS>H']));
    expect(covered.pendingAttack).toBeNull();
    expect(covered.events.find((e) => e.type === 'POWER_COVERED')).toMatchObject({ cards: [{ id: 'JS' }] });
    const attacked = act(scenario({ hands: [['JD', 'JS', ...filler], ['4D'], ['4H']], top: 'JH' }), seq('p1', ['JD', 'JS']));
    expect(attacked.pendingAttack).toEqual({ kind: 'blackJack', amount: 5 });
  });

  it('inside the final block, a red Jack after your own black Jack cancels it', () => {
    const s = act(scenario({ hands: [['JS', 'JD', ...filler], ['4D'], ['4H']], top: 'JH' }), seq('p1', ['JS', 'JD']));
    expect(s.pendingAttack).toBeNull();
  });

  it('two final Kings reverse twice; two final 8s skip two', () => {
    const k = act(scenario({ hands: [['KS', 'KH', ...filler], ['4D'], ['4H'], ['6C']], top: 'KD' }), seq('p1', ['KS', 'KH']));
    expect(k.direction).toBe(1);
    const e = act(scenario({ hands: [['8S', '8H', ...filler], ['4D'], ['4H'], ['6C']], top: '8D' }), seq('p1', ['8S', '8H']));
    expect(current(e)).toBe('p4');
  });

  it('stacking across turns is preserved', () => {
    let s = scenario({ hands: [['2S', ...filler], ['2H', '2D', ...['5C', '6C']], ['7S', '8S']], top: '9S' });
    s = act(act(s, play('p1', '2S')), seq('p2', ['2H', '2D']));
    expect(s.pendingAttack).toEqual({ kind: 'two', amount: 6 });
    s = act(s, draw('p3'));
    expect(hand(s, 'p3')).toHaveLength(8);
  });
});

describe('v1.2 rule 5 — Aces must end the sequence', () => {
  it('an Ace may end a sequence of any length, the player calls the suit and the turn ends', () => {
    const s = act(scenario({ hands: [['7S', '7D', 'AC', ...filler], ['4D'], ['4H']], top: '7H' }), seq('p1', ['7S', '7D', 'AC>H']));
    expect(s.activeSuit).toBe('H');
    expect(current(s)).toBe('p2');
  });

  it('anything after an Ace is refused with ACE_MUST_BE_LAST', () => {
    const s = scenario({ hands: [['AS', '5S', 'AD', ...filler], ['4D']], top: '7H' });
    expect(reject(s, seq('p1', ['AS>S', '5S']))).toBe('ACE_MUST_BE_LAST');
    expect(reject(s, seq('p1', ['AS>S', 'AD>D']))).toBe('ACE_MUST_BE_LAST');
  });

  it('the Ace stays wild but cannot be the winning card', () => {
    expect(reject(scenario({ hands: [['7S', 'AS'], ['4D']], top: '7H', declared: [false, false] }), seq('p1', ['7S', 'AS>D'], true))).toBe('CANNOT_FINISH_ON_POWER_CARD');
  });

  it('an Ace covering a Queen is still last (Queen → Ace of that suit)', () => {
    const s = act(scenario({ hands: [['QH', 'AH', ...filler], ['4D']], top: '9H' }), seq('p1', ['QH', 'AH>S']));
    expect(s.activeSuit).toBe('S');
  });
});

describe('v1.2 rule 6 — Last Card before going out', () => {
  it('a go-out sequence without a declaration is refused', () => {
    const s = scenario({ hands: [['5H', '6H'], ['3D', '4D']], top: '5S' });
    expect(reject(s, seq('p1', ['5H', '6H']))).toBe('LAST_CARD_NOT_DECLARED');
    expect(reject(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H' }), play('p1', '5H'))).toBe('LAST_CARD_NOT_DECLARED');
  });

  it('declaring with the go-out play wins with no penalty or window', () => {
    const s = act(scenario({ hands: [['5H', '6H'], ['3D', '4D']], top: '5S' }), seq('p1', ['5H', '6H'], true));
    expect(s.phase).toBe('finished');
    expect(s.winnerId).toBe('p1');
    expect(s.events.some((e) => e.type === 'LAST_CARD_DECLARED')).toBe(true);
    expect(s.events.some((e) => e.type === 'CARDS_DRAWN' && e.reason === 'lastCardPenalty')).toBe(false);
  });

  it('an earlier declaration (on one card) also allows the finishing play', () => {
    const s = act(scenario({ hands: [['5H'], ['3D', '4D']], top: '9H', declared: [true, false] }), play('p1', '5H'));
    expect(s.winnerId).toBe('p1');
  });

  it('a multi-card go-out from several cards can be declared on the play itself', () => {
    const s = act(scenario({ hands: [['5H', '5S', '6S'], ['3D', '4D']], top: '5D' }), seq('p1', ['5H', '5S', '6S'], true));
    expect(s.winnerId).toBe('p1');
  });

  it('checkPlays, getLegalMoves and playMove agree: legal go-outs are offered declared', () => {
    const s = scenario({ hands: [['5H'], ['3D', '4D']], top: '9H' });
    const ctx = playContext(s, s.players[0]!);
    expect(checkPlays(ctx, [{ cardId: '5H' }]))?.toMatchObject({ code: 'LAST_CARD_NOT_DECLARED' });
    expect(checkPlays(ctx, [{ cardId: '5H' }], true)).toBeNull();
    expect(getLegalMoves(s, 'p1')).toContainEqual(single('5H', true));
    expect(playMove([{ cardId: '5H' }], 1, false)).toEqual({ type: 'PLAY_CARDS', plays: [{ cardId: '5H' }], declareLastCard: true });
  });

  it('the challenge window still applies to going down to one card undeclared', () => {
    const s = act(scenario({ hands: [['5H', '7C'], ['3D', '4D']], top: '9H' }), play('p1', '5H'));
    expect(s.phase).toBe('lastCardWindow');
  });
});

describe('v1.2 rule 7 — Queen covering preserved', () => {
  it('must cover when able; with no cover, draw exactly one and the turn ends', () => {
    expect(reject(scenario({ hands: [['QH', '5H', '3C'], ['4D']], top: '9H' }), play('p1', 'QH'))).toBe('QUEEN_MUST_BE_COVERED');
    const s = act(scenario({ hands: [['QH', '3C', '4C'], ['5D'], ['6D']], top: '9H', drawPile: ['7H'], leftovers: 'discard' }), play('p1', 'QH'));
    expect(s.events.filter((e) => e.type === 'CARDS_DRAWN' && e.reason === 'queenPenalty')).toHaveLength(1);
    expect(current(s)).toBe('p2');
    expect(top(s)).toBe('QH');
  });

  it('the next player must follow the uncovered Queen by suit or rank', () => {
    const s = act(scenario({ hands: [['QH', '3C', '4C'], ['5D', '6H', 'QS'], ['6D']], top: '9H', drawPile: ['7C'], leftovers: 'discard' }), play('p1', 'QH'));
    expect(reject(s, play('p2', '5D'))).toBe('CARD_DOES_NOT_MATCH');
    expect(findInvariantViolations(act(s, play('p2', '6H')))).toEqual([]);
  });
});

describe('v1.2 — views', () => {
  it('the redacted view never carries a drawn card id', () => {
    const s = act(scenario({ hands: [['3C', '4C'], ['5D', '6D']], top: '9H', drawPile: ['9S'], leftovers: 'discard' }), draw('p1'));
    expect(getPlayerView(s, 'p1').drawnCardId).toBeNull();
  });
});
