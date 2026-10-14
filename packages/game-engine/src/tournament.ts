/**
 * Knockouts: a tournament of knockout rounds (uk-classic-v1.2).
 *
 *  - Every round deals a fresh 7-card hand to each surviving player.
 *  - Players who empty their hand finish, in order, and sit out the rest of the round.
 *  - The round ends when only one player still holds cards: that player is eliminated.
 *  - Survivors advance; rounds repeat until two remain. In the final, the first player to
 *    empty their hand is the champion.
 *  - A stuck round (turn cap or deadlock) eliminates the player holding the most cards,
 *    ties broken by a seeded draw. A forfeit (leaving / disconnecting) eliminates the
 *    player immediately, ranked below everyone still in.
 *
 * Pure and deterministic like the engine: the same seed and the same actions always give
 * the same tournament. Each round is an ordinary knockout-mode GameState.
 */

import { applyAction, startGame, type ActionResult, type PlayerSeat } from './engine';
import { gameError, GameConfigError, type GameError } from './errors';
import { getPlayerView, type PlayerView } from './view';
import { SYSTEM_PLAYER_ID, type GameAction, type GameEvent, type GameState, type PlayerId, type RulesConfig } from './types';

export type EliminationReason = 'lastHolder' | 'stalled' | 'forfeit';

export interface Elimination {
  readonly playerId: PlayerId;
  readonly round: number;
  readonly reason: EliminationReason;
  /** Cards still held when knocked out (0 for a forfeit). */
  readonly cardsHeld: number;
}

export interface RoundSummary {
  readonly round: number;
  readonly playerIds: readonly PlayerId[];
  /** Players who emptied their hand, in order. */
  readonly finishOrder: readonly PlayerId[];
  /** Everyone advancing to the next round, best first (finishers, then holders by fewest cards). */
  readonly advancing: readonly PlayerId[];
  /** Eliminated during this round, in the order it happened. */
  readonly eliminated: readonly Elimination[];
  readonly reason: EliminationReason;
  readonly final: boolean;
}

export type TournamentPhase = 'playing' | 'roundOver' | 'complete';

export interface TournamentState {
  readonly tournamentId: string;
  readonly seed: string;
  readonly entrants: readonly PlayerSeat[];
  readonly rules: Partial<RulesConfig>;
  readonly round: number;
  readonly phase: TournamentPhase;
  /** The current (or just-finished) round. */
  readonly game: GameState;
  /** Still in the tournament, in seat order. */
  readonly alive: readonly PlayerId[];
  readonly eliminated: readonly Elimination[];
  readonly rounds: readonly RoundSummary[];
  readonly championId: PlayerId | null;
  readonly version: number;
}

export interface CreateTournamentOptions {
  readonly players: readonly PlayerSeat[];
  readonly seed: string | number;
  readonly tournamentId?: string;
  readonly rules?: Partial<RulesConfig>;
}

export type TournamentAction = GameAction | { readonly type: 'NEXT_ROUND' } | { readonly type: 'LEAVE_TOURNAMENT'; readonly playerId: PlayerId };

export type TournamentResult =
  | { readonly ok: true; readonly state: TournamentState; readonly events: readonly GameEvent[]; readonly duplicate: boolean }
  | { readonly ok: false; readonly error: GameError };

function startRound(t: Pick<TournamentState, 'tournamentId' | 'seed' | 'entrants' | 'rules'>, round: number, alive: readonly PlayerId[]): GameState {
  return startGame({
    players: t.entrants.filter((p) => alive.includes(p.id)),
    seed: `${t.seed}:r${round}`,
    gameId: `${t.tournamentId}-r${round}`,
    rules: t.rules,
    mode: 'knockout',
  });
}

/** Creates a tournament with round 1 dealt. Throws GameConfigError on invalid setup. */
export function createTournament(options: CreateTournamentOptions): TournamentState {
  if (options.players.length < 2 || options.players.length > 6) {
    throw new GameConfigError(`Knockouts needs 2–6 players, got ${options.players.length}`);
  }
  const base = {
    tournamentId: options.tournamentId ?? `ko-${String(options.seed)}`,
    seed: String(options.seed),
    entrants: options.players.slice(),
    rules: options.rules ?? {},
  };
  const alive = base.entrants.map((p) => p.id);
  return { ...base, round: 1, phase: 'playing', game: startRound(base, 1, alive), alive, eliminated: [], rounds: [], championId: null, version: 0 };
}

/** Number of rounds the tournament will take if nobody forfeits from here. */
export function expectedTotalRounds(t: TournamentState): number {
  const inRound = t.phase === 'playing' ? t.game.players.filter((p) => t.alive.includes(p.id)).length : t.alive.length;
  if (t.phase === 'complete') return t.round;
  return t.phase === 'playing' ? t.round - 1 + Math.max(1, inRound - 1) : t.round + Math.max(0, inRound - 1);
}

/** True when the current round is the final (two players). */
export function isFinalRound(t: TournamentState): boolean {
  return t.game.players.length === 2;
}

/**
 * Applies a game action to the current round, NEXT_ROUND to deal the next round after a
 * round-results pause, or LEAVE_TOURNAMENT for a player who leaves (or is disconnected)
 * at any point — including after finishing a round, when the engine no longer sees them.
 */
export function applyTournamentAction(t: TournamentState, action: TournamentAction): TournamentResult {
  if (t.phase === 'complete') return { ok: false, error: gameError('GAME_OVER', 'The tournament is over') };

  if (action.type === 'NEXT_ROUND') {
    if (t.phase !== 'roundOver') return { ok: false, error: gameError('WRONG_PHASE', 'The round is still being played') };
    const round = t.round + 1;
    return { ok: true, duplicate: false, events: [], state: { ...t, round, phase: 'playing', game: startRound(t, round, t.alive), version: t.version + 1 } };
  }

  if (action.type === 'LEAVE_TOURNAMENT') return leave(t, action.playerId);

  if (t.phase !== 'playing') return { ok: false, error: gameError('WRONG_PHASE', 'Waiting for the next round to start') };
  const res: ActionResult = applyAction(t.game, action);
  if (!res.ok) return res;
  if (res.duplicate) return { ok: true, state: t, events: [], duplicate: true };
  const next: TournamentState = { ...t, game: res.state, version: t.version + 1 };
  return { ok: true, duplicate: false, events: res.events, state: next.game.phase === 'finished' ? closeRound(next) : next };
}

function leave(t: TournamentState, playerId: PlayerId): TournamentResult {
  if (!t.alive.includes(playerId)) return { ok: false, error: gameError('PLAYER_OUT', `${playerId} is not in the tournament`) };
  const inGame = t.game.players.find((p) => p.id === playerId);
  if (t.phase === 'playing' && inGame?.status === 'active') {
    return applyTournamentAction(t, { type: 'FORFEIT', playerId: SYSTEM_PLAYER_ID, targetPlayerId: playerId, actionId: `leave:${t.round}:${playerId}` });
  }
  // Finished this round already, or between rounds: out of the tournament straight away.
  const elimination: Elimination = { playerId, round: t.round, reason: 'forfeit', cardsHeld: 0 };
  const alive = t.alive.filter((id) => id !== playerId);
  const next: TournamentState = { ...t, alive, eliminated: [...t.eliminated, elimination], version: t.version + 1 };
  // (While a round is playing at least two players still hold cards, so it can't end here.)
  if (alive.length <= 1) {
    return { ok: true, duplicate: false, events: [], state: { ...next, phase: 'complete', championId: alive[0] ?? null } };
  }
  return { ok: true, duplicate: false, events: [], state: next };
}

/** Turns a finished knockout game into a round summary and updates who is still in. */
function closeRound(t: TournamentState): TournamentState {
  const g = t.game;
  const seat = (id: PlayerId) => g.players.findIndex((p) => p.id === id);
  const eliminatedThisRound: Elimination[] = [];

  // Forfeits, in the order they happened.
  for (const e of g.events) {
    if (e.type === 'PLAYER_FORFEITED' && t.alive.includes(e.playerId) && !t.eliminated.some((x) => x.playerId === e.playerId)) {
      eliminatedThisRound.push({ playerId: e.playerId, round: t.round, reason: 'forfeit', cardsHeld: 0 });
    }
  }
  const complete = [...g.events].reverse().find((e) => e.type === 'ROUND_COMPLETE');
  const reason: EliminationReason = complete && complete.type === 'ROUND_COMPLETE' ? complete.reason : 'lastHolder';
  if (g.eliminatedId) {
    const p = g.players.find((x) => x.id === g.eliminatedId)!;
    eliminatedThisRound.push({ playerId: p.id, round: t.round, reason: reason === 'stalled' ? 'stalled' : 'lastHolder', cardsHeld: p.hand.length });
  }

  const out = new Set([...t.eliminated, ...eliminatedThisRound].map((e) => e.playerId));
  const finishers = g.finishOrder.filter((id) => !out.has(id));
  const holders = g.players
    .filter((p) => p.status === 'active' && !out.has(p.id))
    .sort((a, b) => a.hand.length - b.hand.length || seat(a.id) - seat(b.id))
    .map((p) => p.id);
  const advancing = [...finishers, ...holders];
  const alive = t.alive.filter((id) => advancing.includes(id));
  const final = g.players.length === 2;
  const summary: RoundSummary = {
    round: t.round,
    playerIds: g.players.map((p) => p.id),
    finishOrder: g.finishOrder.slice(),
    advancing,
    eliminated: eliminatedThisRound,
    reason,
    final,
  };
  const base: TournamentState = { ...t, alive, eliminated: [...t.eliminated, ...eliminatedThisRound], rounds: [...t.rounds, summary] };
  if (alive.length <= 1) return { ...base, phase: 'complete', championId: alive[0] ?? null };
  return { ...base, phase: 'roundOver' };
}

/** Final (or current) ranking: champion first, then the last eliminated, down to the first. */
export function tournamentStandings(t: TournamentState): PlayerId[] {
  const out = t.eliminated.map((e) => e.playerId);
  const stillIn = t.championId ? [t.championId] : t.alive.slice();
  return [...stillIn, ...out.slice().reverse()];
}

export interface TournamentView {
  readonly tournamentId: string;
  readonly round: number;
  readonly expectedTotalRounds: number;
  readonly finalRound: boolean;
  readonly phase: TournamentPhase;
  readonly entrants: readonly PlayerSeat[];
  readonly alive: readonly PlayerId[];
  readonly eliminated: readonly Elimination[];
  readonly rounds: readonly RoundSummary[];
  readonly championId: PlayerId | null;
  /** The viewer's redacted view of the current round (they may be a spectator if knocked out). */
  readonly game: PlayerView;
  readonly version: number;
}

/** Redacted tournament view for one player (no hidden cards, deck order or RNG state). */
export function getTournamentView(t: TournamentState, viewerId: PlayerId | null): TournamentView {
  const inRound = viewerId !== null && t.game.players.some((p) => p.id === viewerId);
  return {
    tournamentId: t.tournamentId,
    round: t.round,
    expectedTotalRounds: expectedTotalRounds(t),
    finalRound: isFinalRound(t),
    phase: t.phase,
    entrants: t.entrants,
    alive: t.alive,
    eliminated: t.eliminated,
    rounds: t.rounds,
    championId: t.championId,
    game: getPlayerView(t.game, inRound ? viewerId : null),
    version: t.version,
  };
}
