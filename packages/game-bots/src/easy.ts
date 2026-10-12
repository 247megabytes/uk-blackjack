import type { MoveIntent, PlayerView } from '@ukbj/game-engine';
import { BotRandom, type Bot } from './bot';

export interface EasyBotOptions {
  readonly seed: string | number;
  /** Probability of forgetting to announce Last Card when playing down to one card. */
  readonly forgetLastCardChance?: number;
  /** Probability of challenging an opponent who has not declared Last Card. */
  readonly challengeChance?: number;
  /** Probability of declaring late inside the window after forgetting. */
  readonly lateDeclareChance?: number;
}

/**
 * Easy bot: picks uniformly at random among legal card plays; draws only when it
 * has nothing to play. It is deliberately forgetful about Last Card.
 */
export function createEasyBot(options: EasyBotOptions): Bot {
  const rng = new BotRandom(options.seed);
  const forget = options.forgetLastCardChance ?? 0.25;
  const challenge = options.challengeChance ?? 0.5;
  const lateDeclare = options.lateDeclareChance ?? 0.5;

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

      const plays = moves.filter((m): m is Extract<MoveIntent, { type: 'PLAY_CARD' }> => m.type === 'PLAY_CARD');
      if (plays.length > 0) {
        const play = rng.pick(plays)!;
        if (play.declareLastCard && rng.chance(forget)) return { type: 'PLAY_CARD', cardId: play.cardId };
        return play;
      }
      const draw = moves.find((m) => m.type === 'DRAW');
      if (draw) return draw;
      const pass = moves.find((m) => m.type === 'PASS');
      if (pass) return pass;
      return moves.find((m) => m.type === 'DECLARE_LAST_CARD') ?? null;
    },
  };
}
