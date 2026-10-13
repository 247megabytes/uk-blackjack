import { describe, expect, it } from 'vitest';
import { applyAction, checkPlays, getPlayerView, startGame, type GameAction, type PlayerView } from '@ukbj/game-engine';
import { contextFromView, createEasyBot, simulateGame, type Bot } from '@ukbj/game-bots';

describe('Easy bot', () => {
  it('only ever submits moves the shared rules accept', () => {
    for (let g = 0; g < 50; g++) {
      let state = startGame({ seed: `legal-${g}`, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] });
      const bot = createEasyBot({ seed: g });
      for (let step = 0; step < 40 && state.phase === 'playing'; step++) {
        const id = state.players[state.currentPlayerIndex]!.id;
        const view = getPlayerView(state, id);
        const move = bot.chooseMove(view);
        expect(move).not.toBeNull();
        if (move!.type === 'PLAY_CARDS') expect(checkPlays(contextFromView(view), move!.plays)).toBeNull();
        else expect(view.legalMoves.some((m) => m.type === move!.type)).toBe(true);
        const res = applyAction(state, { ...move!, playerId: id, actionId: `${g}-${step}` } as GameAction);
        expect(res.ok).toBe(true);
        if (res.ok) state = res.state;
      }
    }
  });

  it('receives only a redacted PlayerView (no access to hidden state)', () => {
    let seen: PlayerView | null = null;
    const spy: Bot = {
      difficulty: 'easy',
      chooseMove(view) {
        seen = view;
        return createEasyBot({ seed: 1 }).chooseMove(view);
      },
    };
    simulateGame({ seed: 'spy', playerCount: 3, makeBot: () => spy, maxActions: 30 });
    expect(seen).not.toBeNull();
    const keys = Object.keys(seen!);
    for (const forbidden of ['drawPile', 'rngState', 'processedActionIds', 'discardPile']) expect(keys).not.toContain(forbidden);
    for (const p of seen!.players) expect(Object.keys(p)).not.toContain('hand');
  });
});

describe('seeded bot-versus-bot simulations', () => {
  it('is deterministic: the same seed produces the same game', () => {
    const a = simulateGame({ seed: 'repeat', playerCount: 4 });
    const b = simulateGame({ seed: 'repeat', playerCount: 4 });
    expect(a.finalState).toEqual(b.finalState);
    expect(a.actions).toBe(b.actions);
  });

  for (const players of [2, 3, 4, 5, 6]) {
    it(`${players} players × 200 games: card conservation, turn ownership, valid transitions`, () => {
      let finished = 0;
      for (let i = 0; i < 200; i++) {
        const r = simulateGame({ seed: `sim-${players}-${i}`, playerCount: players });
        if (r.violations.length) throw new Error(`seed sim-${players}-${i}: ${r.violations.join('; ')}`);
        if (r.finished) finished++;
        if (r.endReason === 'win') expect(r.finalState.players.find((p) => p.id === r.winnerId)!.hand).toHaveLength(0);
      }
      expect(finished).toBe(200);
    });
  }

  it('bots build real multi-card sequences, including runs, Ace changes and Queen covers', () => {
    let longest = 0;
    let multi = 0;
    for (let i = 0; i < 100; i++) {
      for (const e of simulateGame({ seed: `seq-${i}`, playerCount: 4 }).finalState.events) {
        if (e.type === 'SEQUENCE_PLAYED') {
          multi++;
          longest = Math.max(longest, e.cards.length);
        }
      }
    }
    expect(multi).toBeGreaterThan(100);
    expect(longest).toBeGreaterThanOrEqual(4);
  });

  it('exercises v1 and v1.1 rule paths across the run', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      for (const e of simulateGame({ seed: `cov-${i}`, playerCount: 4 }).finalState.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    for (const t of ['ATTACK_STACKED', 'ATTACK_CANCELLED', 'DIRECTION_REVERSED', 'PLAYER_SKIPPED', 'LAST_CARD_WINDOW_OPENED', 'LAST_CARD_CHALLENGED', 'DISCARDS_RECYCLED', 'GAME_WON', 'SEQUENCE_PLAYED', 'QUEEN_COVERED', 'QUEEN_UNCOVERED', 'SUIT_CHOSEN', 'ATTACK_NEUTRALISED']) {
      expect(counts[t] ?? 0).toBeGreaterThan(0);
    }
  });
});
