/**
 * uk-classic-v1.2 play rules: multi-card sequences, unified pickups, Queen covering and
 * wild Aces.
 *
 * Everything here is pure and works on a small PlayContext, so the engine (from
 * GameState), bots and the mobile UI (from a redacted PlayerView) share exactly
 * the same rules without ever touching hidden information.
 *
 * Rules (see docs/RULES.md for the full text):
 *  - First card: matches the top card by (active) suit or rank, or is an Ace (wild, and
 *    then it is the whole turn).
 *  - Each next card: same rank, or ±1 in the same suit (A=1 … 10; runs go up or down).
 *  - An Ace may only follow a card as the end of a descending same-suit run (2♥ → A♥) or
 *    as the cover of a Queen of its suit (Q♥ → A♥). Nothing may follow an Ace.
 *  - After a black Jack: only another black Jack, any 2 or any red Jack.
 *  - After a 2: also any black Jack or red Jack (pickup cards work together).
 *  - After a Queen: a card of the Queen's suit (the cover). If no cover is held the turn
 *    may end on the Queen; the player then picks up one card.
 *  - Unified pickups: 2s (+2) and black Jacks (+5) add to one pending pickup. An incoming
 *    pickup can only be answered with 2s and Jacks; a red Jack cancels it entirely, after
 *    which normal sequence rules apply again.
 *  - Power cards (2, 8, J, K) only take effect in the final block of power cards at the
 *    end of the sequence; a power card followed later by a normal card has no effect.
 *  - Ending your hand on a 2, 8, J, Q, K or A is allowed but does not win: the card takes
 *    effect and the player picks up one card.
 *  - A sequence that empties the hand on a winning card is refused unless Last Card is
 *    declared (with the play, or earlier while holding one card).
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

/** Pickup cards: any 2 or any Jack (black Jacks add, red Jacks cancel). */
export function isPickupCard(card: Card): boolean {
  return card.rank === '2' || card.rank === 'J';
}

/** Can `card` start a turn's sequence? */
export function isLegalFirstCard(ctx: PlayContext, card: Card): boolean {
  if (ctx.pendingAttack) return isPickupCard(card); // no other card can interrupt a pickup
  if (card.rank === 'A') return true;
  if (!ctx.top) return true;
  return card.suit === effectiveTopSuit(ctx) || card.rank === ctx.top.rank;
}

/**
 * True while the pickup that was pending when the turn started is still live after
 * `played` (the cards of this turn so far): until a red Jack cancels it.
 */
export function incomingAttackLive(ctx: PlayContext, played: readonly Card[]): boolean {
  if (!ctx.pendingAttack) return false;
  return !played.some((c) => isRedJack(c));
}

/**
 * Can `next` follow `prev` inside one turn? `live` says whether an incoming pickup is
 * still live at this point (see incomingAttackLive); it defaults to "a pickup was
 * pending and nothing has cancelled it", which is right unless a red Jack was played.
 */
export function isLegalStep(ctx: PlayContext, prev: Card, _prevChosenSuit: Suit | undefined, next: Card, live = ctx.pendingAttack !== null && !isRedJack(prev)): boolean {
  if (prev.rank === 'A') return false; // an Ace always ends the sequence
  if (live) return isPickupCard(next); // answering a pickup: 2s and Jacks only
  if (isBlackJack(prev)) return isPickupCard(next); // black Jack → black Jack, any 2, any red Jack
  if (prev.rank === 'Q') return next.suit === prev.suit; // the cover (incl. that suit's Ace)
  if (next.rank === 'A') return isRunStep(prev, next); // only as the end of a descending run: 2♥ → A♥
  if (prev.rank === '2' && next.rank === 'J') return true; // pickups work together: 2 → any Jack
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
  const played = prefix.map((p) => cardById(ctx.hand, p.cardId)).filter((c): c is Card => c !== undefined);
  const live = incomingAttackLive(ctx, played);
  return remaining.filter((c) => isLegalStep(ctx, prev, last.chosenSuit, c, live));
}

/** True if some card left after `plays` could legally cover the Queen at the end. */
export function queenCoverAvailable(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  const last = plays[plays.length - 1];
  const queen = last ? cardById(ctx.hand, last.cardId) : undefined;
  if (!queen || queen.rank !== 'Q') return false;
  const used = new Set(plays.map((p) => p.cardId));
  const remaining = ctx.hand.filter((c) => !used.has(c.id));
  // Since v1.2 any same-suit card covers, even one that can't win as the final card
  // (finishing on it is allowed; the player just picks up one card).
  return remaining.some((c) => c.suit === queen.suit);
}

/** True if `plays` empties the hand on a card that can't win (the player then picks up one). */
export function isBlockedFinish(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  const last = plays[plays.length - 1];
  const card = last ? cardById(ctx.hand, last.cardId) : undefined;
  return !!card && plays.length === ctx.hand.length && isFinishingRestricted(card);
}

/** True if `plays` empties the hand on a card that wins. */
export function isWinningPlay(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  return isGoingOut(ctx, plays) && !isBlockedFinish(ctx, plays);
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
      return gameError('MUST_ANSWER_ATTACK', `Answer the pick-up of ${ctx.pendingAttack.amount} with a 2, a black Jack or a red Jack — or pick up`);
    }
    return gameError('CARD_DOES_NOT_MATCH', 'Your first card must match the suit or rank of the top card');
  }

  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const next = cards[i]!;
    const live = incomingAttackLive(ctx, cards.slice(0, i));
    if (!isLegalStep(ctx, prev, plays[i - 1]!.chosenSuit, next, live)) {
      if (prev.rank === 'A') return gameError('ACE_MUST_BE_LAST', 'An Ace ends your turn — it must be the last card you play');
      if (live) return gameError('MUST_ANSWER_ATTACK', 'While a pick-up is live you can only add 2s and Jacks');
      if (isBlackJack(prev)) return gameError('BLACK_JACK_FOLLOW', 'After a black Jack you can only play another black Jack, a 2 or a red Jack');
      if (prev.rank === 'Q') return gameError('QUEEN_MUST_BE_COVERED', `A Queen must be covered by a ${prev.suit === 'H' ? 'heart' : prev.suit === 'D' ? 'diamond' : prev.suit === 'S' ? 'spade' : 'club'}`);
      if (next.rank === 'A') return gameError('INVALID_SEQUENCE', 'An Ace can only end a run going down in the same suit (2♥ → A♥) — or be played on its own');
      return gameError('INVALID_SEQUENCE', `${next.id} cannot follow ${prev.id}: play the same rank, or the next number up or down in the same suit`);
    }
  }

  const last = cards[cards.length - 1]!;
  if (cards.length === ctx.hand.length) {
    // Ending on a 2/8/J/Q/K/A is allowed but doesn't win (the player picks up one card), so
    // only a winning go-out needs Last Card.
    if (!isFinishingRestricted(last) && !declareLastCard && !ctx.declaredLastCard) {
      return gameError('LAST_CARD_NOT_DECLARED', 'Say Last Card before playing out your hand');
    }
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
  /** The turn ends on a Queen nobody could cover (with cards left): the player picks up one card. */
  readonly queenPenalty: boolean;
  /** The hand is emptied on a card that can't win: the player picks up one card instead of winning. */
  readonly blockedFinish: boolean;
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
 *  - Cards answering an incoming pickup always count, up to and including a cancelling
 *    red Jack. After that, only the final block of consecutive power cards (2/8/J/K)
 *    takes effect; earlier power cards covered by a normal card (or an Ace) do nothing.
 *  - Within that block, in order: every 2 (+2) and black Jack (+5) adds to one pending
 *    pickup, a red Jack cancels whatever is pending, every 8 skips and every King reverses.
 *  - An uncovered Queen at the end costs one card; an Ace at the end sets the suit.
 */
export function resolvePlays(ctx: PlayContext, plays: readonly CardPlay[], penalties: Penalties): PlayOutcome {
  const cards = plays.map((p) => cardById(ctx.hand, p.cardId)!);

  // Answering an incoming pickup always counts (stacking across turns is preserved): the
  // responses up to and including a cancelling red Jack resolve first, whatever follows.
  // Only the cards after that are subject to the final-block rule.
  const cancelAt = ctx.pendingAttack ? cards.findIndex((c) => isRedJack(c)) : -1;
  const responses = cancelAt >= 0 ? cards.slice(0, cancelAt + 1) : [];
  const tail = cancelAt >= 0 ? cards.slice(cancelAt + 1) : cards;
  let blockStart = tail.length;
  while (blockStart > 0 && isPowerCard(tail[blockStart - 1]!)) blockStart--;

  const effects: PlayEffect[] = [];
  for (let i = 1; i < cards.length; i++) {
    if (cards[i - 1]!.rank === 'Q') effects.push({ kind: 'queenCovered', queenId: cards[i - 1]!.id, coverId: cards[i]!.id });
  }
  const covered = tail.slice(0, blockStart).filter(isPowerCard).map((c) => c.id);
  if (covered.length) effects.push({ kind: 'powerCovered', cardIds: covered });

  let attack = ctx.pendingAttack;
  let eights = 0;
  let kings = 0;
  for (const card of [...responses, ...tail.slice(blockStart)]) {
    if (card.rank === '2' || isBlackJack(card)) {
      // Unified pickups: 2s and black Jacks add to the same total; `kind` follows the last card.
      const kind: PendingAttack['kind'] = card.rank === '2' ? 'two' : 'blackJack';
      const add = kind === 'two' ? penalties.two : penalties.blackJack;
      if (attack) {
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
    blockedFinish: cardsLeft === 0 && isFinishingRestricted(last),
    activeSuit: last.rank === 'A' ? (lastPlay.chosenSuit ?? last.suit) : null,
    cardsLeft,
    effects,
  };
}
