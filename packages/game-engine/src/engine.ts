/**
 * Pure, deterministic state-transition engine for UK Black Jack (uk-classic-v1.2),
 * in Classic mode (first to empty their hand wins) and Knockout mode (one round of a
 * Knockouts tournament: players finish in order until one is left holding cards).
 *
 * Every exported function takes a GameState and returns a new one; inputs are never
 * mutated. Internally each transition clones the state into a mutable working copy
 * ("Work"), applies the change, and returns the copy as an immutable GameState.
 */

import { createDeck, type Card } from './cards';
import { gameError, GameConfigError, type GameError } from './errors';
import { nextInt, seedToState, shuffleWithState } from './rng';
import { activePlayerCount, drawableCount, findPlayerIndex, playContext, playerHasLegalPlay } from './rules';
import { checkPlays, resolvePlays, type PlayOutcome } from './sequence';
import {
  RULESET_ID,
  STATE_SCHEMA_VERSION,
  SYSTEM_PLAYER_ID,
  UK_CLASSIC_V1,
  type CardPlay,
  type DrawReason,
  type GameAction,
  type GameMode,
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
type Work = Omit<Mut<GameState>, 'players' | 'drawPile' | 'discardPile' | 'events' | 'processedActionIds' | 'turn' | 'finishOrder'> & {
  players: WorkPlayer[];
  finishOrder: PlayerId[];
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
    finishOrder: s.finishOrder.slice(),
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
  /** Default 'classic'. 'knockout' plays one round of a Knockouts tournament. */
  readonly mode?: GameMode;
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
    mode: options.mode ?? 'classic',
    gameId: options.gameId ?? `game-${String(options.seed)}`,
    version: 0,
    rngState: shuffled.state,
    phase: 'dealing',
    players: players.map((p) => ({ id: p.id, name: p.name, hand: [], declaredLastCard: false, status: 'active' as const })),
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
    finishOrder: [],
    eliminatedId: null,
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

  if (action.type === 'FORFEIT') return validateForfeit(state, action.playerId, action.targetPlayerId);

  const idx = findPlayerIndex(state, action.playerId);
  if (idx < 0) return gameError('UNKNOWN_PLAYER', `Unknown player ${action.playerId}`);
  const player = state.players[idx]!;
  if (player.status !== 'active') return gameError('PLAYER_OUT', player.status === 'finished' ? 'You have finished this round' : 'You have left this game');

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
    if (!state.pendingAttack && drawableCount(state) === 0 && playerHasLegalPlay(state, player)) {
      return gameError('MUST_PLAY', 'No cards left to draw and you have a playable card');
    }
    return null;
  }

  if (action.type === 'PASS') return gameError('NOTHING_TO_PASS', 'Picking up ends your turn — there is nothing to pass');

  // PLAY_CARDS
  if (!Array.isArray(action.plays)) return gameError('EMPTY_PLAY', 'Choose at least one card to play');
  return checkPlays(playContext(state, player), action.plays, action.declareLastCard === true);
}

function validateForfeit(state: GameState, actorId: PlayerId, targetId: PlayerId | undefined): GameError | null {
  const target = actorId === SYSTEM_PLAYER_ID ? targetId : (targetId ?? actorId);
  if (actorId !== SYSTEM_PLAYER_ID) {
    if (findPlayerIndex(state, actorId) < 0) return gameError('UNKNOWN_PLAYER', `Unknown player ${actorId}`);
    if (target !== actorId) return gameError('INVALID_FORFEIT_TARGET', 'You can only forfeit yourself');
  }
  if (!target) return gameError('INVALID_FORFEIT_TARGET', 'Name the player to forfeit');
  const p = state.players.find((x) => x.id === target);
  if (!p) return gameError('UNKNOWN_PLAYER', `Unknown player ${target}`);
  if (p.status !== 'active') return gameError('PLAYER_OUT', `${p.name} is no longer playing`);
  return null;
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
      break; // unreachable: always rejected by validateAction
    case 'FORFEIT':
      doForfeit(w, action.playerId === SYSTEM_PLAYER_ID ? action.targetPlayerId! : (action.targetPlayerId ?? action.playerId));
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
  w.activeSuit = outcome.activeSuit;

  const steps = applyOutcome(w, outcome, played);

  if (outcome.blockedFinish) {
    // v1.2: the hand was emptied on a 2/8/J/Q/K/A. The card's effect stands (applied
    // above), no winner is declared, and the player picks up exactly one card — this
    // draw replaces the Queen penalty when the card is an uncoverable Queen. The draw
    // never touches the pending pickup, skips or reverses.
    const card = played[played.length - 1]!;
    if (card.rank === 'Q') emit(w, { type: 'QUEEN_UNCOVERED', playerId, queen: card });
    emit(w, { type: 'FINISH_BLOCKED', playerId, card });
    // Always possible: after a play the discard pile holds at least two cards, so the
    // one under the top can be recycled if the draw pile is empty.
    drawCards(w, idx, 1, card.rank === 'Q' ? 'queenPenalty' : 'blockedFinish');
  }

  if (player.hand.length === 0) {
    if (declare && !player.declaredLastCard) emit(w, { type: 'LAST_CARD_DECLARED', playerId });
    player.declaredLastCard = false;
    if (w.mode === 'classic') {
      finish(w, 'win', playerId);
      return;
    }
    player.status = 'finished';
    w.finishOrder.push(playerId);
    emit(w, { type: 'PLAYER_FINISHED', playerId, place: w.finishOrder.length });
    if (activePlayerCount(done(w)) <= 1) {
      completeRound(w, 'lastHolder', w.players.find((p) => p.status === 'active')?.id ?? null);
      return;
    }
    endTurn(w, steps);
    return;
  }

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
 * active seats to advance. Only the final block of power cards has effects (see
 * resolvePlays). Every King reverses (with two players left in it also acts as a skip);
 * every 8 skips one active player.
 */
function applyOutcome(w: Work, outcome: PlayOutcome, played: readonly Card[]): number {
  const n = activePlayerCount(done(w));
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
      case 'powerCovered':
        emit(w, { type: 'POWER_COVERED', playerId: actor, cards: e.cardIds.map((id) => byId.get(id)!) });
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

/** Any pickup ends the turn (v1.2): the drawn card can only be played on a later turn. */
function doDraw(w: Work): void {
  if (w.pendingAttack) resolveAttackInPlace(w);
  else drawCards(w, w.currentPlayerIndex, 1, 'normal');
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

/**
 * Removes a player from the game (left or disconnected). Their hand is shuffled into the
 * draw pile. If they were the one facing a pending attack, the attack is cleared rather
 * than passed on. A Last Card window aimed at them closes. Classic: when one player is
 * left they win. Knockout: when at most one player still holds cards the round ends
 * (nobody else is eliminated — the forfeiter is the round's casualty).
 */
function doForfeit(w: Work, targetId: PlayerId): void {
  const idx = w.players.findIndex((p) => p.id === targetId);
  const p = playerAt(w, idx);
  const returned = p.hand.length;
  const shuffled = shuffleWithState(w.drawPile.concat(p.hand), w.rngState);
  w.rngState = shuffled.state;
  w.drawPile = shuffled.items;
  p.hand = [];
  p.status = 'forfeited';
  p.declaredLastCard = false;

  const window = w.lastCardWindow;
  const facingAttack = window ? window.resumePlayerIndex === idx : w.currentPlayerIndex === idx;
  const attackCleared = facingAttack && w.pendingAttack !== null;
  if (attackCleared) w.pendingAttack = null;
  emit(w, { type: 'PLAYER_FORFEITED', playerId: targetId, cardsReturned: returned, attackCleared });

  let resume: number | null = null;
  if (window) {
    const resumeIdx = window.resumePlayerIndex === idx ? stepIndex(w, 1, idx) : window.resumePlayerIndex;
    if (window.playerId === targetId) {
      w.lastCardWindow = null;
      w.phase = 'playing';
      emit(w, { type: 'LAST_CARD_WINDOW_CLOSED', playerId: targetId });
      resume = resumeIdx;
    } else {
      w.lastCardWindow = { ...window, resumePlayerIndex: resumeIdx };
    }
  } else if (w.currentPlayerIndex === idx) {
    resume = stepIndex(w, 1, idx);
  }

  const active = w.players.filter((x) => x.status === 'active');
  if (w.mode === 'classic' && active.length <= 1) {
    finish(w, 'forfeit', active[0]?.id ?? null);
    return;
  }
  if (w.mode === 'knockout' && active.length <= 1) {
    completeRound(w, 'forfeit', null);
    return;
  }
  if (resume !== null) {
    if (!checkStalemateInPlace(w)) startTurn(w, resume);
  }
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

/** Index reached by moving `steps` ACTIVE players from `from` in the current direction. */
function stepIndex(w: Work, steps: number, from = w.currentPlayerIndex): number {
  const n = w.players.length;
  let i = from;
  for (let k = 0; k < steps; k++) {
    for (let guard = 0; guard < n; guard++) {
      i = (((i + w.direction) % n) + n) % n;
      if (w.players[i]!.status === 'active') break;
    }
  }
  return i;
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

function finish(w: Work, reason: 'win' | 'stalemate' | 'forfeit', winnerId: PlayerId | null): void {
  w.phase = 'finished';
  w.endReason = reason;
  w.winnerId = winnerId;
  w.pendingAttack = null;
  w.lastCardWindow = null;
  w.turn = { drawnCardId: null };
  if (reason !== 'stalemate' && winnerId) emit(w, { type: 'GAME_WON', playerId: winnerId });
  else emit(w, { type: 'STALEMATE', winnerId });
}

/** Knockout: ends the round. `eliminatedId` is the player knocked out by play (null after a forfeit). */
function completeRound(w: Work, reason: 'lastHolder' | 'stalled' | 'forfeit', eliminatedId: PlayerId | null): void {
  w.phase = 'finished';
  w.endReason = reason === 'stalled' ? 'stalemate' : 'roundComplete';
  w.winnerId = w.finishOrder[0] ?? null;
  w.eliminatedId = eliminatedId;
  w.pendingAttack = null;
  w.lastCardWindow = null;
  w.turn = { drawnCardId: null };
  emit(w, { type: 'ROUND_COMPLETE', finishOrder: w.finishOrder.slice(), eliminatedId, reason });
}

/**
 * Stalemate detection, run whenever a turn ends:
 *  1. Deadlock — nothing left to draw or recycle, no attack outstanding, and no active
 *     player can legally play on the top card. (Players may not "draw" from an empty deck
 *     while holding a playable card, so this state is truly stuck.)
 *  2. Turn cap — rules.maxTurns turns have been played (stall breaker for endless games).
 * Classic: resolved in favour of the active player with the fewest cards; a tie for fewest
 * is a draw. Knockout: the active player with the MOST cards is eliminated; a tie is
 * broken by a seeded (reproducible) draw.
 */
function checkStalemateInPlace(w: Work): boolean {
  const s = done(w);
  const active = s.players.filter((p) => p.status === 'active');
  const capped = s.turnNumber >= s.rules.maxTurns;
  if (!capped) {
    if (s.pendingAttack || drawableCount(s) > 0) return false;
    if (active.some((p) => playerHasLegalPlay(s, p))) return false;
  }
  if (w.mode === 'knockout') {
    const max = Math.max(...active.map((p) => p.hand.length));
    const worst = active.filter((p) => p.hand.length === max);
    const pick = nextInt(w.rngState, worst.length);
    w.rngState = pick.state;
    completeRound(w, 'stalled', worst[pick.value]!.id);
    return true;
  }
  const min = Math.min(...active.map((p) => p.hand.length));
  const leaders = active.filter((p) => p.hand.length === min);
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

/** A player leaves, or (playerId = SYSTEM_PLAYER_ID) the server forfeits a disconnected player. */
export function forfeitPlayer(state: GameState, targetPlayerId: PlayerId, actionId: string, byPlayerId: PlayerId = SYSTEM_PLAYER_ID): ActionResult {
  return applyAction(state, { type: 'FORFEIT', playerId: byPlayerId, targetPlayerId, actionId });
}

export function closeLastCardWindow(state: GameState, actionId: string): ActionResult {
  return applyAction(state, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId });
}

export interface WinnerInfo {
  readonly winnerId: PlayerId | null;
  readonly endReason: NonNullable<GameState['endReason']>;
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
