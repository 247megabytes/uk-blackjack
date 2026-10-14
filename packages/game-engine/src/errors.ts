export type GameErrorCode =
  | 'INVALID_CONFIG'
  | 'WRONG_PHASE'
  | 'GAME_OVER'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'STALE_VERSION'
  | 'CARD_NOT_IN_HAND'
  | 'CARD_DOES_NOT_MATCH'
  | 'MUST_ANSWER_ATTACK'
  | 'CANNOT_FINISH_ON_POWER_CARD'
  | 'ONLY_DRAWN_CARD_PLAYABLE'
  | 'ALREADY_DRAWN'
  | 'MUST_PLAY'
  | 'NOTHING_TO_PASS'
  | 'NOT_ON_LAST_CARD'
  | 'ALREADY_DECLARED'
  | 'NO_OPEN_CHALLENGE_WINDOW'
  | 'CANNOT_CHALLENGE_SELF'
  | 'INVALID_CHALLENGE_TARGET'
  | 'SYSTEM_ONLY'
  | 'UNKNOWN_ACTION'
  | 'EMPTY_PLAY'
  | 'DUPLICATE_CARD'
  | 'INVALID_SEQUENCE'
  | 'QUEEN_MUST_BE_COVERED'
  | 'SUIT_CHOICE_REQUIRED'
  | 'INVALID_SUIT_CHOICE'
  | 'ACE_MUST_BE_LAST'
  | 'LAST_CARD_NOT_DECLARED'
  | 'PLAYER_OUT'
  | 'INVALID_FORFEIT_TARGET';

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

export function gameError(code: GameErrorCode, message: string): GameError {
  return { code, message };
}

/** Thrown only for programmer errors (bad config); rule violations are returned, never thrown. */
export class GameConfigError extends Error {
  readonly code: GameErrorCode = 'INVALID_CONFIG';
  constructor(message: string) {
    super(message);
    this.name = 'GameConfigError';
  }
}
