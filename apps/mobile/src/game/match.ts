/**
 * MatchController — drives an offline match: one human seat plus 1–5 Easy bots.
 *
 * Framework-free (no React / React Native imports) so it can be tested headlessly.
 * The UI asks `plan()` what should happen next, waits `delayMs`, then calls
 * `runPlan(plan)`. Plans are tied to a state version: if the human acts first,
 * the stale plan is simply ignored. Bots are consulted at most once per version,
 * so re-renders (or React StrictMode double effects) never change their decisions.
 */

import {
  applyAction,
  checkPlays,
  minimalPlayFrom,
  nextCardOptions,
  resolvePlays,
  getPlayerView,
  startGame,
  SYSTEM_PLAYER_ID,
  type ActionResult,
  type Card,
  type CardPlay,
  type GameAction,
  type GameError,
  type PlayOutcome,
  type Suit,
  type GameState,
  type MoveIntent,
  type PlayerId,
  type PlayerView,
} from '@ukbj/game-engine';
import { contextFromView, createEasyBot, type Bot } from '@ukbj/game-bots';
import { BOT_NAMES } from './names';

export const HUMAN_ID: PlayerId = 'you';
export const MIN_BOTS = 1;
export const MAX_BOTS = 5;

export interface MatchSetup {
  readonly seed: string;
  readonly humanName: string;
  readonly botCount: number;
}

export type PacingName = 'relaxed' | 'normal' | 'fast';

export interface Pacing {
  /** Bot "thinking" time before a turn move. */
  readonly botTurnMs: number;
  readonly botTurnJitterMs: number;
  /** A bot that forgot Last Card declares late after this long. */
  readonly windowBotDeclareMs: number;
  /** Bots challenge another bot after this long (the human can challenge sooner). */
  readonly windowChallengeMs: number;
  /** Bots challenge the human only after this grace period, so the human can still declare. */
  readonly windowHumanGraceMs: number;
  /** The "server timer": the window closes unchallenged after this long. */
  readonly windowCloseMs: number;
}

export const PACING: Readonly<Record<PacingName, Pacing>> = {
  relaxed: { botTurnMs: 1150, botTurnJitterMs: 450, windowBotDeclareMs: 1100, windowChallengeMs: 1900, windowHumanGraceMs: 2300, windowCloseMs: 3200 },
  normal: { botTurnMs: 800, botTurnJitterMs: 350, windowBotDeclareMs: 850, windowChallengeMs: 1500, windowHumanGraceMs: 1800, windowCloseMs: 2600 },
  fast: { botTurnMs: 420, botTurnJitterMs: 180, windowBotDeclareMs: 600, windowChallengeMs: 1000, windowHumanGraceMs: 1400, windowCloseMs: 2000 },
};

export type Plan =
  | { readonly kind: 'human'; readonly version: number }
  | { readonly kind: 'finished'; readonly version: number }
  | { readonly kind: 'bot'; readonly version: number; readonly playerId: PlayerId; readonly move: MoveIntent; readonly delayMs: number }
  | { readonly kind: 'closeWindow'; readonly version: number; readonly delayMs: number };

export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, '0');
}

export class MatchController {
  readonly setup: MatchSetup;
  readonly humanId = HUMAN_ID;
  readonly botIds: readonly PlayerId[];
  private readonly bots = new Map<PlayerId, Bot>();
  private current: GameState;
  private counter = 0;
  private cached: { version: number; pacing: Pacing; plan: Plan } | null = null;

  constructor(setup: MatchSetup, makeBot?: (playerId: PlayerId, seat: number) => Bot) {
    const botCount = Math.max(MIN_BOTS, Math.min(MAX_BOTS, Math.floor(setup.botCount)));
    this.setup = { ...setup, botCount };
    this.botIds = Array.from({ length: botCount }, (_, i) => `bot${i + 1}`);
    this.botIds.forEach((id, i) =>
      this.bots.set(id, makeBot ? makeBot(id, i + 1) : createEasyBot({ seed: `${setup.seed}:${id}` })),
    );
    this.current = startGame({
      seed: setup.seed,
      gameId: `solo-${setup.seed}`,
      players: [
        { id: HUMAN_ID, name: setup.humanName.trim() || 'You' },
        ...this.botIds.map((id, i) => ({ id, name: BOT_NAMES[i % BOT_NAMES.length]! })),
      ],
    });
  }

  get state(): GameState {
    return this.current;
  }

  /** The human's redacted view — the only game data the UI renders. */
  view(eventsSinceVersion?: number): PlayerView {
    return getPlayerView(this.current, HUMAN_ID, eventsSinceVersion === undefined ? undefined : { eventsSinceVersion });
  }

  isFinished(): boolean {
    return this.current.phase === 'finished';
  }

  /** Applies a move for the human seat. Returns the engine result (rejections are not thrown). */
  submitHuman(move: MoveIntent): ActionResult {
    return this.apply({ ...move, playerId: HUMAN_ID, actionId: `h${++this.counter}`, expectedVersion: this.current.version } as GameAction);
  }

  /** Decides what happens next. Memoised per state version so bots decide once. */
  plan(pacing: Pacing): Plan {
    const s = this.current;
    if (this.cached && this.cached.version === s.version && this.cached.pacing === pacing) return this.cached.plan;
    if (this.cached && this.cached.version === s.version) {
      // Same decision, re-timed for the new pacing.
      const p = this.cached.plan;
      const retimed = 'delayMs' in p ? { ...p, delayMs: this.retime(p, pacing) } : p;
      this.cached = { version: s.version, pacing, plan: retimed };
      return retimed;
    }
    const plan = this.decide(pacing);
    this.cached = { version: s.version, pacing, plan };
    return plan;
  }

  /** Executes a plan if it is still current. Returns null for stale or non-executable plans. */
  runPlan(plan: Plan): ActionResult | null {
    if (plan.version !== this.current.version) return null;
    if (plan.kind === 'bot') {
      return this.apply({ ...plan.move, playerId: plan.playerId, actionId: `b${++this.counter}`, expectedVersion: plan.version } as GameAction);
    }
    if (plan.kind === 'closeWindow') {
      return this.apply({ type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: `s${++this.counter}`, expectedVersion: plan.version });
    }
    return null;
  }

  private apply(action: GameAction): ActionResult {
    const res = applyAction(this.current, action);
    if (res.ok) this.current = res.state;
    return res;
  }

  private decide(pacing: Pacing): Plan {
    const s = this.current;
    const version = s.version;
    if (s.phase === 'finished') return { kind: 'finished', version };

    if (s.phase === 'lastCardWindow' && s.lastCardWindow) {
      const target = s.lastCardWindow.playerId;
      if (target !== HUMAN_ID) {
        const own = this.bots.get(target)!.chooseMove(getPlayerView(s, target));
        if (own?.type === 'DECLARE_LAST_CARD') {
          return { kind: 'bot', version, playerId: target, move: own, delayMs: pacing.windowBotDeclareMs };
        }
      }
      for (const id of this.botIds) {
        if (id === target) continue;
        const move = this.bots.get(id)!.chooseMove(getPlayerView(s, id));
        if (move?.type === 'CHALLENGE_LAST_CARD') {
          const delayMs = target === HUMAN_ID ? pacing.windowHumanGraceMs : pacing.windowChallengeMs;
          return { kind: 'bot', version, playerId: id, move, delayMs };
        }
      }
      return { kind: 'closeWindow', version, delayMs: pacing.windowCloseMs };
    }

    const currentId = s.players[s.currentPlayerIndex]!.id;
    if (currentId === HUMAN_ID) return { kind: 'human', version };

    const view = getPlayerView(s, currentId);
    const move = this.bots.get(currentId)!.chooseMove(view) ?? view.legalMoves[0];
    if (!move) return { kind: 'human', version }; // unreachable: the current player always has a move
    return { kind: 'bot', version, playerId: currentId, move, delayMs: this.botDelay(pacing, version, move) };
  }

  private botDelay(pacing: Pacing, version: number, move: MoveIntent): number {
    // Deterministic jitter so bots feel less robotic without consuming bot randomness.
    const jitter = ((version * 2654435761) >>> 0) % (pacing.botTurnJitterMs + 1);
    // A second action in the same turn (playing a just-drawn card / passing) is quicker.
    const followUp = this.current.turn.drawnCardId !== null || move.type === 'PASS';
    return Math.round((followUp ? 0.55 : 1) * (pacing.botTurnMs + jitter));
  }

  private retime(plan: Extract<Plan, { delayMs: number }>, pacing: Pacing): number {
    if (plan.kind === 'closeWindow') return pacing.windowCloseMs;
    if (plan.move.type === 'DECLARE_LAST_CARD') return pacing.windowBotDeclareMs;
    if (plan.move.type === 'CHALLENGE_LAST_CARD') {
      return plan.move.targetPlayerId === HUMAN_ID ? pacing.windowHumanGraceMs : pacing.windowChallengeMs;
    }
    return this.botDelay(pacing, plan.version, plan.move);
  }
}

// ---------------------------------------------------------------------------
// Human move helpers used by the UI
// ---------------------------------------------------------------------------

export type PlayMove = Extract<MoveIntent, { type: 'PLAY_CARDS' }>;

export function hasMove(view: PlayerView, type: MoveIntent['type']): boolean {
  return view.legalMoves.some((m) => m.type === type);
}

/** True when it is the human's turn to play cards (not during a Last Card window). */
export function isHumanTurn(view: PlayerView): boolean {
  return view.phase === 'playing' && view.currentPlayerId === view.viewerId;
}

/**
 * Card ids that may be tapped next to extend `selection`. With an empty selection
 * these are the cards that can start a complete legal play.
 */
export function selectableCardIds(view: PlayerView, selection: readonly CardPlay[]): Set<string> {
  if (!isHumanTurn(view)) return new Set();
  const ctx = contextFromView(view);
  const options = nextCardOptions(ctx, selection);
  const usable = selection.length === 0 ? options.filter((c) => minimalPlayFrom(ctx, c) !== null) : options;
  return new Set(usable.map((c) => c.id));
}

/** Kept for callers that only need the starting cards. */
export function playableCardIds(view: PlayerView): Set<string> {
  return selectableCardIds(view, []);
}

export type SelectionState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly queenPenalty: boolean; readonly leavesOne: boolean; readonly outcome: PlayOutcome }
  | { readonly kind: 'needsCover'; readonly suit: Suit }
  | { readonly kind: 'invalid'; readonly error: GameError };

/** What would happen if the human played `selection` now — drives the tray and Play button. */
export function selectionState(view: PlayerView, selection: readonly CardPlay[]): SelectionState {
  if (selection.length === 0) return { kind: 'empty' };
  const ctx = contextFromView(view);
  const error = checkPlays(ctx, selection);
  if (error) {
    if (error.code === 'QUEEN_MUST_BE_COVERED') {
      const last = view.hand.find((c) => c.id === selection[selection.length - 1]!.cardId);
      if (last?.rank === 'Q') return { kind: 'needsCover', suit: last.suit };
    }
    return { kind: 'invalid', error };
  }
  const outcome = resolvePlays(ctx, selection, { two: view.rules.twoPenalty, blackJack: view.rules.blackJackPenalty });
  return { kind: 'ready', queenPenalty: outcome.queenPenalty, leavesOne: !outcome.queenPenalty && outcome.cardsLeft === 1, outcome };
}

/** Explains why `card` cannot be added to `selection` right now (for the shake + hint). */
export function explainUnselectable(view: PlayerView, selection: readonly CardPlay[], card: Card): string {
  if (!isHumanTurn(view)) return view.phase === 'finished' ? 'The game is over' : 'Wait for your turn';
  const ctx = contextFromView(view);
  const trial: CardPlay[] = [...selection, card.rank === 'A' ? { cardId: card.id, chosenSuit: card.suit } : { cardId: card.id }];
  const err = checkPlays(ctx, trial);
  if (err && err.code !== 'QUEEN_MUST_BE_COVERED' && err.code !== 'CANNOT_FINISH_ON_POWER_CARD') return err.message;
  if (selection.length === 0 && view.hand.length === 1) return 'You can’t finish on a 2, 8, Jack, Queen, King or Ace — draw instead';
  return err?.message ?? 'That card can’t be played now';
}

/**
 * Tapping a card in the hand: tapping the last selected card removes it, tapping an
 * earlier selected card cuts the sequence back to before it, tapping a selectable
 * card appends it. Aces need a suit first, so they return 'chooseSuit'.
 */
export type TapResult =
  | { readonly kind: 'selection'; readonly selection: CardPlay[] }
  | { readonly kind: 'chooseSuit'; readonly card: Card }
  | { readonly kind: 'rejected'; readonly reason: string };

export function tapCard(view: PlayerView, selection: readonly CardPlay[], card: Card): TapResult {
  const at = selection.findIndex((p) => p.cardId === card.id);
  if (at >= 0) return { kind: 'selection', selection: selection.slice(0, at) };
  if (!selectableCardIds(view, selection).has(card.id)) return { kind: 'rejected', reason: explainUnselectable(view, selection, card) };
  if (card.rank === 'A') return { kind: 'chooseSuit', card };
  return { kind: 'selection', selection: [...selection, { cardId: card.id }] };
}

export function addAce(selection: readonly CardPlay[], card: Card, suit: Suit): CardPlay[] {
  return [...selection, { cardId: card.id, chosenSuit: suit }];
}

/**
 * Builds the PLAY_CARDS move for the current selection. Last Card is declared only if
 * the human armed the button — forgetting is part of the game.
 */
export function buildPlay(view: PlayerView, selection: readonly CardPlay[], lastCardArmed: boolean): PlayMove | null {
  const state = selectionState(view, selection);
  if (state.kind !== 'ready') return null;
  return state.leavesOne && lastCardArmed
    ? { type: 'PLAY_CARDS', plays: [...selection], declareLastCard: true }
    : { type: 'PLAY_CARDS', plays: [...selection] };
}

/** Whether the "Last Card" button should be offered to arm before playing `selection`. */
export function canArmLastCard(view: PlayerView, selection: readonly CardPlay[]): boolean {
  const s = selectionState(view, selection);
  return isHumanTurn(view) && s.kind === 'ready' && s.leavesOne;
}

export interface Standing {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly cardsLeft: number;
  readonly place: number;
}

/** Final standings: winner first, then fewest cards. Ties share a place. */
export function standings(view: PlayerView): Standing[] {
  const sorted = [...view.players].sort((a, b) => {
    if (a.id === view.winnerId) return -1;
    if (b.id === view.winnerId) return 1;
    return a.cardCount - b.cardCount || a.seat - b.seat;
  });
  let place = 0;
  let prev = -1;
  return sorted.map((p, i) => {
    const key = p.id === view.winnerId ? -1 : p.cardCount;
    if (i === 0 || key !== prev) place = i + 1;
    prev = key;
    return { playerId: p.id, name: p.name, cardsLeft: p.cardCount, place };
  });
}
