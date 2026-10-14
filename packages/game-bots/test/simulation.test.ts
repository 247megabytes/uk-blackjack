import { describe, expect, it } from 'vitest';
import { applyAction, checkPlays, getPlayerView, startGame, type GameAction, type PlayerView } from '@ukbj/game-engine';
import { contextFromView, createEasyBot, simulateGame, simulateTournament, type Bot } from '@ukbj/game-bots';

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
        if (move!.type === 'PLAY_CARDS') expect(checkPlays(contextFromView(view), move!.plays, move!.declareLastCard === true)).toBeNull();
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

  it('exercises v1, v1.1 and v1.2 rule paths across the run', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      for (const e of simulateGame({ seed: `cov-${i}`, playerCount: 4 }).finalState.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    for (const t of ['ATTACK_STACKED', 'ATTACK_CANCELLED', 'DIRECTION_REVERSED', 'PLAYER_SKIPPED', 'LAST_CARD_WINDOW_OPENED', 'LAST_CARD_CHALLENGED', 'DISCARDS_RECYCLED', 'GAME_WON', 'SEQUENCE_PLAYED', 'QUEEN_COVERED', 'QUEEN_UNCOVERED', 'SUIT_CHOSEN', 'POWER_COVERED']) {
      expect(counts[t] ?? 0).toBeGreaterThan(0);
    }
    expect(counts.TURN_PASSED ?? 0).toBe(0); // PASS is retired
  });

  it('bots always declare when going out, and a red Jack cancels 2 attacks in play', () => {
    let goOuts = 0;
    let redJackOnTwos = 0;
    for (let i = 0; i < 100; i++) {
      const events = simulateGame({ seed: `v12-${i}`, playerCount: 4 }).finalState.events;
      events.forEach((e, k) => {
        if (e.type === 'GAME_WON') {
          goOuts++;
          const declared = events.slice(0, k).reverse().find((x) => x.type === 'LAST_CARD_DECLARED' || x.type === 'TURN_STARTED');
          expect(declared?.type === 'LAST_CARD_DECLARED' || events.slice(0, k).some((x) => x.type === 'LAST_CARD_DECLARED' && x.playerId === e.playerId)).toBe(true);
        }
        if (e.type === 'ATTACK_CANCELLED') {
          const before = events.slice(0, k).reverse().find((x) => x.type === 'ATTACK_STARTED' || x.type === 'ATTACK_STACKED');
          if (before && (before.type === 'ATTACK_STARTED' || before.type === 'ATTACK_STACKED') && before.kind === 'two') redJackOnTwos++;
        }
      });
    }
    expect(goOuts).toBe(100);
    expect(redJackOnTwos).toBeGreaterThan(0);
  });

  it('classic games with random disconnects (forfeits) stay consistent', () => {
    let forfeitWins = 0;
    for (let i = 0; i < 200; i++) {
      const r = simulateGame({ seed: `ff-${i}`, playerCount: 2 + (i % 5), forfeitChance: 0.01 });
      if (r.violations.length) throw new Error(`seed ff-${i}: ${r.violations.join('; ')}`);
      expect(r.finished).toBe(true);
      if (r.endReason === 'forfeit') forfeitWins++;
    }
    expect(forfeitWins).toBeGreaterThan(0);
  });
});

describe('Knockouts simulations', () => {
  it('is deterministic: the same seed produces the same tournament', () => {
    const a = simulateTournament({ seed: 'ko-repeat', playerCount: 5 });
    const b = simulateTournament({ seed: 'ko-repeat', playerCount: 5 });
    expect(a.finalState).toEqual(b.finalState);
  });

  for (const players of [2, 3, 4, 5, 6]) {
    it(`${players} players × 60 tournaments: every round valid, one champion, entrants − 1 rounds`, () => {
      for (let i = 0; i < 60; i++) {
        const r = simulateTournament({ seed: `kos-${players}-${i}`, playerCount: players });
        if (r.violations.length) throw new Error(`seed kos-${players}-${i}: ${r.violations.join('; ')}`);
        expect(r.complete).toBe(true);
        expect(r.championId).not.toBeNull();
        expect(r.rounds).toBe(players - 1);
        expect(r.finalState.eliminated).toHaveLength(players - 1);
      }
    });
  }

  it('tournaments with random disconnects stay consistent and still crown a champion', () => {
    let forfeits = 0;
    for (let i = 0; i < 150; i++) {
      const r = simulateTournament({ seed: `kof-${i}`, playerCount: 2 + (i % 5), forfeitChance: 0.01 });
      if (r.violations.length) throw new Error(`seed kof-${i}: ${r.violations.join('; ')}`);
      expect(r.complete).toBe(true);
      forfeits += r.forfeits;
    }
    expect(forfeits).toBeGreaterThan(20);
  });
});
