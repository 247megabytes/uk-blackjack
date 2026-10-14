/**
 * uk-classic-v1.2 play rules: multi-card sequences, Queen covering and wild Aces.
 *
 * Everything here is pure and works on a small PlayContext, so the engine (from
 * GameState), bots and the mobile UI (from a redacted PlayerView) share exactly
 * the same rules without ever touching hidden information.
 *
 * Rules (see docs/RULES.md for the full text):
 *  - First card: matches the top card by (active) suit or rank, or is an Ace (wild).
 *  - Each next card in the same turn: same rank, or ±1 in the same suit (A=1 … 10;
 *    runs may go up or down), or an Ace (wild).
 *  - An Ace must be the LAST card of a sequence (the player calls a suit; the turn ends).
 *  - After a Queen: a card of the Queen's suit (incl. that suit's Ace) — the cover.
 *    The sequence may continue from the cover.
 *  - A turn may end on an uncovered Queen only if no card left in hand can legally
 *    cover it; the player then picks up exactly one card and the turn ends.
 *  - Under a pending attack: only 2s against a 2 attack, only Jacks against a black
 *    Jack attack. A red Jack cancels ANY pending attack (2s or black Jacks) and must be
 *    the last card.
 *  - Power cards (2, 8, J, K) only take effect when they are in the final block of
 *    power cards at the end of the sequence. A power card followed later by a normal
 *    card (or an Ace) has no effect. Stacked power cards at the end all count.
 *  - No finishing on 2, 8, J, K, Q or A.
 *  - A sequence that empties the hand is refused unless Last Card is declared (with
 *    the play, or earlier while holding one card).
 */

import { isBlackJack, isRedJack, SUITS, type Card, type CardId, type Rank, type Suit } from './cards';
import { gameError, type GameError } from './errors';
import type { CardPlay, PendingAttack } from './types';

export interface PlayContext {
  readonly hand: readonly Card[];
  readonly top: Card | null;
  /** Suit chosen with a wild Ace on top; null means the top card's printed suit applies. */
  readonly activeSuit: Suit | null;
  readonly pendingAttack: PendingAttack | null;
  /** Always null since v1.2 (a drawn card can never be played the same turn). Kept for compatibility. */
  readonly drawnCardId: CardId | null;
  /** True if the player has already declared Last Card (while holding one card). */
  readonly declaredLastCard?: boolean;
}

/** Cards a player may never finish on. */
export function isFinishingRestricted(card: Card): boolean {
  return card.rank === '2' || card.rank === '8' || card.rank === 'J' || card.rank === 'K' || card.rank === 'Q' || card.rank === 'A';
}

/** Power cards whose effect depends on being in the final block (rule 4). */
export function isPowerCard(card: Card): boolean {
  return card.rank === '2' || card.rank === '8' || card.rank === 'J' || card.rank === 'K';
}

const RUN_VALUE: Partial<Record<Rank, number>> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10 };

/** True when `next` continues a run from `prev`: same suit, value ±1 (A=1 … 10). */
export function isRunStep(prev: Card, next: Card): boolean {
  const a = RUN_VALUE[prev.rank];
  const b = RUN_VALUE[next.rank];
  return a !== undefined && b !== undefined && prev.suit === next.suit && Math.abs(b - a) === 1;
}

export function effectiveTopSuit(ctx: Pick<PlayContext, 'top' | 'activeSuit'>): Suit | null {
  return ctx.activeSuit ?? ctx.top?.suit ?? null;
}

/** Can `card` start a turn's sequence? */
export function isLegalFirstCard(ctx: PlayContext, card: Card): boolean {
  const attack = ctx.pendingAttack;
  if (attack) return attack.kind === 'two' ? card.rank === '2' || isRedJack(card) : card.rank === 'J';
  if (card.rank === 'A') return true;
  if (!ctx.top) return true;
  return card.suit === effectiveTopSuit(ctx) || card.rank === ctx.top.rank;
}

/** Can `next` follow `prev` inside one turn? */
export function isLegalStep(ctx: PlayContext, prev: Card, _prevChosenSuit: Suit | undefined, next: Card): boolean {
  if (prev.rank === 'A') return false; // an Ace always ends the sequence
  if (ctx.pendingAttack) {
    if (isRedJack(prev)) return false; // a red Jack cancels and ends the sequence
    // stack the same kind, or finish with a red Jack (which cancels the whole attack)
    return ctx.pendingAttack.kind === 'two' ? next.rank === '2' || isRedJack(next) : next.rank === 'J';
  }
  if (prev.rank === 'Q') return next.suit === prev.suit; // the cover (incl. that suit's Ace)
  if (next.rank === 'A') return true;
  return next.rank === prev.rank || isRunStep(prev, next);
}

function cardById(hand: readonly Card[], id: CardId): Card | undefined {
  return hand.find((c) => c.id === id);
}

/**
 * Cards from the hand that may legally be added after `prefix` (transition legality
 * only; whether the turn may *end* there is checkPlays' job). Empty prefix → first cards.
 */
export function nextCardOptions(ctx: PlayContext, prefix: readonly CardPlay[]): Card[] {
  const used = new Set(prefix.map((p) => p.cardId));
  const remaining = ctx.hand.filter((c) => !used.has(c.id));
  if (prefix.length === 0) return remaining.filter((c) => isLegalFirstCard(ctx, c));
  const last = prefix[prefix.length - 1]!;
  const prev = cardById(ctx.hand, last.cardId);
  if (!prev) return [];
  return remaining.filter((c) => isLegalStep(ctx, prev, last.chosenSuit, c));
}

/** True if some card left after `plays` could legally cover the Queen at the end. */
export function queenCoverAvailable(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  const last = plays[plays.length - 1];
  const queen = last ? cardById(ctx.hand, last.cardId) : undefined;
  if (!queen || queen.rank !== 'Q') return false;
  const used = new Set(plays.map((p) => p.cardId));
  const remaining = ctx.hand.filter((c) => !used.has(c.id));
  // A cover that would be the final card must itself be a legal finishing card.
  return remaining.some((c) => c.suit === queen.suit && !(remaining.length === 1 && isFinishingRestricted(c)));
}

/** True if `plays` would empty the hand. */
export function isGoingOut(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  return plays.length > 0 && plays.length === ctx.hand.length;
}

/**
 * Full validation of a turn's ordered plays. Returns null when legal.
 * `declareLastCard` is the flag sent with the play (needed to go out, rule 6).
 */
export function checkPlays(ctx: PlayContext, plays: readonly CardPlay[], declareLastCard = false): GameError | null {
  if (plays.length === 0) return gameError('EMPTY_PLAY', 'Choose at least one card to play');
  const seen = new Set<CardId>();
  const cards: Card[] = [];
  for (const p of plays) {
    if (seen.has(p.cardId)) return gameError('DUPLICATE_CARD', `${p.cardId} appears twice in the sequence`);
    seen.add(p.cardId);
    const card = cardById(ctx.hand, p.cardId);
    if (!card) return gameError('CARD_NOT_IN_HAND', `You do not hold ${p.cardId}`);
    if (card.rank === 'A') {
      if (p.chosenSuit === undefined) return gameError('SUIT_CHOICE_REQUIRED', 'Choose a suit for your Ace');
      if (!SUITS.includes(p.chosenSuit)) return gameError('INVALID_SUIT_CHOICE', `"${String(p.chosenSuit)}" is not a suit`);
    } else if (p.chosenSuit !== undefined) {
      return gameError('INVALID_SUIT_CHOICE', 'Only an Ace lets you choose a suit');
    }
    cards.push(card);
  }

  const first = cards[0]!;
  if (!isLegalFirstCard(ctx, first)) {
    if (ctx.pendingAttack) {
      return gameError(
        'MUST_ANSWER_ATTACK',
        ctx.pendingAttack.kind === 'two' ? 'A 2 attack can only be answered with a 2 or a red Jack' : 'A black Jack attack can only be answered with a Jack',
      );
    }
    return gameError('CARD_DOES_NOT_MATCH', 'Your first card must match the suit or rank of the top card');
  }

  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const next = cards[i]!;
    if (!isLegalStep(ctx, prev, plays[i - 1]!.chosenSuit, next)) {
      if (prev.rank === 'A') return gameError('ACE_MUST_BE_LAST', 'An Ace ends your turn — it must be the last card you play');
      if (ctx.pendingAttack) return gameError('MUST_ANSWER_ATTACK', 'While under attack you may only stack cards of the same kind, or finish with a red Jack');
      if (prev.rank === 'Q') return gameError('QUEEN_MUST_BE_COVERED', `A Queen must be covered by a ${prev.suit === 'H' ? 'heart' : prev.suit === 'D' ? 'diamond' : prev.suit === 'S' ? 'spade' : 'club'}`);
      return gameError('INVALID_SEQUENCE', `${next.id} cannot follow ${prev.id}: play the same rank, the next number up or down in the same suit, or an Ace`);
    }
  }

  const last = cards[cards.length - 1]!;
  if (cards.length === ctx.hand.length) {
    if (isFinishingRestricted(last)) return gameError('CANNOT_FINISH_ON_POWER_CARD', 'You cannot finish on a 2, 8, Jack, Queen, King or Ace');
    if (!declareLastCard && !ctx.declaredLastCard) return gameError('LAST_CARD_NOT_DECLARED', 'Say Last Card before playing out your hand');
  } else if (last.rank === 'Q' && queenCoverAvailable(ctx, plays)) {
    return gameError('QUEEN_MUST_BE_COVERED', 'You hold a card that can cover your Queen — you must cover it');
  }
  return null;
}

/**
 * The smallest complete legal play starting with `first` (for getLegalMoves and as a
 * bot fallback): the card alone, or a Queen plus its first legal cover. Aces get
 * `suit` as their choice. Last Card is assumed declared (a player can always declare).
 */
export function minimalPlayFrom(ctx: PlayContext, first: Card, suit?: Suit): CardPlay[] | null {
  const head: CardPlay = first.rank === 'A' ? { cardId: first.id, chosenSuit: suit ?? first.suit } : { cardId: first.id };
  if (!checkPlays(ctx, [head], true)) return [head];
  if (first.rank === 'Q') {
    for (const cover of nextCardOptions(ctx, [head])) {
      const plays: CardPlay[] = [head, cover.rank === 'A' ? { cardId: cover.id, chosenSuit: cover.suit } : { cardId: cover.id }];
      if (!checkPlays(ctx, plays, true)) return plays;
    }
  }
  return null;
}

/** True if the player has at least one complete legal play. */
export function hasLegalPlay(ctx: PlayContext): boolean {
  return nextCardOptions(ctx, []).some((c) => minimalPlayFrom(ctx, c) !== null);
}

/** One effect produced while resolving a sequence, in card order. */
export type PlayEffect =
  | { readonly kind: 'attackStarted'; readonly attack: PendingAttack; readonly cardId: CardId }
  | { readonly kind: 'attackStacked'; readonly attack: PendingAttack; readonly cardId: CardId }
  | { readonly kind: 'attackCancelled'; readonly cancelledAmount: number; readonly cardId: CardId }
  | { readonly kind: 'powerCovered'; readonly cardIds: readonly CardId[] }
  | { readonly kind: 'reverse'; readonly cardId: CardId }
  | { readonly kind: 'skip'; readonly cardId: CardId }
  | { readonly kind: 'suitChosen'; readonly suit: Suit; readonly cardId: CardId }
  | { readonly kind: 'queenCovered'; readonly queenId: CardId; readonly coverId: CardId };

/** Summary of what a sequence would do, for UI previews and the engine's resolution. */
export interface PlayOutcome {
  /** Pending attack after the turn (null if none or cancelled). */
  readonly attack: PendingAttack | null;
  readonly eights: number;
  readonly kings: number;
  /** The turn ends on a Queen nobody could cover: the player picks up one card. */
  readonly queenPenalty: boolean;
  /** Suit in force after the turn when an Ace ends it. */
  readonly activeSuit: Suit | null;
  readonly cardsLeft: number;
  readonly effects: readonly PlayEffect[];
}

export interface Penalties {
  readonly two: number;
  readonly blackJack: number;
}

/**
 * Resolves a (valid) sequence:
 *  - Only the final block of consecutive power cards (2/8/J/K) takes effect; earlier
 *    power cards covered by a normal card (or an Ace) do nothing.
 *  - Within that block: every 2 / black Jack adds to the attack, a red Jack cancels any
 *    attack, every 8 skips and every King reverses.
 *  - An uncovered Queen at the end costs one card; an Ace at the end sets the suit.
 */
export function resolvePlays(ctx: PlayContext, plays: readonly CardPlay[], penalties: Penalties): PlayOutcome {
  const cards = plays.map((p) => cardById(ctx.hand, p.cardId)!);
  let blockStart = cards.length;
  while (blockStart > 0 && isPowerCard(cards[blockStart - 1]!)) blockStart--;

  const effects: PlayEffect[] = [];
  for (let i = 1; i < cards.length; i++) {
    if (cards[i - 1]!.rank === 'Q') effects.push({ kind: 'queenCovered', queenId: cards[i - 1]!.id, coverId: cards[i]!.id });
  }
  const covered = cards.slice(0, blockStart).filter(isPowerCard).map((c) => c.id);
  if (covered.length) effects.push({ kind: 'powerCovered', cardIds: covered });

  let attack = ctx.pendingAttack;
  let eights = 0;
  let kings = 0;
  for (const card of cards.slice(blockStart)) {
    if (card.rank === '2' || isBlackJack(card)) {
      const kind: PendingAttack['kind'] = card.rank === '2' ? 'two' : 'blackJack';
      const add = kind === 'two' ? penalties.two : penalties.blackJack;
      if (attack && attack.kind === kind) {
        attack = { kind, amount: attack.amount + add };
        effects.push({ kind: 'attackStacked', attack, cardId: card.id });
      } else {
        attack = { kind, amount: add };
        effects.push({ kind: 'attackStarted', attack, cardId: card.id });
      }
    } else if (isRedJack(card)) {
      if (attack) {
        effects.push({ kind: 'attackCancelled', cancelledAmount: attack.amount, cardId: card.id });
        attack = null;
      }
    } else if (card.rank === '8') {
      eights++;
      effects.push({ kind: 'skip', cardId: card.id });
    } else if (card.rank === 'K') {
      kings++;
      effects.push({ kind: 'reverse', cardId: card.id });
    }
  }

  const lastPlay = plays[plays.length - 1]!;
  const last = cards[cards.length - 1]!;
  if (last.rank === 'A') effects.push({ kind: 'suitChosen', suit: lastPlay.chosenSuit ?? last.suit, cardId: last.id });
  const cardsLeft = ctx.hand.length - plays.length;
  return {
    attack,
    eights,
    kings,
    queenPenalty: last.rank === 'Q' && cardsLeft > 0,
    activeSuit: last.rank === 'A' ? (lastPlay.chosenSuit ?? last.suit) : null,
    cardsLeft,
    effects,
  };
}
