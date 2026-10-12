import {
  applyAction,
  createDeck,
  parseCard,
  RULESET_ID,
  STATE_SCHEMA_VERSION,
  UK_CLASSIC_V1,
  type ActionResult,
  type Card,
  type Direction,
  type GameAction,
  type GameState,
  type PendingAttack,
} from '@ukbj/game-engine';

export interface Scenario {
  /** Hands by player, card ids like "5H". Player ids are p1, p2, ... */
  hands: string[][];
  /** Visible top discard. */
  top: string;
  /** Explicit draw pile, listed bottom → top (last element is drawn first). */
  drawPile?: string[];
  /** Cards beneath the top discard (recyclable). */
  discardUnder?: string[];
  /** Where to put cards not mentioned anywhere else. Default: bottom of draw pile. */
  leftovers?: 'draw' | 'discard' | 'none';
  current?: number;
  direction?: Direction;
  pendingAttack?: PendingAttack | null;
  drawnCardId?: string | null;
}

/**
 * Builds a precise mid-game state. Unmentioned cards are placed so that the
 * 52-card conservation invariant still holds (unless leftovers: 'none').
 */
export function scenario(s: Scenario): GameState {
  const used = new Set<string>();
  const take = (id: string): Card => {
    if (used.has(id)) throw new Error(`Card ${id} used twice in scenario`);
    used.add(id);
    return parseCard(id);
  };
  const players = s.hands.map((hand, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    hand: hand.map(take),
    declaredLastCard: false,
  }));
  const top = take(s.top);
  const under = (s.discardUnder ?? []).map(take);
  const draw = (s.drawPile ?? []).map(take);
  const rest = createDeck().filter((c) => !used.has(c.id));
  const leftovers = s.leftovers ?? 'draw';

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    rulesetId: RULESET_ID,
    rules: UK_CLASSIC_V1,
    gameId: 'test',
    version: 1,
    rngState: 12345,
    phase: 'playing',
    players,
    drawPile: leftovers === 'draw' ? [...rest, ...draw] : draw,
    discardPile: leftovers === 'discard' ? [...rest, ...under, top] : [...under, top],
    currentPlayerIndex: s.current ?? 0,
    direction: s.direction ?? 1,
    pendingAttack: s.pendingAttack ?? null,
    turn: { drawnCardId: (s.drawnCardId ?? null) as GameState['turn']['drawnCardId'] },
    lastCardWindow: null,
    turnNumber: 1,
    winnerId: null,
    endReason: null,
    processedActionIds: [],
    events: [],
  };
}

let n = 0;
export const nextId = (): string => `t${++n}`;

type Move = Omit<GameAction, 'actionId'> & { actionId?: string };

/** Applies an action and throws with the error code if it was rejected. */
export function act(state: GameState, action: Move): GameState {
  const res = applyAction(state, { actionId: nextId(), ...action } as GameAction);
  if (!res.ok) throw new Error(`Action rejected: ${res.error.code} — ${res.error.message}`);
  return res.state;
}

/** Applies an action expecting rejection; returns the error code. */
export function reject(state: GameState, action: Move): string {
  const res: ActionResult = applyAction(state, { actionId: nextId(), ...action } as GameAction);
  if (res.ok) throw new Error(`Expected rejection but action was accepted: ${JSON.stringify(action)}`);
  return res.error.code;
}

export const play = (playerId: string, cardId: string, declareLastCard?: boolean) =>
  ({ type: 'PLAY_CARD', playerId, cardId, declareLastCard }) as Move;
export const draw = (playerId: string) => ({ type: 'DRAW', playerId }) as Move;
export const pass = (playerId: string) => ({ type: 'PASS', playerId }) as Move;

export const ids = (cards: readonly Card[]): string[] => cards.map((c) => c.id);
export const current = (s: GameState): string => s.players[s.currentPlayerIndex]!.id;
export const hand = (s: GameState, playerId: string): string[] => ids(s.players.find((p) => p.id === playerId)!.hand);
export const top = (s: GameState): string => s.discardPile[s.discardPile.length - 1]!.id;

/** Recursively freezes a value so any mutation by the engine throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
