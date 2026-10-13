import { checkPlays, playMove, type MoveIntent, type PlayerView } from '@ukbj/game-engine';
import { BotRandom, type Bot } from './bot';
import { contextFromView, randomSequence } from './sequence';

export interface EasyBotOptions {
  readonly seed: string | number;
  /** Probability of forgetting to announce Last Card when playing down to one card. */
  readonly forgetLastCardChance?: number;
  /** Probability of challenging an opponent who has not declared Last Card. */
  readonly challengeChance?: number;
  /** Probability of declaring late inside the window after forgetting. */
  readonly lateDeclareChance?: number;
  /** Probability of adding another card to a sequence whenever it could stop. */
  readonly continueChance?: number;
}

/**
 * Easy bot: picks a random legal starting card, then randomly extends it into a legal
 * multi-card sequence (covering Queens when it can, choosing a random suit for Aces).
 * Draws only when it has nothing to play. Deliberately forgetful about Last Card.
 * It sees only its own PlayerView and validates every sequence with the engine's rules.
 */
export function createEasyBot(options: EasyBotOptions): Bot {
  const rng = new BotRandom(options.seed);
  const forget = options.forgetLastCardChance ?? 0.25;
  const challenge = options.challengeChance ?? 0.5;
  const lateDeclare = options.lateDeclareChance ?? 0.5;
  const continueChance = options.continueChance ?? 0.6;

  return {
    difficulty: 'easy',
    chooseMove(view: PlayerView): MoveIntent | null {
      const moves = view.legalMoves;
      if (moves.length === 0) return null;

      if (view.phase === 'lastCardWindow') {
        const declare = moves.find((m) => m.type === 'DECLARE_LAST_CARD');
        if (declare) return rng.chance(lateDeclare) ? declare : null;
        const ch = moves.find((m) => m.type === 'CHALLENGE_LAST_CARD');
        return ch && rng.chance(challenge) ? ch : null;
      }

      if (view.currentPlayerId !== view.viewerId) {
        // Out of turn: the only possible move is a (late) Last Card declaration.
        return moves.find((m) => m.type === 'DECLARE_LAST_CARD') ?? null;
      }

      const starts = moves.filter((m): m is Extract<MoveIntent, { type: 'PLAY_CARDS' }> => m.type === 'PLAY_CARDS');
      if (starts.length > 0) {
        const start = rng.pick(starts)!;
        const ctx = contextFromView(view);
        const first = view.hand.find((c) => c.id === start.plays[0]!.cardId)!;
        let plays = randomSequence(ctx, first, rng, { continueChance });
        if (plays.length === 0 || checkPlays(ctx, plays)) plays = [...start.plays]; // never submit an illegal move
        return playMove(plays, view.hand.length, !rng.chance(forget));
      }
      const draw = moves.find((m) => m.type === 'DRAW');
      if (draw) return draw;
      const pass = moves.find((m) => m.type === 'PASS');
      if (pass) return pass;
      return moves.find((m) => m.type === 'DECLARE_LAST_CARD') ?? null;
    },
  };
}
