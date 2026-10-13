/**
 * Rule predicates and legal-move generation for uk-classic-v1.1.
 * Card-level rules live in ./sequence (shared with bots and the UI).
 */

import { SUITS, type Card } from './cards';
import { hasLegalPlay, isLegalFirstCard, minimalPlayFrom, nextCardOptions, type PlayContext } from './sequence';
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

/** Cards that could still be drawn (draw pile + recyclable discards beneath the top card). */
export function drawableCount(state: GameState): number {
  return state.drawPile.length + Math.max(0, state.discardPile.length - 1);
}

/** The rules context for `player` acting now. The drawn-card limit applies only to the current player. */
export function playContext(state: GameState, player: PlayerState): PlayContext {
  const isCurrent = state.players[state.currentPlayerIndex]?.id === player.id;
  return {
    hand: player.hand,
    top: topCard(state) ?? null,
    activeSuit: state.activeSuit,
    pendingAttack: state.pendingAttack,
    drawnCardId: isCurrent ? state.turn.drawnCardId : null,
  };
}

/** Suit-or-rank match against the top card (wild Aces always match). Kept for compatibility. */
export function matchesTop(card: Card, top: Card | undefined, activeSuit: GameState['activeSuit'] = null): boolean {
  return isLegalFirstCard({ hand: [card], top: top ?? null, activeSuit, pendingAttack: null, drawnCardId: null }, card);
}

/** Can `card` legally answer the pending attack? */
export function canAnswerAttack(card: Card, attack: PendingAttack): boolean {
  return attack.kind === 'two' ? card.rank === '2' : card.rank === 'J';
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
  if (state.turn.drawnCardId) {
    moves.push({ type: 'PASS' });
    return moves;
  }
  if (!(hasPlay && drawableCount(state) === 0)) moves.push({ type: 'DRAW' });
  if (canDeclare) moves.push({ type: 'DECLARE_LAST_CARD' });
  return moves;
}

/** Builds a PLAY_CARDS intent, declaring Last Card when the play leaves exactly one card. */
export function playMove(plays: readonly CardPlay[], handSize: number, declare = true): MoveIntent {
  return handSize - plays.length === 1 && declare
    ? { type: 'PLAY_CARDS', plays, declareLastCard: true }
    : { type: 'PLAY_CARDS', plays };
}
