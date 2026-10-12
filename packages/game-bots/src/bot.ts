import { nextRandom, seedToState, type MoveIntent, type PlayerView } from '@ukbj/game-engine';

/**
 * A bot only ever sees a redacted PlayerView (its own hand + public info) and
 * returns one of view.legalMoves, or null to do nothing (e.g. decline to challenge).
 * It never receives GameState, opponents' hands or deck order.
 */
export interface Bot {
  readonly difficulty: BotDifficulty;
  chooseMove(view: PlayerView): MoveIntent | null;
}

export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Small seeded RNG owned by the bot (independent from the game's RNG). */
export class BotRandom {
  private state: number;
  constructor(seed: string | number) {
    this.state = seedToState(seed);
  }
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
