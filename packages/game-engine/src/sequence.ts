/**
 * uk-classic-v1.1 play rules: multi-card sequences, Queen covering and wild Aces.
 *
 * Everything here is pure and works on a small PlayContext, so the engine (from
 * GameState), bots and the mobile UI (from a redacted PlayerView) share exactly
 * the same rules without ever touching hidden information.
 *
 * Confirmed rules (see docs/RULES.md for the full text):
 *  - First card: matches the top card by (active) suit or rank, or is an Ace (wild).
 *  - Each next card in the same turn: same rank, or +1 in the same suit (A=1 … 10),
 *    or an Ace (wild).
 *  - After an Ace: any card of the Ace's chosen suit, or another Ace.
 *  - After a Queen: a card of the Queen's suit (incl. that suit's Ace) — the cover.
 *    The sequence may continue from the cover.
 *  - A turn may end on an uncovered Queen only if no card left in hand can legally
 *    cover it; the player then picks up exactly one card and the turn ends.
 *  - Under a pending attack: only cards of the same kind (2s / black Jacks); a red
 *    Jack cancels a black Jack attack and must be the last card.
 *  - After drawing: only the drawn card may be played (plus its cover if it is a Queen).
 *  - No finishing on 2, 8, J, K, Q or A.
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
  readonly drawnCardId: CardId | null;
}

/** Cards a player may never finish on. */
export function isFinishingRestricted(card: Card): boolean {
  return card.rank === '2' || card.rank === '8' || card.rank === 'J' || card.rank === 'K' || card.rank === 'Q' || card.rank === 'A';
}

const RUN_VALUE: Partial<Record<Rank, number>> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10 };

/** True when `next` continues an ascending run from `prev`: same suit, value +1 (A=1 … 10). */
export function isRunStep(prev: Card, next: Card): boolean {
  const a = RUN_VALUE[prev.rank];
  const b = RUN_VALUE[next.rank];
  return a !== undefined && b !== undefined && prev.suit === next.suit && b === a + 1;
}

export function effectiveTopSuit(ctx: Pick<PlayContext, 'top' | 'activeSuit'>): Suit | null {
  return ctx.activeSuit ?? ctx.top?.suit ?? null;
}

/** Can `card` start a turn's sequence (ignoring the drawn-card restriction)? */
export function isLegalFirstCard(ctx: PlayContext, card: Card): boolean {
  const attack = ctx.pendingAttack;
  if (attack) return attack.kind === 'two' ? card.rank === '2' : card.rank === 'J';
  if (card.rank === 'A') return true;
  if (!ctx.top) return true;
  return card.suit === effectiveTopSuit(ctx) || card.rank === ctx.top.rank;
}

/** Can `next` follow `prev` (with prev's chosen suit, if an Ace) inside one turn? */
export function isLegalStep(ctx: PlayContext, prev: Card, prevChosenSuit: Suit | undefined, next: Card): boolean {
  if (ctx.pendingAttack) {
    // Defending: only same-kind stacking; nothing may follow a red Jack.
    if (isRedJack(prev)) return false;
    return ctx.pendingAttack.kind === 'two' ? next.rank === '2' : next.rank === 'J';
  }
  if (prev.rank === 'Q') return next.suit === prev.suit; // the cover (incl. that suit's Ace)
  if (prev.rank === 'A') return next.rank === 'A' || next.suit === (prevChosenSuit ?? prev.suit);
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
  if (prefix.length === 0) {
    if (ctx.drawnCardId) return remaining.filter((c) => c.id === ctx.drawnCardId && isLegalFirstCard(ctx, c));
    return remaining.filter((c) => isLegalFirstCard(ctx, c));
  }
  const last = prefix[prefix.length - 1]!;
  const prev = cardById(ctx.hand, last.cardId);
  if (!prev) return [];
  if (ctx.drawnCardId) {
    // After drawing, only a drawn Queen may be followed — by its cover, and nothing more.
    if (prefix.length !== 1 || prev.rank !== 'Q') return [];
  }
  return remaining.filter((c) => isLegalStep(ctx, prev, last.chosenSuit, c));
}

/** True if some card left after `plays` could legally cover the Queen at the end. */
export function queenCoverAvailable(ctx: PlayContext, plays: readonly CardPlay[]): boolean {
  const last = plays[plays.length - 1];
  const queen = last ? cardById(ctx.hand, last.cardId) : undefined;
  if (!queen || queen.rank !== 'Q') return false;
  if (ctx.drawnCardId && plays.length !== 1) return false;
  const used = new Set(plays.map((p) => p.cardId));
  const remaining = ctx.hand.filter((c) => !used.has(c.id));
  // A cover that would be the final card must itself be a legal finishing card.
  return remaining.some((c) => c.suit === queen.suit && !(remaining.length === 1 && isFinishingRestricted(c)));
}

/**
 * Full validation of a turn's ordered plays. Returns null when legal.
 * Order of checks gives the most helpful error for the UI.
 */
export function checkPlays(ctx: PlayContext, plays: readonly CardPlay[]): GameError | null {
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
  if (ctx.drawnCardId && first.id !== ctx.drawnCardId) {
    return gameError('ONLY_DRAWN_CARD_PLAYABLE', 'After drawing, only the newly drawn card may be played');
  }
  if (!isLegalFirstCard(ctx, first)) {
    if (ctx.pendingAttack) {
      return gameError('MUST_ANSWER_ATTACK', ctx.pendingAttack.kind === 'two' ? 'A 2 attack can only be answered with a 2' : 'A black Jack attack can only be answered with a Jack');
    }
    return gameError('CARD_DOES_NOT_MATCH', 'Your first card must match the suit or rank of the top card');
  }

  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const next = cards[i]!;
    if (ctx.drawnCardId && !(i === 1 && prev.rank === 'Q' && cards.length === 2)) {
      return gameError('ONLY_DRAWN_CARD_PLAYABLE', 'After drawing, only the drawn card (and a Queen’s cover) may be played');
    }
    if (!isLegalStep(ctx, prev, plays[i - 1]!.chosenSuit, next)) {
      if (ctx.pendingAttack) return gameError('MUST_ANSWER_ATTACK', 'While under attack you may only stack cards of the same kind');
      if (prev.rank === 'Q') return gameError('QUEEN_MUST_BE_COVERED', `A Queen must be covered by a ${prev.suit === 'H' ? 'heart' : prev.suit === 'D' ? 'diamond' : prev.suit === 'S' ? 'spade' : 'club'}`);
      return gameError('INVALID_SEQUENCE', `${next.id} cannot follow ${prev.id}: play the same rank, the next number up in the same suit, or an Ace`);
    }
  }

  const last = cards[cards.length - 1]!;
  if (cards.length === ctx.hand.length) {
    if (isFinishingRestricted(last)) return gameError('CANNOT_FINISH_ON_POWER_CARD', 'You cannot finish on a 2, 8, Jack, Queen, King or Ace');
  } else if (last.rank === 'Q' && queenCoverAvailable(ctx, plays)) {
    return gameError('QUEEN_MUST_BE_COVERED', 'You hold a card that can cover your Queen — you must cover it');
  }
  return null;
}

/**
 * The smallest complete legal play starting with `first` (for getLegalMoves and as a
 * bot fallback): the card alone, or a Queen plus its first legal cover.
 * Aces get `suit` as their choice. Returns null if no legal play starts with `first`.
 */
export function minimalPlayFrom(ctx: PlayContext, first: Card, suit?: Suit): CardPlay[] | null {
  const head: CardPlay = first.rank === 'A' ? { cardId: first.id, chosenSuit: suit ?? first.suit } : { cardId: first.id };
  if (!checkPlays(ctx, [head])) return [head];
  if (first.rank === 'Q') {
    for (const cover of nextCardOptions(ctx, [head])) {
      const plays: CardPlay[] = [head, cover.rank === 'A' ? { cardId: cover.id, chosenSuit: cover.suit } : { cardId: cover.id }];
      if (!checkPlays(ctx, plays)) return plays;
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
  | { readonly kind: 'attackNeutralised'; readonly neutralised: PendingAttack; readonly cardId: CardId }
  | { readonly kind: 'reverse'; readonly cardId: CardId }
  | { readonly kind: 'skip'; readonly cardId: CardId }
  | { readonly kind: 'suitChosen'; readonly suit: Suit; readonly cardId: CardId }
  | { readonly kind: 'queenCovered'; readonly queenId: CardId; readonly coverId: CardId };

/** Summary of what a sequence would do, for UI previews and the engine's resolution. */
export interface PlayOutcome {
  /** Pending attack after the turn (null if none or neutralised/cancelled). */
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
 * Resolves the combined effect of a (valid) sequence:
 *  - every 2 / black Jack adds to the attack; a red Jack cancels a black Jack attack;
 *  - any other card covering an attack played earlier in the same turn neutralises it
 *    (confirmed for 2s; applied consistently to black Jacks covered by an Ace);
 *  - every 8 and King counts ("every power card applies");
 *  - an uncovered Queen at the end costs one card.
 */
export function resolvePlays(ctx: PlayContext, plays: readonly CardPlay[], penalties: Penalties): PlayOutcome {
  let attack = ctx.pendingAttack;
  let eights = 0;
  let kings = 0;
  const effects: PlayEffect[] = [];
  let prev: Card | null = null;
  for (const p of plays) {
    const card = cardById(ctx.hand, p.cardId)!;
    if (prev && prev.rank === 'Q') effects.push({ kind: 'queenCovered', queenId: prev.id, coverId: card.id });
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
    } else {
      if (attack) {
        if (isRedJack(card) && attack.kind === 'blackJack') effects.push({ kind: 'attackCancelled', cancelledAmount: attack.amount, cardId: card.id });
        else effects.push({ kind: 'attackNeutralised', neutralised: attack, cardId: card.id });
        attack = null;
      }
      if (card.rank === '8') {
        eights++;
        effects.push({ kind: 'skip', cardId: card.id });
      }
      if (card.rank === 'K') {
        kings++;
        effects.push({ kind: 'reverse', cardId: card.id });
      }
      if (card.rank === 'A') effects.push({ kind: 'suitChosen', suit: p.chosenSuit ?? card.suit, cardId: card.id });
    }
    prev = card;
  }
  const lastPlay = plays[plays.length - 1]!;
  const last = cardById(ctx.hand, lastPlay.cardId)!;
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
