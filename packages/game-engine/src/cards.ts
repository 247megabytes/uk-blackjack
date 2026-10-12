/**
 * Card model for a standard 52-card deck (no Jokers).
 */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

/** A card id is rank + suit, e.g. "10H", "JS", "AC". Unique within a deck. */
export type CardId = `${Rank}${Suit}`;

export interface Card {
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES: Readonly<Record<Suit, string>> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}`, rank, suit };
}

/** Creates an ordered, unshuffled 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeCard(rank, suit));
  }
  return deck;
}

/** Parses "10H" / "JS" etc. Throws on invalid input (test/dev helper). */
export function parseCard(id: string): Card {
  const suit = id.slice(-1) as Suit;
  const rank = id.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`Invalid card id: ${id}`);
  return makeCard(rank, suit);
}

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D';
}

export function isBlackJack(card: Card): boolean {
  return card.rank === 'J' && !isRed(card);
}

export function isRedJack(card: Card): boolean {
  return card.rank === 'J' && isRed(card);
}

/** Power cards: 2, 8, J, K. A player may never finish on one of these. */
export function isPowerCard(card: Card): boolean {
  return card.rank === '2' || card.rank === '8' || card.rank === 'J' || card.rank === 'K';
}

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}
