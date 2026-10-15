import type { Card, CardId, Suit } from './cards';

export const RULESET_ID = 'uk-classic-v1.2' as const;
export type RulesetId = typeof RULESET_ID;

/** Bump when the shape of GameState changes in a non-backward-compatible way. */
export const STATE_SCHEMA_VERSION = 3 as const;

export type PlayerId = string;
export type Direction = 1 | -1; // 1 = clockwise, -1 = anticlockwise

export type GamePhase =
  /** Created and shuffled, cards not yet dealt. */
  | 'dealing'
  /** Normal turn-taking. */
  | 'playing'
  /** A player just went down to one card without declaring; declare/challenge only. */
  | 'lastCardWindow'
  /** Game over (classic: win, stalemate or forfeit; knockout: the round is complete). */
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

/**
 * Game mode. A knockout game is ONE round of a Knockouts tournament: players who empty
 * their hand finish (in order) and the round runs on until a single player holds cards.
 * The tournament layer (./tournament) chains rounds together.
 */
export type GameMode = 'classic' | 'knockout';

/** active = still holding cards and taking turns; finished = emptied their hand (knockout); forfeited = left / disconnected. */
export type PlayerStatus = 'active' | 'finished' | 'forfeited';

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly hand: readonly Card[];
  /** True once the player has announced Last Card for their current single-card hand. */
  readonly declaredLastCard: boolean;
  readonly status: PlayerStatus;
}

/** The kind of the last card that added to the pickup (2s and black Jacks share one total since v1.2). */
export type AttackKind = 'two' | 'blackJack';

export interface PendingAttack {
  readonly kind: AttackKind;
  /** Total cards the defender must draw if they do not defend. */
  readonly amount: number;
}

export interface TurnState {
  /** Always null since uk-classic-v1.2: picking up ends the turn. Kept for state-shape stability. */
  readonly drawnCardId: CardId | null;
}

export interface LastCardWindow {
  /** The player who reduced their hand to one card without declaring. */
  readonly playerId: PlayerId;
  /** Index of the player whose turn starts once the window closes. */
  readonly resumePlayerIndex: number;
}

/**
 * win: a player emptied their hand (classic). stalemate: turn cap or deadlock.
 * forfeit: everyone else left (classic). roundComplete: one player left holding cards (knockout).
 */
export type EndReason = 'win' | 'stalemate' | 'forfeit' | 'roundComplete';

export interface GameState {
  readonly schemaVersion: typeof STATE_SCHEMA_VERSION;
  readonly rulesetId: RulesetId;
  readonly rules: RulesConfig;
  readonly mode: GameMode;
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
  /** Classic: the winner. Knockout: the first player to finish the round (null if none did). */
  readonly winnerId: PlayerId | null;
  readonly endReason: EndReason | null;
  /** Knockout: players who emptied their hand, in finishing order. */
  readonly finishOrder: readonly PlayerId[];
  /** Knockout: the player knocked out when the round ended (null while playing, or if a forfeit ended it). */
  readonly eliminatedId: PlayerId | null;
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

/** Retired in uk-classic-v1.2 (picking up always ends the turn). Always rejected; kept for wire compatibility. */
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

/**
 * Leave the game. A player may forfeit themselves; the server (SYSTEM_PLAYER_ID) forfeits
 * a disconnected player by naming them in targetPlayerId. Their cards are shuffled into
 * the draw pile and they take no further part (in Knockouts they are eliminated).
 */
export interface ForfeitAction extends ActionBase {
  readonly type: 'FORFEIT';
  readonly targetPlayerId?: PlayerId;
}

export const SYSTEM_PLAYER_ID = '__system__';

export type GameAction =
  | PlayCardsAction
  | DrawAction
  | PassAction
  | DeclareLastCardAction
  | ChallengeLastCardAction
  | CloseLastCardWindowAction
  | ForfeitAction;

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
  | { readonly type: 'POWER_COVERED'; readonly version: number; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | { readonly type: 'FINISH_BLOCKED'; readonly version: number; readonly playerId: PlayerId; readonly card: Card }
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
  | { readonly type: 'STALEMATE'; readonly version: number; readonly winnerId: PlayerId | null }
  | { readonly type: 'PLAYER_FINISHED'; readonly version: number; readonly playerId: PlayerId; readonly place: number }
  | { readonly type: 'PLAYER_FORFEITED'; readonly version: number; readonly playerId: PlayerId; readonly cardsReturned: number; readonly attackCleared: boolean }
  | {
      readonly type: 'ROUND_COMPLETE';
      readonly version: number;
      readonly finishOrder: readonly PlayerId[];
      readonly eliminatedId: PlayerId | null;
      /** last-holder: one player left with cards. stalled: turn cap / deadlock (most cards out). forfeit: a forfeit left ≤1 holder. */
      readonly reason: 'lastHolder' | 'stalled' | 'forfeit';
    };

/** blockedFinish: emptied the hand on a card that can't win (v1.2), so one card is picked up. */
export type DrawReason = 'normal' | 'blackJackPenalty' | 'twoPenalty' | 'lastCardPenalty' | 'queenPenalty' | 'blockedFinish';

export type GameEventType = GameEvent['type'];

/** Hidden suit info is never needed by events; Suit re-exported for convenience. */
export type { Suit };
