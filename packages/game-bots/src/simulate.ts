import {
  applyAction,
  applyTournamentAction,
  createTournament,
  findInvariantViolations,
  getPlayerView,
  seedToState,
  nextRandom,
  startGame,
  SYSTEM_PLAYER_ID,
  type ActionResult,
  type GameAction,
  type GameMode,
  type GameState,
  type MoveIntent,
  type PlayerId,
  type TournamentAction,
  type TournamentState,
} from '@ukbj/game-engine';
import type { Bot } from './bot';
import { createEasyBot } from './easy';

export interface SimulationOptions {
  readonly seed: string | number;
  readonly playerCount: number;
  /** Default 'classic'. 'knockout' plays a single knockout round. */
  readonly mode?: GameMode;
  /** Factory per seat. Defaults to Easy bots seeded from the game seed. */
  readonly makeBot?: (seat: number, playerId: PlayerId) => Bot;
  /** Safety cap on accepted actions. */
  readonly maxActions?: number;
  /** Chance, before each action, that the server forfeits a random active player (disconnect testing). */
  readonly forfeitChance?: number;
}

export interface SimulationResult {
  readonly seed: string | number;
  readonly finished: boolean;
  readonly winnerId: PlayerId | null;
  readonly endReason: GameState['endReason'];
  readonly actions: number;
  readonly turns: number;
  readonly violations: readonly string[];
  readonly finalState: GameState;
}

/** Small seeded RNG for the harness's own decisions (forfeit injection). */
function harnessRng(seed: string): () => number {
  let s = seedToState(seed);
  return () => {
    const r = nextRandom(s);
    s = r.state;
    return r.value;
  };
}

interface Driver {
  /** Applies an engine action to whatever is being driven; returns the engine result. */
  apply(action: GameAction): ActionResult;
  game(): GameState;
}

/**
 * Takes one step of a game: lets the right bot act (or closes a Last Card window when
 * every bot declines), optionally injecting a server forfeit first. Checks invariants,
 * turn ownership, version increments and idempotency after every accepted action.
 */
function step(
  d: Driver,
  bots: ReadonlyMap<PlayerId, Bot>,
  violations: string[],
  next: () => string,
  forfeit: { chance: number; rng: () => number } | null,
): boolean {
  const state = d.game();

  const submit = (playerId: PlayerId, move: MoveIntent | GameAction, isSystem = false): boolean => {
    const action = (isSystem ? move : { ...move, playerId, actionId: next(), expectedVersion: state.version }) as GameAction;
    if (!isSystem && state.phase === 'playing' && move.type !== 'DECLARE_LAST_CARD' && state.players[state.currentPlayerIndex]?.id !== playerId) {
      violations.push(`turn ownership: ${playerId} acted on ${state.players[state.currentPlayerIndex]?.id}'s turn`);
    }
    const res = d.apply(action);
    if (!res.ok) {
      violations.push(`legal move rejected for ${playerId}: ${res.error.code} ${JSON.stringify(move)}`);
      return false;
    }
    if (res.state.version !== state.version + 1) violations.push('version did not increment by exactly 1');
    const replay = applyAction(res.state, action);
    if (!replay.ok || !replay.duplicate || replay.state !== res.state) violations.push('replayed action was not idempotent');
    for (const msg of findInvariantViolations(res.state)) violations.push(`v${res.state.version}: ${msg}`);
    return true;
  };

  if (forfeit && forfeit.rng() < forfeit.chance) {
    const active = state.players.filter((p) => p.status === 'active');
    const target = active[Math.floor(forfeit.rng() * active.length)];
    if (target) return submit(SYSTEM_PLAYER_ID, { type: 'FORFEIT', playerId: SYSTEM_PLAYER_ID, targetPlayerId: target.id, actionId: next() }, true);
  }

  if (state.phase === 'lastCardWindow') {
    const target = state.lastCardWindow!.playerId;
    const order = [target, ...state.players.map((p) => p.id).filter((id) => id !== target)];
    for (const id of order) {
      const view = getPlayerView(state, id);
      const move = bots.get(id)!.chooseMove(view);
      if (move) return submit(id, move);
    }
    return submit(SYSTEM_PLAYER_ID, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: next() }, true);
  }

  const current = state.players[state.currentPlayerIndex]!;
  const view = getPlayerView(state, current.id);
  if (view.hand.length !== current.hand.length) violations.push('view hand mismatch');
  const move = bots.get(current.id)!.chooseMove(view);
  if (!move) {
    violations.push(`bot ${current.id} returned no move on its turn (legal: ${JSON.stringify(view.legalMoves)})`);
    return false;
  }
  return submit(current.id, move);
}

function makeBots(ids: readonly PlayerId[], seed: string | number, make?: SimulationOptions['makeBot']): Map<PlayerId, Bot> {
  return new Map(ids.map((id, seat) => [id, make ? make(seat, id) : createEasyBot({ seed: `${String(seed)}:${id}` })]));
}

/** Plays one seeded bot-vs-bot game (classic, or a single knockout round) through the public action API. */
export function simulateGame(options: SimulationOptions): SimulationResult {
  const ids = Array.from({ length: options.playerCount }, (_, i) => `p${i + 1}`);
  const bots = makeBots(ids, options.seed, options.makeBot);
  let state = startGame({ seed: options.seed, players: ids.map((id) => ({ id, name: `Bot ${id}` })), mode: options.mode });
  const maxActions = options.maxActions ?? 5000;
  const violations: string[] = [...findInvariantViolations(state)];
  let actions = 0;
  let counter = 0;
  const forfeit = options.forfeitChance ? { chance: options.forfeitChance, rng: harnessRng(`${String(options.seed)}:forfeit`) } : null;
  const driver: Driver = {
    apply: (a) => {
      const res = applyAction(state, a);
      if (res.ok) state = res.state;
      return res;
    },
    game: () => state,
  };

  while (state.phase !== 'finished' && actions < maxActions && violations.length === 0) {
    if (step(driver, bots, violations, () => `a${++counter}`, forfeit)) actions++;
    else if (violations.length === 0) violations.push('step made no progress');
  }

  return {
    seed: options.seed,
    finished: state.phase === 'finished',
    winnerId: state.winnerId,
    endReason: state.endReason,
    actions,
    turns: state.turnNumber,
    violations,
    finalState: state,
  };
}

export interface TournamentSimulationOptions {
  readonly seed: string | number;
  readonly playerCount: number;
  readonly makeBot?: (seat: number, playerId: PlayerId) => Bot;
  readonly maxActions?: number;
  readonly forfeitChance?: number;
}

export interface TournamentSimulationResult {
  readonly seed: string | number;
  readonly complete: boolean;
  readonly championId: PlayerId | null;
  readonly rounds: number;
  readonly stalledRounds: number;
  readonly forfeits: number;
  readonly actions: number;
  readonly violations: readonly string[];
  readonly finalState: TournamentState;
}

/** Tournament-level consistency checks (in addition to per-round game invariants). */
export function findTournamentViolations(t: TournamentState): string[] {
  const v: string[] = [];
  const entrants = t.entrants.map((p) => p.id);
  const out = t.eliminated.map((e) => e.playerId);
  if (new Set(out).size !== out.length) v.push('a player was eliminated twice');
  if (t.alive.some((id) => out.includes(id))) v.push('an eliminated player is still alive');
  if (t.alive.length + out.length !== entrants.length) v.push('alive + eliminated does not cover every entrant');
  if (t.rounds.length > entrants.length - 1) v.push('more rounds than entrants − 1');
  if (t.phase === 'complete') {
    if (t.alive.length > 1) v.push('tournament complete with several players alive');
    if (t.championId !== (t.alive[0] ?? null)) v.push('champion is not the last player alive');
  } else if (t.alive.length < 2) v.push('tournament still running with fewer than two players');
  if (t.phase === 'playing') {
    if (t.game.mode !== 'knockout') v.push('round is not in knockout mode');
    if (t.game.players.some((p) => !entrants.includes(p.id))) v.push('stranger in the round');
  }
  for (const r of t.rounds) {
    if (!r.final && r.eliminated.length === 0) v.push(`round ${r.round} eliminated nobody`);
    if (r.advancing.some((id) => r.eliminated.some((e) => e.playerId === id))) v.push(`round ${r.round} advanced an eliminated player`);
  }
  return v;
}

/** Plays a whole seeded Knockouts tournament with bots. */
export function simulateTournament(options: TournamentSimulationOptions): TournamentSimulationResult {
  const ids = Array.from({ length: options.playerCount }, (_, i) => `p${i + 1}`);
  const bots = makeBots(ids, options.seed, options.makeBot);
  let t = createTournament({ seed: options.seed, players: ids.map((id) => ({ id, name: `Bot ${id}` })) });
  const maxActions = options.maxActions ?? 30000;
  const violations: string[] = [...findInvariantViolations(t.game), ...findTournamentViolations(t)];
  let actions = 0;
  let counter = 0;
  const forfeit = options.forfeitChance ? { chance: options.forfeitChance, rng: harnessRng(`${String(options.seed)}:forfeit`) } : null;
  const driver: Driver = {
    apply: (a) => {
      const res = applyTournamentAction(t, a as TournamentAction);
      if (!res.ok) return res;
      const before = t.game;
      t = res.state;
      // The driver reports the round's game result (the next round only starts on NEXT_ROUND).
      return { ok: true, state: t.game, events: res.events, duplicate: res.duplicate && t.game === before };
    },
    game: () => t.game,
  };

  while (t.phase !== 'complete' && actions < maxActions && violations.length === 0) {
    if (t.phase === 'roundOver') {
      const res = applyTournamentAction(t, { type: 'NEXT_ROUND' });
      if (!res.ok) violations.push(`NEXT_ROUND rejected: ${res.error.code}`);
      else t = res.state;
    } else if (step(driver, bots, violations, () => `t${++counter}`, forfeit)) {
      actions++;
    } else if (violations.length === 0) violations.push('step made no progress');
    for (const msg of findTournamentViolations(t)) violations.push(`tournament r${t.round}: ${msg}`);
  }

  return {
    seed: options.seed,
    complete: t.phase === 'complete',
    championId: t.championId,
    rounds: t.rounds.length,
    stalledRounds: t.rounds.filter((r) => r.reason === 'stalled').length,
    forfeits: t.eliminated.filter((e) => e.reason === 'forfeit').length,
    actions,
    violations,
    finalState: t,
  };
}
