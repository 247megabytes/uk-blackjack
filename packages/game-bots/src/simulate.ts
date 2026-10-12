import {
  applyAction,
  findInvariantViolations,
  getPlayerView,
  startGame,
  SYSTEM_PLAYER_ID,
  type GameAction,
  type GameState,
  type MoveIntent,
  type PlayerId,
} from '@ukbj/game-engine';
import type { Bot } from './bot';
import { createEasyBot } from './easy';

export interface SimulationOptions {
  readonly seed: string | number;
  readonly playerCount: number;
  /** Factory per seat. Defaults to Easy bots seeded from the game seed. */
  readonly makeBot?: (seat: number, playerId: PlayerId) => Bot;
  /** Safety cap on accepted actions. */
  readonly maxActions?: number;
}

export interface SimulationResult {
  readonly seed: string | number;
  readonly finished: boolean;
  readonly winnerId: PlayerId | null;
  readonly endReason: 'win' | 'stalemate' | null;
  readonly actions: number;
  readonly turns: number;
  readonly violations: readonly string[];
  readonly finalState: GameState;
}

/**
 * Plays one seeded bot-vs-bot game through the public action API, checking state
 * invariants, turn ownership and version monotonicity after every accepted action.
 */
export function simulateGame(options: SimulationOptions): SimulationResult {
  const ids = Array.from({ length: options.playerCount }, (_, i) => `p${i + 1}`);
  const bots = ids.map((id, seat) =>
    options.makeBot ? options.makeBot(seat, id) : createEasyBot({ seed: `${String(options.seed)}:${id}` }),
  );
  let state = startGame({ seed: options.seed, players: ids.map((id) => ({ id, name: `Bot ${id}` })) });
  const maxActions = options.maxActions ?? 5000;
  const violations: string[] = [...findInvariantViolations(state)];
  let actions = 0;
  let counter = 0;

  const submit = (playerId: PlayerId, move: MoveIntent): void => {
    const action = { ...move, playerId, actionId: `a${++counter}`, expectedVersion: state.version } as GameAction;
    const prev = state;
    if (prev.phase === 'playing' && move.type !== 'DECLARE_LAST_CARD' && prev.players[prev.currentPlayerIndex]?.id !== playerId) {
      violations.push(`turn ownership: ${playerId} acted on ${prev.players[prev.currentPlayerIndex]?.id}'s turn`);
    }
    const res = applyAction(prev, action);
    if (!res.ok) {
      violations.push(`legal move rejected for ${playerId}: ${res.error.code} ${JSON.stringify(move)}`);
      return;
    }
    if (res.state.version !== prev.version + 1) violations.push('version did not increment by exactly 1');
    // Idempotency tripwire: replaying the same action must be a no-op.
    const replay = applyAction(res.state, action);
    if (!replay.ok || !replay.duplicate || replay.state !== res.state) violations.push('replayed action was not idempotent');
    state = res.state;
    actions++;
    for (const msg of findInvariantViolations(state)) violations.push(`v${state.version}: ${msg}`);
  };

  while (state.phase !== 'finished' && actions < maxActions && violations.length === 0) {
    if (state.phase === 'lastCardWindow') {
      const target = state.lastCardWindow!.playerId;
      const order = [target, ...ids.filter((id) => id !== target)];
      let acted = false;
      for (const id of order) {
        const move = bots[ids.indexOf(id)]!.chooseMove(getPlayerView(state, id));
        if (move) {
          submit(id, move);
          acted = true;
          break;
        }
      }
      if (!acted) {
        // The server's declaration timer expires.
        const res = applyAction(state, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: `a${++counter}` });
        if (!res.ok) violations.push(`window close rejected: ${res.error.code}`);
        else {
          state = res.state;
          actions++;
        }
      }
      continue;
    }

    const current = state.players[state.currentPlayerIndex]!.id;
    const view = getPlayerView(state, current);
    if (view.hand.length !== state.players[state.currentPlayerIndex]!.hand.length) violations.push('view hand mismatch');
    const move = bots[state.currentPlayerIndex]!.chooseMove(view);
    if (!move) {
      violations.push(`bot ${current} returned no move on its turn (legal: ${JSON.stringify(view.legalMoves)})`);
      break;
    }
    submit(current, move);
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
