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
  type GameMode,
  type GameState,
  type PendingAttack,
  type PlayerStatus,
  type Suit,
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
  activeSuit?: Suit | null;
  mode?: GameMode;
  /** Per-player status (default all active); non-active players must have empty hands. */
  statuses?: PlayerStatus[];
  finishOrder?: string[];
  declared?: boolean[];
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
    declaredLastCard: s.declared?.[i] ?? false,
    status: s.statuses?.[i] ?? ('active' as PlayerStatus),
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
    mode: s.mode ?? 'classic',
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
    activeSuit: s.activeSuit ?? null,
    turn: { drawnCardId: (s.drawnCardId ?? null) as GameState['turn']['drawnCardId'] },
    lastCardWindow: null,
    turnNumber: 1,
    winnerId: null,
    endReason: null,
    finishOrder: s.finishOrder ?? [],
    eliminatedId: null,
    processedActionIds: [],
    events: [],
  };
}

let n = 0;
export const nextId = (): string => `t${++n}`;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Move = DistributiveOmit<GameAction, 'actionId'> & { actionId?: string };

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

/**
 * Card spec for plays: "5H", or an Ace with its chosen suit as "AS>H".
 * A bare Ace ("AS") keeps its printed suit.
 */
export function cardPlay(spec: string): { cardId: string; chosenSuit?: string } {
  const [cardId, suit] = spec.split('>') as [string, string | undefined];
  if (cardId.startsWith('A')) return { cardId, chosenSuit: suit ?? cardId.slice(-1) };
  return suit ? { cardId, chosenSuit: suit } : { cardId };
}

/** One-card play (v1-style). */
export const play = (playerId: string, spec: string, declareLastCard?: boolean) =>
  ({ type: 'PLAY_CARDS', playerId, plays: [cardPlay(spec)], declareLastCard }) as Move;

/** Multi-card play in order, e.g. seq('p1', ['7S', '8S', '9S']). */
export const seq = (playerId: string, specs: string[], declareLastCard?: boolean) =>
  ({ type: 'PLAY_CARDS', playerId, plays: specs.map(cardPlay), declareLastCard }) as Move;

/** The PLAY_CARDS intent getLegalMoves lists for a single card. */
export const single = (spec: string, declareLastCard?: boolean) =>
  (declareLastCard ? { type: 'PLAY_CARDS', plays: [cardPlay(spec)], declareLastCard: true } : { type: 'PLAY_CARDS', plays: [cardPlay(spec)] });
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
