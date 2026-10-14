import {
  checkPlays,
  minimalPlayFrom,
  nextCardOptions,
  SUITS,
  type Card,
  type CardPlay,
  type PlayContext,
  type PlayerView,
  type Suit,
} from '@ukbj/game-engine';
import type { BotRandom } from './bot';

/** Builds a PlayContext from the bot's own redacted view — no hidden information involved. */
export function contextFromView(view: PlayerView): PlayContext {
  return {
    hand: view.hand,
    top: view.topCard,
    activeSuit: view.activeSuit,
    pendingAttack: view.pendingAttack,
    drawnCardId: null,
    declaredLastCard: view.players.find((p) => p.id === view.viewerId)?.declaredLastCard ?? false,
  };
}

export interface SequenceOptions {
  /** Chance of extending the sequence by another card when the turn could legally end. */
  readonly continueChance: number;
  /** Picks a suit for an Ace (default: random). */
  readonly chooseSuit?: (ctx: PlayContext, prefix: readonly CardPlay[], ace: Card) => Suit;
  /** Safety cap on search steps. */
  readonly maxNodes?: number;
}

/**
 * Randomised depth-first search for a complete, legal sequence starting with `first`.
 * At each card it either stops (only when stopping is legal — e.g. never on a Queen it
 * could cover) or extends with a random legal next card. Falls back to the engine's
 * minimal play, so a legal first card always yields a legal play.
 */
export function randomSequence(ctx: PlayContext, first: Card, rng: BotRandom, opts: SequenceOptions): CardPlay[] {
  const maxNodes = opts.maxNodes ?? 400;
  let nodes = 0;
  const pickSuit = (prefix: readonly CardPlay[], card: Card): Suit =>
    opts.chooseSuit ? opts.chooseSuit(ctx, prefix, card) : (rng.pick(SUITS) ?? card.suit);
  const asPlay = (prefix: readonly CardPlay[], card: Card): CardPlay =>
    card.rank === 'A' ? { cardId: card.id, chosenSuit: pickSuit(prefix, card) } : { cardId: card.id };

  const search = (prefix: CardPlay[]): CardPlay[] | null => {
    if (++nodes > maxNodes) return null;
    const canStop = checkPlays(ctx, prefix, true) === null; // a go-out is submitted with Last Card declared
    const options = shuffle(nextCardOptions(ctx, prefix), rng);
    const extendFirst = options.length > 0 && (!canStop || rng.chance(opts.continueChance));
    if (canStop && !extendFirst) return prefix;
    for (const next of options) {
      const found = search([...prefix, asPlay(prefix, next)]);
      if (found) return found;
    }
    return canStop ? prefix : null;
  };

  // An Ace ends the sequence (nextCardOptions offers nothing after it).
  return search([asPlay([], first)]) ?? minimalPlayFrom(ctx, first, first.rank === 'A' ? pickSuit([], first) : undefined) ?? [];
}

function shuffle<T>(items: readonly T[], rng: BotRandom): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
