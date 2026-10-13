/**
 * Pure, deterministic state-transition engine for UK Black Jack (uk-classic-v1).
 *
 * Every exported function takes a GameState and returns a new one; inputs are never
 * mutated. Internally each transition clones the state into a mutable working copy
 * ("Work"), applies the change, and returns the copy as an immutable GameState.
 */

import { createDeck, type Card } from './cards';
import { gameError, GameConfigError, type GameError } from './errors';
import { nextInt, seedToState, shuffleWithState } from './rng';
import { drawableCount, findPlayerIndex, isCardPlayable, playContext, playerHasLegalPlay } from './rules';
import { checkPlays, resolvePlays, type PlayOutcome } from './sequence';
import {
  RULESET_ID,
  STATE_SCHEMA_VERSION,
  SYSTEM_PLAYER_ID,
  UK_CLASSIC_V1,
  type CardPlay,
  type DrawReason,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerState,
  type RulesConfig,
} from './types';

// ---------------------------------------------------------------------------
// Working copy helpers
// ---------------------------------------------------------------------------

type Mut<T> = { -readonly [K in keyof T]: T[K] };
type WorkPlayer = Omit<Mut<PlayerState>, 'hand'> & { hand: Card[] };
type Work = Omit<Mut<GameState>, 'players' | 'drawPile' | 'discardPile' | 'events' | 'processedActionIds' | 'turn'> & {
  players: WorkPlayer[];
  drawPile: Card[];
  discardPile: Card[];
  events: GameEvent[];
  processedActionIds: string[];
  turn: { drawnCardId: GameState['turn']['drawnCardId'] };
};

function toWork(s: GameState): Work {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    drawPile: s.drawPile.slice(),
    discardPile: s.discardPile.slice(),
    events: s.events.slice(),
    processedActionIds: s.processedActionIds.slice(),
    turn: { ...s.turn },
  };
}

const done = (w: Work): GameState => w as GameState;

/** Events carry Omit<_, 'version'>; the version is stamped on emit. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function emit(w: Work, e: DistributiveOmit<GameEvent, 'version'>): void {
  w.events.push({ ...e, version: w.version } as GameEvent);
}

function playerAt(w: Work, index: number): WorkPlayer {
  const p = w.players[index];
  if (!p) throw new Error(`Corrupt state: no player at index ${index}`);
  return p;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface PlayerSeat {
  readonly id: PlayerId;
  readonly name: string;
}

export interface CreateGameOptions {
  readonly players: readonly PlayerSeat[];
  /** Determines shuffle, first player and every reshuffle. Keep secret on the server. */
  readonly seed: string | number;
  readonly gameId?: string;
  readonly rules?: Partial<RulesConfig>;
}

/** Creates a shuffled, undealt game in phase "dealing". Throws GameConfigError on invalid setup. */
export function createGame(options: CreateGameOptions): GameState {
  const rules: RulesConfig = { ...UK_CLASSIC_V1, ...options.rules };
  const { players } = options;
  if (players.length < rules.minPlayers || players.length > rules.maxPlayers) {
    throw new GameConfigError(`Player count must be ${rules.minPlayers}–${rules.maxPlayers}, got ${players.length}`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new GameConfigError('Player ids must be unique');
  if (ids.has(SYSTEM_PLAYER_ID)) throw new GameConfigError(`"${SYSTEM_PLAYER_ID}" is reserved`);
  if (players.some((p) => !p.id)) throw new GameConfigError('Player ids must be non-empty');
  if (players.length * rules.handSize + 1 > 52) throw new GameConfigError('Not enough cards to deal');

  const shuffled = shuffleWithState(createDeck(), seedToState(options.seed));

  const w: Work = {
    schemaVersion: STATE_SCHEMA_VERSION,
    rulesetId: RULESET_ID,
    rules,
    gameId: options.gameId ?? `game-${String(options.seed)}`,
    version: 0,
    rngState: shuffled.state,
    phase: 'dealing',
    players: players.map((p) => ({ id: p.id, name: p.name, hand: [], declaredLastCard: false })),
    drawPile: shuffled.items,
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    pendingAttack: null,
    activeSuit: null,
    turn: { drawnCardId: null },
    lastCardWindow: null,
    turnNumber: 0,
    winnerId: null,
    endReason: null,
    processedActionIds: [],
    events: [],
  };
  emit(w, { type: 'GAME_CREATED', playerIds: players.map((p) => p.id) });
  return done(w);
}

/**
 * Deals hands one card at a time round-robin, turns the starter card, and picks a
 * random first player. The starter card has no power effect, even if it is a power
 * card: a starter Queen needs no cover and a starter Ace keeps its printed suit.
 */
export function dealCards(state: GameState): GameState {
  if (state.phase !== 'dealing') throw new GameConfigError('Cards have already been dealt');
  const w = toWork(state);
  w.version += 1;
  for (let round = 0; round < w.rules.handSize; round++) {
    for (const p of w.players) p.hand.push(popOrThrow(w.drawPile));
  }
  const starter = popOrThrow(w.drawPile);
  w.discardPile.push(starter);
  const first = nextInt(w.rngState, w.players.length);
  w.rngState = first.state;
  w.phase = 'playing';
  emit(w, { type: 'CARDS_DEALT', handSize: w.rules.handSize, starterCard: starter, firstPlayerId: playerAt(w, first.value).id });
  startTurn(w, first.value);
  return done(w);
}

/** Convenience: createGame + dealCards. */
export function startGame(options: CreateGameOptions): GameState {
  return dealCards(createGame(options));
}

function popOrThrow(cards: Card[]): Card {
  const c = cards.pop();
  if (!c) throw new Error('Deck exhausted during deal');
  return c;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns a typed error if `action` is not legal now, otherwise null. Never throws. */
export function validateAction(state: GameState, action: GameAction): GameError | null {
  if (state.phase === 'finished') return gameError('GAME_OVER', 'The game is over');
  if (state.phase === 'dealing') return gameError('WRONG_PHASE', 'Cards have not been dealt yet');
  if (action.expectedVersion !== undefined && action.expectedVersion !== state.version) {
    return gameError('STALE_VERSION', `Expected version ${action.expectedVersion}, state is at ${state.version}`);
  }

  if (action.type === 'CLOSE_LAST_CARD_WINDOW') {
    if (action.playerId !== SYSTEM_PLAYER_ID) return gameError('SYSTEM_ONLY', 'Only the server can close the window');
    if (state.phase !== 'lastCardWindow') return gameError('NO_OPEN_CHALLENGE_WINDOW', 'No Last Card window is open');
    return null;
  }

  const idx = findPlayerIndex(state, action.playerId);
  if (idx < 0) return gameError('UNKNOWN_PLAYER', `Unknown player ${action.playerId}`);
  const player = state.players[idx]!;

  if (state.phase === 'lastCardWindow') {
    const window = state.lastCardWindow!;
    if (action.type === 'DECLARE_LAST_CARD') {
      if (action.playerId !== window.playerId) return gameError('NOT_ON_LAST_CARD', 'Only the player on one card may declare');
      return null;
    }
    if (action.type === 'CHALLENGE_LAST_CARD') {
      if (action.playerId === action.targetPlayerId) return gameError('CANNOT_CHALLENGE_SELF', 'You cannot challenge yourself');
      if (action.targetPlayerId !== window.playerId) return gameError('INVALID_CHALLENGE_TARGET', 'That player cannot be challenged');
      return null;
    }
    return gameError('WRONG_PHASE', 'Waiting for the Last Card declaration window to close');
  }

  // phase === 'playing'
  switch (action.type) {
    case 'DECLARE_LAST_CARD':
      if (player.hand.length !== 1) return gameError('NOT_ON_LAST_CARD', 'You can only declare with exactly one card');
      if (player.declaredLastCard) return gameError('ALREADY_DECLARED', 'Last Card already declared');
      return null;
    case 'CHALLENGE_LAST_CARD':
      return gameError('NO_OPEN_CHALLENGE_WINDOW', 'There is no Last Card window open to challenge');
    case 'PLAY_CARDS':
    case 'DRAW':
    case 'PASS':
      break;
    default:
      return gameError('UNKNOWN_ACTION', `Unknown action ${(action as { type: string }).type}`);
  }

  if (idx !== state.currentPlayerIndex) return gameError('NOT_YOUR_TURN', 'It is not your turn');

  if (action.type === 'DRAW') {
    if (state.turn.drawnCardId) return gameError('ALREADY_DRAWN', 'You have already drawn this turn — play the drawn card or pass');
    if (!state.pendingAttack && drawableCount(state) === 0 && playerHasLegalPlay(state, player)) {
      return gameError('MUST_PLAY', 'No cards left to draw and you have a playable card');
    }
    return null;
  }

  if (action.type === 'PASS') {
    if (!state.turn.drawnCardId) return gameError('NOTHING_TO_PASS', 'You can only pass after drawing a card');
    return null;
  }

  // PLAY_CARDS
  if (!Array.isArray(action.plays)) return gameError('EMPTY_PLAY', 'Choose at least one card to play');
  return checkPlays(playContext(state, player), action.plays);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[]; readonly duplicate: boolean }
  | { readonly ok: false; readonly error: GameError };

/**
 * Validates and applies an action. Replaying an already-applied actionId returns the
 * unchanged state with duplicate=true (idempotent). Rule violations return ok=false.
 */
export function applyAction(state: GameState, action: GameAction): ActionResult {
  if (state.processedActionIds.includes(action.actionId)) {
    return { ok: true, state, events: [], duplicate: true };
  }
  const error = validateAction(state, action);
  if (error) return { ok: false, error };

  const w = toWork(state);
  w.version += 1;
  const before = w.events.length;

  switch (action.type) {
    case 'PLAY_CARDS':
      doPlayCards(w, action.playerId, action.plays, action.declareLastCard === true);
      break;
    case 'DRAW':
      doDraw(w);
      break;
    case 'PASS':
      emit(w, { type: 'TURN_PASSED', playerId: action.playerId });
      endTurn(w, 1);
      break;
    case 'DECLARE_LAST_CARD':
      doDeclare(w, action.playerId);
      break;
    case 'CHALLENGE_LAST_CARD':
      doChallenge(w, action.playerId, action.targetPlayerId);
      break;
    case 'CLOSE_LAST_CARD_WINDOW':
      closeWindow(w);
      break;
  }

  w.processedActionIds.push(action.actionId);
  return { ok: true, state: done(w), events: w.events.slice(before), duplicate: false };
}

function doPlayCards(w: Work, playerId: PlayerId, plays: readonly CardPlay[], declare: boolean): void {
  const idx = w.players.findIndex((p) => p.id === playerId);
  const player = playerAt(w, idx);
  const outcome = resolvePlays(playContext(done(w), player), plays, { two: w.rules.twoPenalty, blackJack: w.rules.blackJackPenalty });

  const played: Card[] = [];
  plays.forEach((p, i) => {
    const at = player.hand.findIndex((c) => c.id === p.cardId);
    const [card] = player.hand.splice(at, 1) as [Card];
    w.discardPile.push(card);
    played.push(card);
    emit(w, { type: 'CARD_PLAYED', playerId, card, index: i, of: plays.length });
  });
  if (played.length > 1) emit(w, { type: 'SEQUENCE_PLAYED', playerId, cards: played });
  w.turn.drawnCardId = null;
  w.activeSuit = outcome.activeSuit;

  if (player.hand.length === 0) {
    player.declaredLastCard = false;
    finish(w, 'win', playerId);
    return;
  }

  const steps = applyOutcome(w, outcome, played);

  if (outcome.queenPenalty) {
    const queen = played[played.length - 1]!;
    emit(w, { type: 'QUEEN_UNCOVERED', playerId, queen });
    drawCards(w, idx, 1, 'queenPenalty'); // the drawn card cannot be played: the turn ends now
  }

  let needsWindow = false;
  if (player.hand.length === 1) {
    if (declare || player.declaredLastCard) {
      if (!player.declaredLastCard) {
        player.declaredLastCard = true;
        emit(w, { type: 'LAST_CARD_DECLARED', playerId });
      }
    } else {
      needsWindow = true;
    }
  }

  if (needsWindow) {
    w.phase = 'lastCardWindow';
    w.lastCardWindow = { playerId, resumePlayerIndex: stepIndex(w, steps) };
    emit(w, { type: 'LAST_CARD_WINDOW_OPENED', playerId });
    return;
  }
  endTurn(w, steps);
}

/**
 * Applies a resolved sequence's power effects in card order and returns how many
 * seats to advance (mod player count; 0 = the same player goes again).
 * Every King reverses (in a two-player game it also acts as a skip); every 8 skips.
 */
function applyOutcome(w: Work, outcome: PlayOutcome, played: readonly Card[]): number {
  const n = w.players.length;
  const actor = playerAt(w, w.currentPlayerIndex).id;
  const byId = new Map(played.map((c) => [c.id, c]));
  for (const e of outcome.effects) {
    switch (e.kind) {
      case 'attackStarted':
        emit(w, { type: 'ATTACK_STARTED', kind: e.attack.kind, amount: e.attack.amount });
        break;
      case 'attackStacked':
        emit(w, { type: 'ATTACK_STACKED', kind: e.attack.kind, amount: e.attack.amount });
        break;
      case 'attackCancelled':
        emit(w, { type: 'ATTACK_CANCELLED', playerId: actor, cancelledAmount: e.cancelledAmount });
        break;
      case 'attackNeutralised':
        emit(w, { type: 'ATTACK_NEUTRALISED', playerId: actor, kind: e.neutralised.kind, amount: e.neutralised.amount });
        break;
      case 'reverse':
        w.direction = w.direction === 1 ? -1 : 1;
        emit(w, { type: 'DIRECTION_REVERSED', direction: w.direction });
        break;
      case 'suitChosen':
        emit(w, { type: 'SUIT_CHOSEN', playerId: actor, suit: e.suit });
        break;
      case 'queenCovered':
        emit(w, { type: 'QUEEN_COVERED', playerId: actor, queen: byId.get(e.queenId)!, cover: byId.get(e.coverId)! });
        break;
      case 'skip':
        break; // announced below, once the final direction is known
    }
  }
  w.pendingAttack = outcome.attack;
  const skips = outcome.eights + (n === 2 ? outcome.kings : 0);
  for (let i = 1; i <= Math.min(outcome.eights, n - 1); i++) {
    const skipped = playerAt(w, stepIndex(w, i));
    if (skipped.id !== actor) emit(w, { type: 'PLAYER_SKIPPED', playerId: skipped.id });
  }
  return 1 + skips;
}

function doDraw(w: Work): void {
  const idx = w.currentPlayerIndex;
  const player = playerAt(w, idx);

  if (w.pendingAttack) {
    resolveAttackInPlace(w);
    endTurn(w, 1);
    return;
  }

  const drawn = drawCards(w, idx, 1, 'normal');
  const card = drawn[0];
  if (card) {
    w.turn.drawnCardId = card.id;
    if (isCardPlayable(done(w), card, player)) return; // player may now play it or pass
    w.turn.drawnCardId = null;
  }
  endTurn(w, 1);
}

/** Current player takes the whole pending penalty and loses their turn (turn not advanced here). */
function resolveAttackInPlace(w: Work): void {
  const attack = w.pendingAttack;
  if (!attack) return;
  const reason: DrawReason = attack.kind === 'two' ? 'twoPenalty' : 'blackJackPenalty';
  drawCards(w, w.currentPlayerIndex, attack.amount, reason);
  w.pendingAttack = null;
}

function doDeclare(w: Work, playerId: PlayerId): void {
  const player = playerAt(w, w.players.findIndex((p) => p.id === playerId));
  player.declaredLastCard = true;
  emit(w, { type: 'LAST_CARD_DECLARED', playerId });
  if (w.phase === 'lastCardWindow') closeWindow(w);
}

function doChallenge(w: Work, challengerId: PlayerId, targetId: PlayerId): void {
  const targetIndex = w.players.findIndex((p) => p.id === targetId);
  emit(w, { type: 'LAST_CARD_CHALLENGED', challengerId, targetPlayerId: targetId });
  drawCards(w, targetIndex, w.rules.lastCardPenalty, 'lastCardPenalty');
  closeWindow(w);
}

function closeWindow(w: Work): void {
  const window = w.lastCardWindow;
  if (!window) return;
  w.lastCardWindow = null;
  w.phase = 'playing';
  emit(w, { type: 'LAST_CARD_WINDOW_CLOSED', playerId: window.playerId });
  if (!checkStalemateInPlace(w)) startTurn(w, window.resumePlayerIndex);
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function stepIndex(w: { currentPlayerIndex: number; direction: number; players: readonly unknown[] }, steps: number): number {
  const n = w.players.length;
  return (((w.currentPlayerIndex + w.direction * steps) % n) + n) % n;
}

function startTurn(w: Work, index: number): void {
  w.currentPlayerIndex = index;
  w.turn = { drawnCardId: null };
  w.turnNumber += 1;
  emit(w, { type: 'TURN_STARTED', playerId: playerAt(w, index).id, turnNumber: w.turnNumber });
}

function endTurn(w: Work, steps: number): void {
  if (checkStalemateInPlace(w)) return;
  startTurn(w, stepIndex(w, steps));
}

function finish(w: Work, reason: 'win' | 'stalemate', winnerId: PlayerId | null): void {
  w.phase = 'finished';
  w.endReason = reason;
  w.winnerId = winnerId;
  w.pendingAttack = null;
  w.lastCardWindow = null;
  w.turn = { drawnCardId: null };
  if (reason === 'win' && winnerId) emit(w, { type: 'GAME_WON', playerId: winnerId });
  else emit(w, { type: 'STALEMATE', winnerId });
}

/**
 * Stalemate detection, run whenever a turn ends:
 *  1. Deadlock — nothing left to draw or recycle, no attack outstanding, and no player
 *     can legally play on the top card. (Players may not "draw" from an empty deck while
 *     holding a playable card, so this state is truly stuck.)
 *  2. Turn cap — rules.maxTurns turns have been played (stall breaker for endless games).
 * Resolved in favour of the player with the fewest cards; a tie for fewest is a draw.
 */
function checkStalemateInPlace(w: Work): boolean {
  const s = done(w);
  const capped = s.turnNumber >= s.rules.maxTurns;
  if (!capped) {
    if (s.pendingAttack || drawableCount(s) > 0) return false;
    if (s.players.some((p) => playerHasLegalPlay(s, p))) return false;
  }
  const min = Math.min(...s.players.map((p) => p.hand.length));
  const leaders = s.players.filter((p) => p.hand.length === min);
  finish(w, 'stalemate', leaders.length === 1 ? leaders[0]!.id : null);
  return true;
}

// ---------------------------------------------------------------------------
// Drawing and deck exhaustion
// ---------------------------------------------------------------------------

/** Draws up to `count` cards for a player, recycling discards as needed. Returns the cards drawn. */
function drawCards(w: Work, playerIndex: number, count: number, reason: DrawReason): Card[] {
  const player = playerAt(w, playerIndex);
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (w.drawPile.length === 0) recycleInPlace(w);
    const c = w.drawPile.pop();
    if (!c) break; // fulfil as much as possible
    drawn.push(c);
  }
  player.hand.push(...drawn);
  if (player.hand.length !== 1) player.declaredLastCard = false;
  emit(w, { type: 'CARDS_DRAWN', playerId: player.id, cards: drawn, count: drawn.length, requested: count, reason });
  return drawn;
}

function recycleInPlace(w: Work): void {
  if (w.discardPile.length <= 1) return;
  const top = w.discardPile.pop()!;
  const shuffled = shuffleWithState(w.discardPile, w.rngState);
  w.rngState = shuffled.state;
  w.drawPile = shuffled.items.concat(w.drawPile);
  w.discardPile = [top];
  emit(w, { type: 'DISCARDS_RECYCLED', count: shuffled.items.length });
}

// ---------------------------------------------------------------------------
// Public pure step functions (thin wrappers, useful for tests and tooling)
// ---------------------------------------------------------------------------

/** Shuffles every discard except the visible top card back under the draw pile. */
export function recycleDiscardPile(state: GameState): GameState {
  if (state.discardPile.length <= 1) return state;
  const w = toWork(state);
  w.version += 1;
  recycleInPlace(w);
  return done(w);
}

/** Moves play `steps` seats in the current direction and starts that player's turn. */
export function advanceTurn(state: GameState, steps = 1): GameState {
  if (state.phase !== 'playing') return state;
  const w = toWork(state);
  w.version += 1;
  startTurn(w, stepIndex(w, steps));
  return done(w);
}

/** The current player accepts the pending attack penalty and their turn passes on. */
export function resolveAttack(state: GameState): GameState {
  if (state.phase !== 'playing' || !state.pendingAttack) return state;
  const w = toWork(state);
  w.version += 1;
  resolveAttackInPlace(w);
  endTurn(w, 1);
  return done(w);
}

/**
 * Applies the effect of `card` as if the current player had just played it alone (the
 * card must already be the top discard). Aces take `chosenSuit` (default: printed suit).
 */
export function resolveCardEffect(state: GameState, card: Card, chosenSuit?: GameState['activeSuit']): GameState {
  if (state.phase !== 'playing') return state;
  const w = toWork(state);
  w.version += 1;
  const play: CardPlay = card.rank === 'A' ? { cardId: card.id, chosenSuit: chosenSuit ?? card.suit } : { cardId: card.id };
  const ctx = { hand: [card], top: null, activeSuit: null, pendingAttack: state.pendingAttack, drawnCardId: null };
  const outcome = resolvePlays(ctx, [play], { two: w.rules.twoPenalty, blackJack: w.rules.blackJackPenalty });
  w.activeSuit = outcome.activeSuit;
  const steps = applyOutcome(w, outcome, [card]);
  endTurn(w, steps);
  return done(w);
}

export function declareLastCard(state: GameState, playerId: PlayerId, actionId: string): ActionResult {
  return applyAction(state, { type: 'DECLARE_LAST_CARD', playerId, actionId });
}

export function challengeLastCard(
  state: GameState,
  challengerId: PlayerId,
  targetPlayerId: PlayerId,
  actionId: string,
): ActionResult {
  return applyAction(state, { type: 'CHALLENGE_LAST_CARD', playerId: challengerId, targetPlayerId, actionId });
}

export function closeLastCardWindow(state: GameState, actionId: string): ActionResult {
  return applyAction(state, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId });
}

export interface WinnerInfo {
  readonly winnerId: PlayerId | null;
  readonly endReason: 'win' | 'stalemate';
}

/** Returns the result if the game is over, otherwise null. */
export function checkWinner(state: GameState): WinnerInfo | null {
  if (state.phase !== 'finished' || !state.endReason) return null;
  return { winnerId: state.winnerId, endReason: state.endReason };
}

/** Total cards across hands, draw pile and discard pile — always 52 in a valid state. */
export function countAllCards(state: GameState): number {
  return state.drawPile.length + state.discardPile.length + state.players.reduce((n, p) => n + p.hand.length, 0);
}
