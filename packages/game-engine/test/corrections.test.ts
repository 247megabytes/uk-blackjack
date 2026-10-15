/**
 * The two final v1.2 corrections (2026-10-15):
 *  1. Persistent pick-up restriction — once a 2 or black Jack makes a pick-up live, only a
 *     2, black Jack or red Jack may follow until a red Jack cancels it. The one confirmed
 *     exception: an Ace of the suit may end the player's own run of 2s (3♥ 2♥ A♥).
 *  2. Drawing takes priority over extra turns — after an automatic pick-up (blocked finish,
 *     Queen penalty, Last Card catch) play never bounces straight back to that player.
 */
import { describe, expect, it } from 'vitest';
import { challengeLastCard, findInvariantViolations, getLegalMoves } from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq } from './helpers';

const F = ['3C', '4C', '9D', '10D'];

describe('correction 1 — persistent pick-up restriction', () => {
  it('J♣ → 2♦ → 3♦ is rejected', () => {
    const s = scenario({ hands: [['JC', '2D', '3D', ...F], ['5H'], ['6H']], top: '9C' });
    expect(reject(s, seq('p1', ['JC', '2D', '3D']))).toBe('PICKUP_LIVE');
    expect(act(s, seq('p1', ['JC', '2D'])).pendingAttack).toEqual({ kind: 'two', amount: 7 });
  });

  it('after a 2 only a 2, a black Jack or a red Jack may follow (no runs, ranks, Queens, Kings or 8s)', () => {
    const s = scenario({ hands: [['2S', '3S', 'QS', 'KS', '8S', '2H', 'JC', 'JH', ...F], ['5H'], ['6H']], top: '9S' });
    for (const c of ['3S', 'QS', 'KS', '8S']) expect(reject(s, seq('p1', ['2S', c]))).toBe('PICKUP_LIVE');
    expect(act(s, seq('p1', ['2S', '2H'])).pendingAttack?.amount).toBe(4);
    expect(act(s, seq('p1', ['2S', 'JC'])).pendingAttack?.amount).toBe(7);
    expect(act(s, seq('p1', ['2S', 'JH'])).pendingAttack).toBeNull();
  });

  it('a Queen covered by a 2 makes the pick-up live too: Q♥ 2♥ 3♥ is refused, Q♥ 2♥ attacks', () => {
    const s = scenario({ hands: [['QH', '2H', '3H', ...F], ['5D'], ['6D']], top: '9H' });
    expect(reject(s, seq('p1', ['QH', '2H', '3H']))).toBe('PICKUP_LIVE');
    expect(act(s, seq('p1', ['QH', '2H'])).pendingAttack?.amount).toBe(2);
  });

  it('a red Jack cancels the live pick-up and normal sequence play resumes', () => {
    const s = scenario({ hands: [['2S', 'JS', 'JH', 'JD', ...F], ['5H'], ['6H']], top: '9S' });
    // 2♠ J♠ live (7) → J♥ cancels → J♦ is now an ordinary same-rank Jack.
    const after = act(s, seq('p1', ['2S', 'JS', 'JH', 'JD']));
    expect(after.pendingAttack).toBeNull();
    expect(findInvariantViolations(after)).toEqual([]);
  });

  it('under an incoming pick-up an Ace never ends a run of 2s (Aces cannot interrupt), nor after a black Jack', () => {
    const incoming = scenario({ hands: [['5C', ...F], ['2H', 'AH', '9S'], ['6H']], top: '2S', pendingAttack: { kind: 'two', amount: 2 }, current: 1 });
    expect(reject(incoming, seq('p2', ['2H', 'AH>S']))).toBe('MUST_ANSWER_ATTACK');
    const bj = scenario({ hands: [['JC', '2C', 'AC', ...F.slice(2)], ['5H'], ['6H']], top: '9C' });
    expect(reject(bj, seq('p1', ['JC', '2C', 'AC>H']))).toBe('PICKUP_LIVE');
  });

  it('the confirmed Ace exception still works: 3♥ 2♥ A♥ (and 2♠ 2♥ A♥) cancel your own pick-up and call a suit', () => {
    expect(act(scenario({ hands: [['3H', '2H', 'AH', ...F], ['5D'], ['6D']], top: '3S' }), seq('p1', ['3H', '2H', 'AH>C'])).pendingAttack).toBeNull();
    const two = act(scenario({ hands: [['2S', '2H', 'AH', ...F], ['5D'], ['6D']], top: '2C' }), seq('p1', ['2S', '2H', 'AH>D']));
    expect(two.pendingAttack).toBeNull();
    expect(two.activeSuit).toBe('D');
  });

  it('getLegalMoves and bots never produce an ordinary card after a live pick-up (shared rules)', () => {
    const s = scenario({ hands: [['2S', '3S', '7S', ...F], ['5H'], ['6H']], top: '9S' });
    for (const m of getLegalMoves(s, 'p1')) {
      if (m.type !== 'PLAY_CARDS') continue;
      const ids = m.plays.map((p) => p.cardId);
      const i = ids.indexOf('2S');
      if (i >= 0 && i < ids.length - 1) expect(['2', 'J']).toContain(ids[i + 1]!.slice(0, -1));
    }
  });
});

describe('correction 2 — drawing takes priority over extra turns', () => {
  it('1v1: a final 8 that triggers the automatic pick-up passes the turn to the opponent', () => {
    const s = act(scenario({ hands: [['8H'], ['3D', '4D']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', '8H', true));
    expect(hand(s, 'p1')).toEqual(['6C']);
    expect(current(s)).toBe('p2');
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('1v1: a final King (a skip with two players) also passes the turn', () => {
    const s = act(scenario({ hands: [['KH'], ['3D', '4D']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', 'KH', true));
    expect(current(s)).toBe('p2');
  });

  it('1v1 without a pick-up is unchanged: 8s and Kings bounce back to the player (confirmed)', () => {
    const e = act(scenario({ hands: [['8H', '5C', '6C'], ['3D', '4D']], top: '9H' }), play('p1', '8H'));
    expect(current(e)).toBe('p1');
    const k = act(scenario({ hands: [['KH', '5C', '6C'], ['3D', '4D']], top: '9H' }), play('p1', 'KH'));
    expect(current(k)).toBe('p1');
  });

  it('4 players: 8♠ 8♥ 8♦ as the last cards would skip everyone — after the pick-up the next player plays instead', () => {
    const s = act(scenario({ hands: [['8S', '8H', '8D'], ['3D'], ['4D'], ['5D']], top: '8C', drawPile: ['6C'], leftovers: 'discard' }), seq('p1', ['8S', '8H', '8D'], true));
    expect(current(s)).toBe('p2');
  });

  it('3 players: a final 8 still skips the next player (no extra turn is involved)', () => {
    const s = act(scenario({ hands: [['8H'], ['3D', '4D'], ['3S', '4S']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', '8H', true));
    expect(current(s)).toBe('p3');
  });

  it('an undeclared blocked finish opens the window; when it closes the turn still passes on', () => {
    let s = act(scenario({ hands: [['8H'], ['3D', '4D']], top: '9H', drawPile: ['6C'], leftovers: 'discard' }), play('p1', '8H'));
    expect(s.phase).toBe('lastCardWindow');
    expect(s.lastCardWindow?.resumePlayerIndex).toBe(1);
    s = act(s, { type: 'DECLARE_LAST_CARD', playerId: 'p1' });
    expect(current(s)).toBe('p2');
  });

  it('a Last Card catch penalty cancels the 8’s 1v1 bounce-back (confirmed)', () => {
    const s = act(scenario({ hands: [['7S', '8S', '9C'], ['3D', '4D']], top: '7H' }), seq('p1', ['7S', '8S']));
    expect(s.phase).toBe('lastCardWindow');
    expect(s.lastCardWindow?.resumePlayerIndex).toBe(0); // the 8 would bounce back…
    const r = challengeLastCard(s, 'p2', 'p1', 'catch');
    if (!r.ok) throw new Error(r.error.code);
    expect(hand(r.state, 'p1')).toHaveLength(3);
    expect(current(r.state)).toBe('p2'); // …but being caught passes the turn
    const declared = act(s, { type: 'DECLARE_LAST_CARD', playerId: 'p1' });
    expect(current(declared)).toBe('p1'); // declaring in time keeps the bounce-back
  });
});

describe('both corrections in Knockouts', () => {
  const ko = (s: Parameters<typeof scenario>[0]) => scenario({ ...s, mode: 'knockout' });

  it('a finished player is skipped and a final 8 between the last two active players passes the turn after the pick-up', () => {
    const s = act(ko({ hands: [[], ['8H'], ['3D', '4D']], top: '9H', statuses: ['finished', 'active', 'active'], finishOrder: ['p1'], current: 1, drawPile: ['6C'], leftovers: 'discard' }), play('p2', '8H', true));
    expect(s.phase).toBe('playing');
    expect(current(s)).toBe('p3');
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('the persistent pick-up applies in knockout rounds', () => {
    expect(reject(ko({ hands: [['JC', '2D', '3D', ...F], ['5H'], ['6H']], top: '9C' }), seq('p1', ['JC', '2D', '3D']))).toBe('PICKUP_LIVE');
  });

  it('drawing a pick-up in a round still ends the turn and the round carries on', () => {
    let s = act(ko({ hands: [['2S', ...F], ['5D', '6D'], ['5H', '6H']], top: '9S' }), play('p1', '2S'));
    s = act(s, draw('p2'));
    expect(current(s)).toBe('p3');
    expect(s.phase).toBe('playing');
  });
});
