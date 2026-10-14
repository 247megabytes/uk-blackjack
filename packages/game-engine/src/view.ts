/**
 * Per-player redacted views. This is the ONLY shape that should ever leave the
 * server or be handed to a bot: no opponent hands, no deck order, no RNG state.
 */

import type { Card, CardId } from './cards';
import { getLegalMoves, topCard } from './rules';
import type {
  Direction,
  EndReason,
  GameEvent,
  GameMode,
  GamePhase,
  MoveIntent,
  PendingAttack,
  PlayerId,
  PlayerStatus,
  RulesConfig,
  RulesetId,
  GameState,
  Suit,
} from './types';

export interface PublicPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly cardCount: number;
  readonly declaredLastCard: boolean;
  readonly seat: number;
  readonly status: PlayerStatus;
  /** Knockout: finishing position this round (1 = first out), null if not finished. */
  readonly place: number | null;
}

export interface PlayerView {
  readonly rulesetId: RulesetId;
  readonly rules: RulesConfig;
  readonly mode: GameMode;
  readonly gameId: string;
  readonly version: number;
  readonly phase: GamePhase;
  /** null for spectators. */
  readonly viewerId: PlayerId | null;
  readonly hand: readonly Card[];
  readonly players: readonly PublicPlayer[];
  readonly currentPlayerId: PlayerId;
  readonly direction: Direction;
  readonly topCard: Card | null;
  readonly drawPileCount: number;
  readonly discardPileCount: number;
  readonly pendingAttack: PendingAttack | null;
  /** Suit chosen with a wild Ace on top of the pile (null = the top card's own suit applies). */
  readonly activeSuit: Suit | null;
  /** Always null since v1.2 (picking up ends the turn). */
  readonly drawnCardId: CardId | null;
  readonly lastCardWindowPlayerId: PlayerId | null;
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
  readonly endReason: EndReason | null;
  readonly finishOrder: readonly PlayerId[];
  readonly eliminatedId: PlayerId | null;
  readonly legalMoves: readonly MoveIntent[];
  readonly events: readonly GameEvent[];
}

/** Hides other players' drawn cards in the event log. Draw counts remain visible. */
export function redactEvent(event: GameEvent, viewerId: PlayerId | null): GameEvent {
  if (event.type === 'CARDS_DRAWN' && event.playerId !== viewerId) {
    return { ...event, cards: [] };
  }
  return event;
}

export function getPlayerView(state: GameState, viewerId: PlayerId | null, options?: { eventsSinceVersion?: number }): PlayerView {
  const viewer = viewerId === null ? undefined : state.players.find((p) => p.id === viewerId);
  const effectiveViewer = viewer ? viewer.id : null;
  const current = state.players[state.currentPlayerIndex];
  const since = options?.eventsSinceVersion ?? -1;

  return {
    rulesetId: state.rulesetId,
    rules: state.rules,
    mode: state.mode,
    gameId: state.gameId,
    version: state.version,
    phase: state.phase,
    viewerId: effectiveViewer,
    hand: viewer ? viewer.hand.slice() : [],
    players: state.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      declaredLastCard: p.declaredLastCard,
      seat,
      status: p.status,
      place: p.status === 'finished' ? state.finishOrder.indexOf(p.id) + 1 : null,
    })),
    currentPlayerId: current ? current.id : '',
    direction: state.direction,
    topCard: topCard(state) ?? null,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    pendingAttack: state.pendingAttack,
    activeSuit: state.activeSuit,
    drawnCardId: null,
    lastCardWindowPlayerId: state.lastCardWindow ? state.lastCardWindow.playerId : null,
    turnNumber: state.turnNumber,
    winnerId: state.winnerId,
    endReason: state.endReason,
    finishOrder: state.finishOrder,
    eliminatedId: state.eliminatedId,
    legalMoves: effectiveViewer ? getLegalMoves(state, effectiveViewer) : [],
    events: state.events.filter((e) => e.version > since).map((e) => redactEvent(e, effectiveViewer)),
  };
}
