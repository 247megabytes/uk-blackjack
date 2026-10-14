import { describe, expect, it } from 'vitest';
import { applyAction, findInvariantViolations, getLegalMoves, getPlayerView, startGame } from '@ukbj/game-engine';
import { act, current, play, reject, scenario, seq, top } from './helpers';

describe('wild Aces', () => {
  it('can be played on anything and sets the chosen suit', () => {
    const s = act(scenario({ hands: [['AH', '3C', '4C'], ['5S', '5H'], ['6D']], top: '9C' }), play('p1', 'AH>S'));
    expect(top(s)).toBe('AH');
    expect(s.activeSuit).toBe('S');
    expect(s.events.some((e) => e.type === 'SUIT_CHOSEN' && e.suit === 'S')).toBe(true);
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('the chosen suit overrides the printed suit for the next player', () => {
    const s = act(scenario({ hands: [['AH', '3C', '4C'], ['5S', '5H', 'AD'], ['6D']], top: '9C' }), play('p1', 'AH>S'));
    expect(reject(s, play('p2', '5H'))).toBe('CARD_DOES_NOT_MATCH');
    expect(top(act(s, play('p2', '5S')))).toBe('5S');
    const afterAce = act(s, play('p2', 'AD>C'));
    expect(afterAce.activeSuit).toBe('C');
  });

  it('a normal card covering the Ace clears the chosen suit', () => {
    let s = act(scenario({ hands: [['AH', '3C', '4C'], ['5S', '6S'], ['6D', '5D']], top: '9C' }), play('p1', 'AH>S'));
    s = act(s, play('p2', '5S'));
    expect(s.activeSuit).toBeNull();
  });

  it('getLegalMoves lists one option per suit for each Ace', () => {
    const moves = getLegalMoves(scenario({ hands: [['AH', '3C'], ['5S']], top: '9D' }), 'p1').filter((m) => m.type === 'PLAY_CARDS');
    expect(moves.map((m) => (m.type === 'PLAY_CARDS' ? m.plays[0]!.chosenSuit : ''))).toEqual(['S', 'H', 'D', 'C']);
  });

  it('the active suit is public in every player view', () => {
    const s = act(scenario({ hands: [['AH', '3C', '4C'], ['5S']], top: '9C' }), play('p1', 'AH>D'));
    expect(getPlayerView(s, 'p2').activeSuit).toBe('D');
    expect(getPlayerView(s, null).activeSuit).toBe('D');
  });
});

describe('wild Aces — invalid suit selections', () => {
  const s = () => scenario({ hands: [['AH', '5C', '3C'], ['4D']], top: '9C' });

  it('rejects an Ace without a suit', () => {
    const r = applyAction(s(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: 'AH' }], actionId: 'a' });
    expect(!r.ok && r.error.code).toBe('SUIT_CHOICE_REQUIRED');
  });

  it('rejects a suit that does not exist', () => {
    const r = applyAction(s(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: 'AH', chosenSuit: 'X' as never }], actionId: 'b' });
    expect(!r.ok && r.error.code).toBe('INVALID_SUIT_CHOICE');
  });

  it('rejects a suit choice on a non-Ace', () => {
    const r = applyAction(s(), { type: 'PLAY_CARDS', playerId: 'p1', plays: [{ cardId: '5C', chosenSuit: 'H' }], actionId: 'c' });
    expect(!r.ok && r.error.code).toBe('INVALID_SUIT_CHOICE');
  });
});

describe('wild Aces — attacks, Queens and finishing', () => {
  it('cannot answer a pending attack (confirmed)', () => {
    const s = act(scenario({ hands: [['2C', '5C', '6C'], ['AH', '4D'], ['9S']], top: '9C' }), play('p1', '2C'));
    expect(reject(s, play('p2', 'AH>S'))).toBe('MUST_ANSWER_ATTACK');
  });

  it('cannot be the winning card, alone or at the end of a sequence', () => {
    expect(reject(scenario({ hands: [['AH'], ['4D']], top: '9C' }), play('p1', 'AH>S'))).toBe('CANNOT_FINISH_ON_POWER_CARD');
    expect(reject(scenario({ hands: [['9H', 'AH'], ['4D']], top: '9C' }), seq('p1', ['9H', 'AH>S']))).toBe('CANNOT_FINISH_ON_POWER_CARD');
  });

  it('covering your own black Jack with an Ace neutralises the attack (documented choice)', () => {
    const s = act(scenario({ hands: [['JS', 'AD', '3C'], ['4D']], top: '9S' }), seq('p1', ['JS', 'AD>H']));
    expect(s.pendingAttack).toBeNull();
    expect(s.activeSuit).toBe('H');
  });

  it('a starter Ace keeps its printed suit and needs no choice', () => {
    for (let i = 0; i < 400; i++) {
      const s = startGame({ seed: `ace-${i}`, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
      expect(s.activeSuit).toBeNull();
    }
  });
});

describe('wild Aces in sequences', () => {
  it('v1.2: may end any sequence (7♠ → A♦→♥), but nothing may follow an Ace', () => {
    const s = scenario({ hands: [['7S', 'AD', '5H', '5S', '3C'], ['4D']], top: '7H' });
    const after = act(s, seq('p1', ['7S', 'AD>H']));
    expect(top(after)).toBe('AD');
    expect(after.activeSuit).toBe('H');
    expect(current(after)).toBe('p2');
    expect(reject(s, seq('p1', ['7S', 'AD>H', '5H']))).toBe('ACE_MUST_BE_LAST');
  });

  it('v1.2: counts as 1 at the END of a descending run (3♠ → 2♠ → A♠), never mid-sequence', () => {
    const s = act(scenario({ hands: [['3S', '2S', 'AS', '9C'], ['4D']], top: '3H' }), seq('p1', ['3S', '2S', 'AS>D']));
    expect(top(s)).toBe('AS');
    expect(s.activeSuit).toBe('D');
    expect(s.pendingAttack).toBeNull(); // the 2 was covered by the Ace
    expect(reject(scenario({ hands: [['AS', '2S', '3S', '9C'], ['4D']], top: '7H' }), seq('p1', ['AS>S', '2S', '3S']))).toBe('ACE_MUST_BE_LAST');
  });

  it('v1.2: Ace → Ace is refused (the first Ace already ended the turn)', () => {
    expect(reject(scenario({ hands: [['AS', 'AD', '3C', '10D'], ['4D']], top: '7H' }), seq('p1', ['AS>H', 'AD>C']))).toBe('ACE_MUST_BE_LAST');
  });
});
