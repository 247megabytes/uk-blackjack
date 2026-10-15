import { describe, expect, it } from 'vitest';
import { getPlayerView, parseCard, RULESET_ID, STATE_SCHEMA_VERSION, UK_CLASSIC_V1, type GameState, type Suit } from '@ukbj/game-engine';
import { addAce, buildPlay, canArmLastCard, selectableCardIds, selectionState, tapCard } from '../src/game';

/** A hand-built position seen from the human seat ('you'). */
function viewOf(hand: string[], top: string, extra: Partial<GameState> = {}) {
  const used = new Set([...hand, top]);
  const others = ['3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS', 'QS', 'KS', 'AS', '2S', '3D', '4D', '5D', '6D', '7D', '8D', '9D', '10D', 'JD', 'QD', 'KD', 'AD', '2D']
    .filter((c) => !used.has(c)).slice(0, 5);
  const state: GameState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    rulesetId: RULESET_ID,
    rules: UK_CLASSIC_V1,
    mode: 'classic',
    gameId: 't',
    version: 3,
    rngState: 1,
    phase: 'playing',
    players: [
      { id: 'you', name: 'You', hand: hand.map(parseCard), declaredLastCard: false, status: 'active' },
      { id: 'bot1', name: 'Ada', hand: others.map(parseCard), declaredLastCard: false, status: 'active' },
    ],
    drawPile: [parseCard('KC')],
    discardPile: [parseCard(top)],
    currentPlayerIndex: 0,
    direction: 1,
    pendingAttack: null,
    activeSuit: null,
    turn: { drawnCardId: null },
    lastCardWindow: null,
    turnNumber: 2,
    winnerId: null,
    endReason: null,
    finishOrder: [],
    eliminatedId: null,
    processedActionIds: [],
    events: [],
    ...extra,
  };
  return getPlayerView(state, 'you');
}

const tapIds = (v: ReturnType<typeof viewOf>, ids: string[], suit: Suit = 'H') => {
  let sel: { cardId: string; chosenSuit?: Suit }[] = [];
  for (const id of ids) {
    const card = v.hand.find((c) => c.id === id)!;
    const r = tapCard(v, sel as never, card);
    if (r.kind === 'chooseSuit') sel = addAce(sel as never, card, suit) as never;
    else if (r.kind === 'selection') sel = r.selection as never;
    else throw new Error(r.reason);
  }
  return sel as never as Parameters<typeof buildPlay>[1];
};

describe('tap-to-build sequences', () => {
  it('lights the legal next cards as the sequence grows (7♥ → 7♠ 8♠ 9♠)', () => {
    const v = viewOf(['7S', '8S', '9S', '3C', 'KH'], '7H');
    expect([...selectableCardIds(v, [])].sort()).toEqual(['7S', 'KH']);
    expect([...selectableCardIds(v, tapIds(v, ['7S']))]).toEqual(['8S']);
    expect([...selectableCardIds(v, tapIds(v, ['7S', '8S']))]).toEqual(['9S']);
    expect(buildPlay(v, tapIds(v, ['7S', '8S', '9S']), false)).toEqual({ type: 'PLAY_CARDS', plays: [{ cardId: '7S' }, { cardId: '8S' }, { cardId: '9S' }] });
  });

  it('tapping the last selected card removes it; tapping an earlier one cuts back to before it', () => {
    const v = viewOf(['7S', '8S', '9S', '3C', 'KH'], '7H');
    const sel = tapIds(v, ['7S', '8S', '9S']);
    const r1 = tapCard(v, sel, parseCard('9S'));
    expect(r1.kind === 'selection' && r1.selection.map((p) => p.cardId)).toEqual(['7S', '8S']);
    const r2 = tapCard(v, sel, parseCard('8S'));
    expect(r2.kind === 'selection' && r2.selection.map((p) => p.cardId)).toEqual(['7S']);
  });

  it('rejects unlit cards with a reason', () => {
    const v = viewOf(['7S', '8S', '9S', '3C', 'KH'], '7H');
    const r = tapCard(v, [], parseCard('3C'));
    expect(r.kind).toBe('rejected');
  });

  it('asks for a suit when an Ace is tapped; the Ace ends the sequence (v1.2)', () => {
    const v = viewOf(['AD', '5H', '5S', '3C'], '9C');
    const r = tapCard(v, [], parseCard('AD'));
    expect(r.kind).toBe('chooseSuit');
    const sel = addAce([], parseCard('AD'), 'H');
    expect([...selectableCardIds(v, sel)]).toEqual([]);
    const st = selectionState(v, sel);
    expect(st.kind === 'ready' && st.outcome.activeSuit).toBe('H');
    const after = tapCard(v, sel, parseCard('5H'));
    expect(after.kind === 'rejected' && after.reason.includes('Ace')).toBe(true);
  });

  it('runs light up in both directions (7♠ → 6♠ or 8♠)', () => {
    const v = viewOf(['7S', '6S', '8S', '3C'], '7H');
    expect([...selectableCardIds(v, tapIds(v, ['7S']))].sort()).toEqual(['6S', '8S']);
    expect([...selectableCardIds(v, tapIds(v, ['7S', '6S']))]).toEqual([]);
  });

  it('going out needs Last Card: Play is refused until it is armed, with a reminder', () => {
    const v = viewOf(['7S', '6S'], '7H');
    const sel = tapIds(v, ['7S', '6S']);
    const st = selectionState(v, sel);
    expect(st.kind === 'ready' && st.goesOut && st.needsLastCard).toBe(true);
    expect(canArmLastCard(v, sel)).toBe(true);
    expect(buildPlay(v, sel, false)).toBeNull();
    expect(buildPlay(v, sel, true)).toEqual({ type: 'PLAY_CARDS', plays: sel, declareLastCard: true });
  });

  it('a player who already declared can go out without arming again', () => {
    const base = viewOf(['6S'], '7S');
    const v = { ...base, players: base.players.map((p) => (p.id === 'you' ? { ...p, declaredLastCard: true } : p)) };
    const sel = tapIds(v, ['6S']);
    const st = selectionState(v, sel);
    expect(st.kind === 'ready' && st.needsLastCard).toBe(false);
    expect(buildPlay(v, sel, false)).toEqual({ type: 'PLAY_CARDS', plays: sel });
  });

  it('any 2 or Jack lights up against a pickup (unified pickups), nothing else', () => {
    const v = viewOf(['JD', 'JS', '2C', '5C', 'AH'], '2H', { pendingAttack: { kind: 'two', amount: 2 } });
    expect([...selectableCardIds(v, [])].sort()).toEqual(['2C', 'JD', 'JS']);
  });

  it('after a black Jack only another black Jack, a 2 or a red Jack lights up', () => {
    const v = viewOf(['JS', 'JC', 'JD', '2H', 'QS', '10S', 'AS', '3C'], '9S');
    expect([...selectableCardIds(v, tapIds(v, ['JS']))].sort()).toEqual(['2H', 'JC', 'JD']);
  });

  it('a sequence ending the hand on a power card is playable and labelled as an automatic pick-up', () => {
    const v = viewOf(['9S', '8S'], '9C');
    const sel = tapIds(v, ['9S', '8S']);
    const st = selectionState(v, sel);
    expect(st.kind === 'ready' && st.blockedFinish && !st.wins && !st.needsLastCard).toBe(true);
    expect(buildPlay(v, sel, false)).toEqual({ type: 'PLAY_CARDS', plays: sel });
    expect(canArmLastCard(v, sel)).toBe(true); // they'll hold one card after the pick-up
  });

  it('an Ace only lights up mid-turn as the end of a descending run in its suit', () => {
    const v = viewOf(['3H', '2H', 'AH', 'AS', '9C'], '3S');
    expect([...selectableCardIds(v, tapIds(v, ['3H', '2H']))].sort()).toEqual(['AH']);
  });

  it('flags power cards that a later card will cover', () => {
    const v = viewOf(['7S', '8S', '9S', '3C'], '7H');
    const st = selectionState(v, tapIds(v, ['7S', '8S', '9S']));
    expect(st.kind === 'ready' && st.outcome.effects.some((e) => e.kind === 'powerCovered')).toBe(true);
    expect(st.kind === 'ready' && st.outcome.eights).toBe(0);
  });

  it('prompts to cover a Queen and blocks Play until it is covered', () => {
    const v = viewOf(['QH', '6H', '3C', '4S'], '9H');
    const sel = tapIds(v, ['QH']);
    expect(selectionState(v, sel)).toEqual({ kind: 'needsCover', suit: 'H' });
    expect(buildPlay(v, sel, false)).toBeNull();
    expect([...selectableCardIds(v, sel)]).toEqual(['6H']);
    expect(selectionState(v, tapIds(v, ['QH', '6H'])).kind).toBe('ready');
  });

  it('warns that an uncoverable Queen costs one card', () => {
    const v = viewOf(['QH', '3C', '4S'], '9H');
    const st = selectionState(v, tapIds(v, ['QH']));
    expect(st.kind === 'ready' && st.queenPenalty).toBe(true);
  });

  it('offers Last Card only when the sequence leaves exactly one card', () => {
    const v = viewOf(['7S', '8S', '3C'], '7H');
    expect(canArmLastCard(v, tapIds(v, ['7S']))).toBe(false);
    expect(canArmLastCard(v, tapIds(v, ['7S', '8S']))).toBe(true);
    expect(buildPlay(v, tapIds(v, ['7S', '8S']), true)).toMatchObject({ declareLastCard: true });
  });

  it('shows the attack the sequence will leave behind, and that covering a 2 cancels it', () => {
    const v = viewOf(['2H', '3H', '9C'], '9H');
    const a = selectionState(v, tapIds(v, ['2H']));
    expect(a.kind === 'ready' && a.outcome.attack).toEqual({ kind: 'two', amount: 2 });
    const b = selectionState(v, tapIds(v, ['2H', '3H']));
    expect(b.kind === 'ready' && b.outcome.attack).toBeNull();
  });
});
