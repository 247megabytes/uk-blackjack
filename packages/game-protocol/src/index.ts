/**
 * Wire contracts between the mobile client and the authoritative server.
 *
 * Clients never send a playerId: the server derives it from the authenticated
 * session and builds the engine GameAction itself (see toGameAction).
 */

import { SYSTEM_PLAYER_ID, type GameAction, type GameError, type GameMode, type MoveIntent, type PlayerId, type PlayerView, type TournamentView } from '@ukbj/game-engine';

export const PROTOCOL_VERSION = 2 as const;

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { readonly type: 'move'; readonly actionId: string; readonly expectedVersion: number; readonly move: MoveIntent }
  | { readonly type: 'setReady'; readonly ready: boolean }
  | { readonly type: 'startGame' }
  | { readonly type: 'requestRematch' }
  /** Leave the game or tournament for good (forfeit). */
  | { readonly type: 'leave' }
  /** Host: deal the next Knockouts round once everyone has seen the round results. */
  | { readonly type: 'nextRound' };

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

export interface LobbySeat {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly ready: boolean;
  readonly isHost: boolean;
  readonly isBot: boolean;
  readonly connected: boolean;
}

export interface LobbyState {
  readonly inviteCode: string;
  /** 'classic' or Knockouts (a tournament of knockout rounds). */
  readonly mode: GameMode | 'knockouts';
  readonly seats: readonly LobbySeat[];
  readonly maxPlayers: number;
}

export type ServerMessage =
  | { readonly type: 'lobby'; readonly lobby: LobbyState }
  | { readonly type: 'view'; readonly view: PlayerView; readonly turnDeadline: number | null }
  | { readonly type: 'tournament'; readonly tournament: TournamentView; readonly turnDeadline: number | null }
  | { readonly type: 'playerLeft'; readonly playerId: PlayerId; readonly reason: 'left' | 'disconnected' }
  | { readonly type: 'actionRejected'; readonly actionId: string; readonly error: GameError }
  | { readonly type: 'protocolError'; readonly message: string };

/** Server-side: turns an authenticated client move into an engine action. */
export function toGameAction(playerId: PlayerId, msg: Extract<ClientMessage, { type: 'move' }>): GameAction {
  const base = { actionId: msg.actionId, playerId, expectedVersion: msg.expectedVersion };
  const m = msg.move;
  switch (m.type) {
    case 'PLAY_CARDS':
      return { ...base, type: 'PLAY_CARDS', plays: m.plays.map((p) => (p.chosenSuit ? { cardId: p.cardId, chosenSuit: p.chosenSuit } : { cardId: p.cardId })), declareLastCard: m.declareLastCard === true };
    case 'DRAW':
      return { ...base, type: 'DRAW' };
    case 'PASS':
      return { ...base, type: 'PASS' }; // retired in v1.2: the engine rejects it
    case 'DECLARE_LAST_CARD':
      return { ...base, type: 'DECLARE_LAST_CARD' };
    case 'CHALLENGE_LAST_CARD':
      return { ...base, type: 'CHALLENGE_LAST_CARD', targetPlayerId: m.targetPlayerId };
  }
}

/**
 * Server-side: a player who leaves, or whose connection is lost past the grace period,
 * forfeits. The server issues the action as SYSTEM_PLAYER_ID.
 */
export function forfeitAction(playerId: PlayerId, actionId: string): GameAction {
  return { type: 'FORFEIT', playerId: SYSTEM_PLAYER_ID, targetPlayerId: playerId, actionId };
}

// ---------------------------------------------------------------------------
// Invite codes
// ---------------------------------------------------------------------------

/** Uppercase letters and digits without look-alikes (no 0/O, 1/I/L). */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;

/** `random` must return floats in [0,1); the server should back it with crypto. */
export function generateInviteCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

export function normaliseInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) if (!INVITE_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
