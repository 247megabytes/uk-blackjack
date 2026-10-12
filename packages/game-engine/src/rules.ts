/**
 * Pure rule predicates and legal-move generation for uk-classic-v1.
 */

import { isBlackJack, isPowerCard, isRedJack, type Card } from './cards';
import type { GameState, MoveIntent, PendingAttack, PlayerId, PlayerState } from './types';

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

/** Suit-or-rank match against the top discard, ignoring attacks and finishing rules. */
export function matchesTop(card: Card, top: Card | undefined): boolean {
  if (!top) return true;
  return card.suit === top.suit || card.rank === top.rank;
}

/** Can `card` legally answer the pending attack? */
export function canAnswerAttack(card: Card, attack: PendingAttack): boolean {
  if (attack.kind === 'two') return card.rank === '2';
  // Black Jack attack: stack another black Jack, or cancel with a red Jack.
  return isBlackJack(card) || isRedJack(card);
}

/**
 * Full legality check for playing `card` from `handSize` cards, ignoring turn
 * ownership and the drawn-card restriction (validated separately).
 */
export function isCardPlayable(state: GameState, card: Card, handSize: number): boolean {
  if (handSize === 1 && isPowerCard(card)) return false; // cannot finish on 2/8/J/K
  if (state.pendingAttack) return canAnswerAttack(card, state.pendingAttack);
  return matchesTop(card, topCard(state));
}

export function playableCards(state: GameState, player: PlayerState): Card[] {
  return player.hand.filter((c) => isCardPlayable(state, c, player.hand.length));
}

/**
 * Legal moves for `playerId` in the current state. Bots and UIs use this; the engine
 * still re-validates every submitted action.
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

  if (state.turn.drawnCardId) {
    const drawn = player.hand.find((c) => c.id === state.turn.drawnCardId);
    if (drawn && isCardPlayable(state, drawn, player.hand.length)) {
      moves.push(playMove(drawn, player.hand.length));
    }
    moves.push({ type: 'PASS' });
    return moves;
  }

  const plays = playableCards(state, player);
  for (const card of plays) moves.push(playMove(card, player.hand.length));
  if (!(plays.length > 0 && drawableCount(state) === 0)) moves.push({ type: 'DRAW' });
  if (canDeclare) moves.push({ type: 'DECLARE_LAST_CARD' });
  return moves;
}

function playMove(card: Card, handSize: number): MoveIntent {
  return handSize === 2
    ? { type: 'PLAY_CARD', cardId: card.id, declareLastCard: true }
    : { type: 'PLAY_CARD', cardId: card.id };
}
