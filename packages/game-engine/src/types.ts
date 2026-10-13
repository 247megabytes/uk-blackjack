import type { Card, CardId, Suit } from './cards';

export const RULESET_ID = 'uk-classic-v1.1' as const;
export type RulesetId = typeof RULESET_ID;

/** Bump when the shape of GameState changes in a non-backward-compatible way. */
export const STATE_SCHEMA_VERSION = 2 as const;

export type PlayerId = string;
export type Direction = 1 | -1; // 1 = clockwise, -1 = anticlockwise

export type GamePhase =
  /** Created and shuffled, cards not yet dealt. */
  | 'dealing'
  /** Normal turn-taking. */
  | 'playing'
  /** A player just went down to one card without declaring; declare/challenge only. */
  | 'lastCardWindow'
  /** Game over (win or stalemate). */
  | 'finished';

export interface RulesConfig {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly handSize: number;
  readonly blackJackPenalty: number;
  readonly twoPenalty: number;
  readonly lastCardPenalty: number;
  /** Stall breaker: the game is resolved as a stalemate once this many turns have been played. */
  readonly maxTurns: number;
}

export const UK_CLASSIC_V1: RulesConfig = Object.freeze({
  minPlayers: 2,
  maxPlayers: 6,
  handSize: 7,
  blackJackPenalty: 5,
  twoPenalty: 2,
  lastCardPenalty: 2,
  maxTurns: 1000,
});

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly hand: readonly Card[];
  /** True once the player has announced Last Card for their current single-card hand. */
  readonly declaredLastCard: boolean;
}

export type AttackKind = 'two' | 'blackJack';

export interface PendingAttack {
  readonly kind: AttackKind;
  /** Total cards the defender must draw if they do not defend. */
  readonly amount: number;
}

export interface TurnState {
  /** Set after the current player draws a single card (not a penalty). */
  readonly drawnCardId: CardId | null;
}

export interface LastCardWindow {
  /** The player who reduced their hand to one card without declaring. */
  readonly playerId: PlayerId;
  /** Index of the player whose turn starts once the window closes. */
  readonly resumePlayerIndex: number;
}

export type EndReason = 'win' | 'stalemate';

export interface GameState {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION;
  readonly rulesetId: RulesetId;
  readonly rules: RulesConfig;
  readonly gameId: string;
  /** Monotonic: increments on every accepted action. Clients send it back to detect staleness. */
  readonly version: number;
  /** Internal PRNG state. Server-only: never sent to clients. */
  readonly rngState: number;
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly drawPile: readonly Card[];
  /** Last element is the visible top card. */
  readonly discardPile: readonly Card[];
  readonly currentPlayerIndex: number;
  readonly direction: Direction;
  readonly pendingAttack: PendingAttack | null;
  /** Suit chosen with a wild Ace that is on top of the discard pile; null = printed suit applies. */
  readonly activeSuit: Suit | null;
  readonly turn: TurnState;
  readonly lastCardWindow: LastCardWindow | null;
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
  readonly endReason: EndReason | null;
  /** Action ids already applied (for idempotency). Server-only. */
  readonly processedActionIds: readonly string[];
  /** Append-only event log. Contains hidden information; filter with getPlayerView. */
  readonly events: readonly GameEvent[];
}

// ---------------------------------------------------------------------------
// Actions (the only way to change state)
// ---------------------------------------------------------------------------

interface ActionBase {
  /** Unique per intent (client-generated UUID). Replaying the same id is a no-op. */
  readonly actionId: string;
  readonly playerId: PlayerId;
  /** Optional optimistic-concurrency check: rejected if it does not equal state.version. */
  readonly expectedVersion?: number;
}

/** One card of a turn's sequence. Aces must carry the suit the player chooses. */
export interface CardPlay {
  readonly cardId: CardId;
  readonly chosenSuit?: Suit;
}

/** Plays one or more cards, in order, as a single turn (uk-classic-v1.1). */
export interface PlayCardsAction extends ActionBase {
  readonly type: 'PLAY_CARDS';
  readonly plays: readonly CardPlay[];
  /** Announce Last Card together with the play that leaves one card in hand. */
  readonly declareLastCard?: boolean;
}

/** Draw one card, or — if an attack is pending — accept the whole penalty. */
export interface DrawAction extends ActionBase {
  readonly type: 'DRAW';
}

/** End the turn after drawing a playable card you chose not to play. */
export interface PassAction extends ActionBase {
  readonly type: 'PASS';
}

export interface DeclareLastCardAction extends ActionBase {
  readonly type: 'DECLARE_LAST_CARD';
}

export interface ChallengeLastCardAction extends ActionBase {
  readonly type: 'CHALLENGE_LAST_CARD';
  readonly targetPlayerId: PlayerId;
}

/** Issued only by the server when its declaration timer expires. playerId must be SYSTEM_PLAYER_ID. */
export interface CloseLastCardWindowAction extends ActionBase {
  readonly type: 'CLOSE_LAST_CARD_WINDOW';
}

export const SYSTEM_PLAYER_ID = '__system__';

export type GameAction =
  | PlayCardsAction
  | DrawAction
  | PassAction
  | DeclareLastCardAction
  | ChallengeLastCardAction
  | CloseLastCardWindowAction;

export type ActionType = GameAction['type'];

/** An action without bookkeeping fields — what getLegalMoves returns. */
export type MoveIntent =
  | { readonly type: 'PLAY_CARDS'; readonly plays: readonly CardPlay[]; readonly declareLastCard?: boolean }
  | { readonly type: 'DRAW' }
  | { readonly type: 'PASS' }
  | { readonly type: 'DECLARE_LAST_CARD' }
  | { readonly type: 'CHALLENGE_LAST_CARD'; readonly targetPlayerId: PlayerId };

// ---------------------------------------------------------------------------
// Events (for animation, logging and debugging)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { readonly type: 'GAME_CREATED'; readonly version: number; readonly playerIds: readonly PlayerId[] }
  | { readonly type: 'CARDS_DEALT'; readonly version: number; readonly handSize: number; readonly starterCard: Card; readonly firstPlayerId: PlayerId }
  | { readonly type: 'CARD_PLAYED'; readonly version: number; readonly playerId: PlayerId; readonly card: Card; readonly index: number; readonly of: number }
  | { readonly type: 'SEQUENCE_PLAYED'; readonly version: number; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | { readonly type: 'SUIT_CHOSEN'; readonly version: number; readonly playerId: PlayerId; readonly suit: Suit }
  | { readonly type: 'QUEEN_COVERED'; readonly version: number; readonly playerId: PlayerId; readonly queen: Card; readonly cover: Card }
  | { readonly type: 'QUEEN_UNCOVERED'; readonly version: number; readonly playerId: PlayerId; readonly queen: Card }
  | { readonly type: 'ATTACK_NEUTRALISED'; readonly version: number; readonly playerId: PlayerId; readonly kind: AttackKind; readonly amount: number }
  | { readonly type: 'CARDS_DRAWN'; readonly version: number; readonly playerId: PlayerId; readonly cards: readonly Card[]; readonly count: number; readonly requested: number; readonly reason: DrawReason }
  | { readonly type: 'ATTACK_STARTED'; readonly version: number; readonly kind: AttackKind; readonly amount: number }
  | { readonly type: 'ATTACK_STACKED'; readonly version: number; readonly kind: AttackKind; readonly amount: number }
  | { readonly type: 'ATTACK_CANCELLED'; readonly version: number; readonly playerId: PlayerId; readonly cancelledAmount: number }
  | { readonly type: 'DIRECTION_REVERSED'; readonly version: number; readonly direction: Direction }
  | { readonly type: 'PLAYER_SKIPPED'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'TURN_PASSED'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'TURN_STARTED'; readonly version: number; readonly playerId: PlayerId; readonly turnNumber: number }
  | { readonly type: 'LAST_CARD_DECLARED'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'LAST_CARD_WINDOW_OPENED'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'LAST_CARD_CHALLENGED'; readonly version: number; readonly challengerId: PlayerId; readonly targetPlayerId: PlayerId }
  | { readonly type: 'LAST_CARD_WINDOW_CLOSED'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'DISCARDS_RECYCLED'; readonly version: number; readonly count: number }
  | { readonly type: 'GAME_WON'; readonly version: number; readonly playerId: PlayerId }
  | { readonly type: 'STALEMATE'; readonly version: number; readonly winnerId: PlayerId | null };

export type DrawReason = 'normal' | 'blackJackPenalty' | 'twoPenalty' | 'lastCardPenalty' | 'queenPenalty';

export type GameEventType = GameEvent['type'];

/** Hidden suit info is never needed by events; Suit re-exported for convenience. */
export type { Suit };
