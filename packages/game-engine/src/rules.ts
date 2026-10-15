/**
 * Rule predicates and legal-move generation for uk-classic-v1.2.
 * Card-level rules live in ./sequence (shared with bots and the UI).
 */

import { SUITS, type Card } from './cards';
import { hasLegalPlay, isLegalFirstCard, isPickupCard, minimalPlayFrom, nextCardOptions, type PlayContext } from './sequence';
import type { CardPlay, GameState, MoveIntent, PendingAttack, PlayerId, PlayerState } from './types';

export function topCard(state: GameState): Card | undefined {
  return state.discardPile[state.discardPile.length - 1];
}

export function findPlayerIndex(state: GameState, playerId: PlayerId): number {
  return state.players.findIndex((p) => p.id === playerId);
}

export function currentPlayer(state: GameState): PlayerState {
  const p = state.players[state.currentPlayerIndex];
  if (!p) throw new Error('Corrupt state: current player index out of range');
  return p;
}

/** Players still holding cards and taking turns. */
export function activePlayerCount(state: GameState): number {
  return state.players.reduce((n, p) => n + (p.status === 'active' ? 1 : 0), 0);
}

/** Cards that could still be drawn (draw pile + recyclable discards beneath the top card). */
export function drawableCount(state: GameState): number {
  return state.drawPile.length + Math.max(0, state.discardPile.length - 1);
}

/** The rules context for `player` acting now. */
export function playContext(state: GameState, player: PlayerState): PlayContext {
  return {
    hand: player.hand,
    top: topCard(state) ?? null,
    activeSuit: state.activeSuit,
    pendingAttack: state.pendingAttack,
    drawnCardId: null,
    declaredLastCard: player.declaredLastCard,
  };
}

/** Suit-or-rank match against the top card (wild Aces always match). Kept for compatibility. */
export function matchesTop(card: Card, top: Card | undefined, activeSuit: GameState['activeSuit'] = null): boolean {
  return isLegalFirstCard({ hand: [card], top: top ?? null, activeSuit, pendingAttack: null, drawnCardId: null }, card);
}

/** Can `card` legally answer the pending pickup? Since v1.2 any 2 or any Jack answers either kind. */
export function canAnswerAttack(card: Card, _attack: PendingAttack): boolean {
  return isPickupCard(card);
}

/** Can `card` start a complete legal play for `player` right now? */
export function isCardPlayable(state: GameState, card: Card, player: PlayerState): boolean {
  const ctx = playContext(state, player);
  return nextCardOptions(ctx, []).some((c) => c.id === card.id) && minimalPlayFrom(ctx, card) !== null;
}

/** Cards that can start a complete legal play. */
export function playableCards(state: GameState, player: PlayerState): Card[] {
  const ctx = playContext(state, player);
  return nextCardOptions(ctx, []).filter((c) => minimalPlayFrom(ctx, c) !== null);
}

export function playerHasLegalPlay(state: GameState, player: PlayerState): boolean {
  return hasLegalPlay(playContext(state, player));
}

/**
 * Legal moves for `playerId`. Full multi-card sequences are combinatorial, so for the
 * current player this lists one *complete* play per legal starting card — the card
 * alone, or a Queen with its first legal cover — and one per suit for Aces. Use
 * nextCardOptions / checkPlays (./sequence) to build and validate longer sequences.
 * The engine still re-validates every submitted action.
 */
export function getLegalMoves(state: GameState, playerId: PlayerId): MoveIntent[] {
  const idx = findPlayerIndex(state, playerId);
  if (idx < 0) return [];
  const player = state.players[idx]!;
  if (player.status !== 'active') return [];

  if (state.phase === 'lastCardWindow' && state.lastCardWindow) {
    const target = state.lastCardWindow.playerId;
    if (target === playerId) return player.declaredLastCard ? [] : [{ type: 'DECLARE_LAST_CARD' }];
    return [{ type: 'CHALLENGE_LAST_CARD', targetPlayerId: target }];
  }

  if (state.phase !== 'playing') return [];

  const moves: MoveIntent[] = [];
  const canDeclare = player.hand.length === 1 && !player.declaredLastCard;

  if (idx !== state.currentPlayerIndex) {
    if (canDeclare) moves.push({ type: 'DECLARE_LAST_CARD' });
    return moves;
  }

  const ctx = playContext(state, player);
  for (const first of nextCardOptions(ctx, [])) {
    const suits = first.rank === 'A' ? SUITS : [undefined];
    for (const suit of suits) {
      const plays = minimalPlayFrom(ctx, first, suit);
      if (plays) moves.push(playMove(plays, player.hand.length));
    }
  }
  const hasPlay = moves.length > 0;
  if (!(hasPlay && drawableCount(state) === 0)) moves.push({ type: 'DRAW' });
  if (canDeclare) moves.push({ type: 'DECLARE_LAST_CARD' });
  return moves;
}

/**
 * Builds a PLAY_CARDS intent, declaring Last Card when the play leaves one card — or
 * none: a play that empties the hand is refused without a declaration (v1.2), so going
 * out always declares regardless of `declare`.
 */
export function playMove(plays: readonly CardPlay[], handSize: number, declare = true): MoveIntent {
  const left = handSize - plays.length;
  return left === 0 || (left === 1 && declare)
    ? { type: 'PLAY_CARDS', plays, declareLastCard: true }
    : { type: 'PLAY_CARDS', plays };
}
