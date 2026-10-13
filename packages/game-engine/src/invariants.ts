/**
 * Structural invariants every valid GameState must satisfy. Used by tests, the
 * simulation harness and (later) the server as a tripwire. Returns a list of
 * human-readable violations; an empty list means the state is consistent.
 */

import { createDeck, isBlackJack } from './cards';
import { topCard } from './rules';
import type { GameState } from './types';

export function findInvariantViolations(state: GameState): string[] {
  const v: string[] = [];
  const all = [...state.drawPile, ...state.discardPile, ...state.players.flatMap((p) => p.hand)];

  if (all.length !== 52) v.push(`card count is ${all.length}, expected 52`);
  const ids = new Set(all.map((c) => c.id));
  if (ids.size !== all.length) v.push('duplicate card detected');
  for (const c of createDeck()) if (!ids.has(c.id)) v.push(`missing card ${c.id}`);

  const n = state.players.length;
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= n) v.push('current player index out of range');
  if (state.direction !== 1 && state.direction !== -1) v.push('invalid direction');

  if (state.phase !== 'dealing') {
    if (state.discardPile.length < 1) v.push('discard pile is empty after deal');
  }

  if (state.pendingAttack) {
    const top = topCard(state);
    if (state.pendingAttack.kind === 'two' && top?.rank !== '2') v.push('2 attack pending but top card is not a 2');
    if (state.pendingAttack.kind === 'blackJack' && !(top && isBlackJack(top))) v.push('black Jack attack pending but top card is not a black Jack');
    if (state.pendingAttack.amount <= 0) v.push('non-positive attack amount');
  }

  if (state.activeSuit !== null) {
    if (topCard(state)?.rank !== 'A') v.push('active suit set but the top card is not an Ace');
  }

  if (state.phase === 'lastCardWindow') {
    const w = state.lastCardWindow;
    if (!w) v.push('lastCardWindow phase without window data');
    else {
      const p = state.players.find((x) => x.id === w.playerId);
      if (!p) v.push('window targets unknown player');
      else if (p.hand.length !== 1) v.push('window target does not hold exactly one card');
      if (w.resumePlayerIndex < 0 || w.resumePlayerIndex >= n) v.push('window resume index out of range');
    }
  } else if (state.lastCardWindow) {
    v.push('window data present outside lastCardWindow phase');
  }

  if (state.turn.drawnCardId) {
    const cur = state.players[state.currentPlayerIndex];
    if (!cur?.hand.some((c) => c.id === state.turn.drawnCardId)) v.push('drawn card is not in current player hand');
  }

  for (const p of state.players) {
    if (p.declaredLastCard && p.hand.length !== 1) v.push(`${p.id} flagged as declared with ${p.hand.length} cards`);
  }

  if (state.phase === 'finished') {
    if (!state.endReason) v.push('finished without end reason');
    if (state.endReason === 'win') {
      const w = state.players.find((p) => p.id === state.winnerId);
      if (!w || w.hand.length !== 0) v.push('winner does not have an empty hand');
    }
  } else {
    const empty = state.players.filter((p) => p.hand.length === 0);
    if (state.phase !== 'dealing' && empty.length > 0) v.push('a player has an empty hand but the game is not finished');
  }

  return v;
}
