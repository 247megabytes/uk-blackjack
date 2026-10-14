import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyTournamentAction,
  createTournament,
  findInvariantViolations,
  forfeitPlayer,
  getLegalMoves,
  getPlayerView,
  getTournamentView,
  startGame,
  SYSTEM_PLAYER_ID,
  tournamentStandings,
  type GameState,
  type TournamentState,
} from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, seq } from './helpers';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
const ko = (s: Parameters<typeof scenario>[0]) => scenario({ ...s, mode: 'knockout' });
const forfeit = (s: GameState, target: string) => {
  const r = forfeitPlayer(s, target, `ff-${target}-${s.version}`);
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
};

describe('Knockout round — finishing', () => {
  it('a player who empties their hand finishes (place 1) and the round goes on', () => {
    const s = act(ko({ hands: [['5H'], ['3D', '4D'], ['6S', '7S']], top: '9H', declared: [true, false, false] }), play('p1', '5H'));
    expect(s.phase).toBe('playing');
    expect(s.players[0]!.status).toBe('finished');
    expect(s.finishOrder).toEqual(['p1']);
    expect(s.events.find((e) => e.type === 'PLAYER_FINISHED')).toMatchObject({ playerId: 'p1', place: 1 });
    expect(current(s)).toBe('p2');
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('finished players take no more turns: play skips their seat', () => {
    let s = ko({ hands: [[], ['3H', '4D'], ['6H', '7S'], ['8C', '9C']], top: '9H', statuses: ['finished', 'active', 'active', 'active'], finishOrder: ['p1'], current: 3 });
    s = act(s, draw('p4'));
    expect(current(s)).toBe('p2'); // p1's seat is skipped
    expect(getLegalMoves(s, 'p1')).toEqual([]);
    expect(reject(s, draw('p1'))).toBe('PLAYER_OUT');
  });

  it('8 skips and King reversals count active players only', () => {
    const s = act(ko({ hands: [['8H', '5C'], [], ['6S', '7S'], ['6D', '7D']], top: '9H', statuses: ['active', 'finished', 'active', 'active'], finishOrder: ['p2'] }), play('p1', '8H', true));
    expect(current(s)).toBe('p4'); // p2 out, p3 skipped
    const k = act(ko({ hands: [['KH', '5C'], [], ['6S', '7S'], ['6D', '7D']], top: '9H', statuses: ['active', 'finished', 'active', 'active'], finishOrder: ['p2'] }), play('p1', 'KH', true));
    expect(current(k)).toBe('p4'); // reversed: p1 → p4
  });

  it('with two active players left, a King acts as a skip (two-player rule uses the active count)', () => {
    const s = act(ko({ hands: [['KH', '5C'], [], ['6S', '7S']], top: '9H', statuses: ['active', 'finished', 'active'], finishOrder: ['p2'] }), play('p1', 'KH', true));
    expect(s.phase).toBe('playing');
    expect(current(s)).toBe('p1');
  });

  it('the round ends when only one player holds cards: that player is eliminated', () => {
    const s = act(ko({ hands: [['5H'], [], ['6S', '7S']], top: '9H', statuses: ['active', 'finished', 'active'], finishOrder: ['p2'], declared: [true, false, false] }), play('p1', '5H'));
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('roundComplete');
    expect(s.finishOrder).toEqual(['p2', 'p1']);
    expect(s.eliminatedId).toBe('p3');
    expect(s.winnerId).toBe('p2');
    expect(s.events.at(-1)).toMatchObject({ type: 'ROUND_COMPLETE', finishOrder: ['p2', 'p1'], eliminatedId: 'p3', reason: 'lastHolder' });
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('final round (two players): the first to empty their hand wins it and the other is eliminated', () => {
    const s = act(ko({ hands: [['5H'], ['6S', '7S']], top: '9H', declared: [true, false] }), play('p1', '5H'));
    expect(s.finishOrder).toEqual(['p1']);
    expect(s.eliminatedId).toBe('p2');
  });

  it('Last Card is still required to go out in a knockout round', () => {
    expect(reject(ko({ hands: [['5H'], ['3D'], ['6S']], top: '9H' }), play('p1', '5H'))).toBe('LAST_CARD_NOT_DECLARED');
  });

  it('finished players cannot challenge Last Card', () => {
    let s = ko({ hands: [[], ['5H', '7C'], ['3D', '4D']], top: '9H', statuses: ['finished', 'active', 'active'], finishOrder: ['p1'], current: 1 });
    s = act(s, play('p2', '5H'));
    expect(s.phase).toBe('lastCardWindow');
    expect(getLegalMoves(s, 'p1')).toEqual([]);
    expect(reject(s, { type: 'CHALLENGE_LAST_CARD', playerId: 'p1', targetPlayerId: 'p2' })).toBe('PLAYER_OUT');
    expect(getLegalMoves(s, 'p3')).toEqual([{ type: 'CHALLENGE_LAST_CARD', targetPlayerId: 'p2' }]);
  });
});

describe('Knockout round — stuck rounds', () => {
  it('turn cap: the player with the most cards is eliminated', () => {
    let s = ko({ hands: [['3C', '4C'], ['6D', '7D', '9D', '10D'], ['5S']], top: '9H', drawPile: ['2S'], leftovers: 'discard' });
    s = { ...s, rules: { ...s.rules, maxTurns: 1 } };
    s = act(s, draw('p1')); // ending turn 1 hits the cap
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('stalemate');
    expect(s.eliminatedId).toBe('p2'); // 4 cards vs 3 and 1
    expect(s.events.at(-1)).toMatchObject({ type: 'ROUND_COMPLETE', reason: 'stalled', eliminatedId: 'p2' });
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('a tie for most cards is broken by a reproducible seeded draw', () => {
    const run = (rng: number) => {
      let s = ko({ hands: [['3C', '4C'], ['6D', '7D', '9D'], ['5S']], top: '9H', drawPile: ['2S'], leftovers: 'discard' });
      s = { ...s, rngState: rng, rules: { ...s.rules, maxTurns: 1 } };
      return act(s, draw('p1')).eliminatedId;
    };
    const picks = new Set<string | null>();
    for (let r = 1; r <= 40; r++) {
      expect(run(r)).toBe(run(r));
      picks.add(run(r));
    }
    expect(picks).toEqual(new Set(['p1', 'p2']));
  });

  it('deadlock (nothing to draw, nobody can play) eliminates the most cards', () => {
    // leftovers: 'none' breaks 52-card conservation on purpose; only the stall logic is under test here.
    const s = ko({ hands: [['3C', '4C', '5C'], ['6D', '7D'], ['8S', '10S']], top: '9H', leftovers: 'none' });
    const after = act(s, draw('p1'));
    expect(after.phase).toBe('finished');
    expect(after.eliminatedId).toBe('p1');
  });
});

describe('forfeits (disconnects)', () => {
  it('the server can forfeit a player: hand shuffled into the deck, status forfeited', () => {
    const s0 = ko({ hands: [['3C', '4C'], ['6D', '7D', '9D'], ['5S', '6S']], top: '9H' });
    const s = forfeit(s0, 'p2');
    expect(s.players[1]!.status).toBe('forfeited');
    expect(hand(s, 'p2')).toEqual([]);
    expect(s.drawPile.length).toBe(s0.drawPile.length + 3);
    expect(s.events.at(-1)).toMatchObject({ type: 'PLAYER_FORFEITED', playerId: 'p2', cardsReturned: 3 });
    expect(findInvariantViolations(s)).toEqual([]);
    expect(current(s)).toBe('p1');
  });

  it("the forfeit event never reveals the player's cards to anyone", () => {
    const s = forfeit(ko({ hands: [['3C', '4C'], ['6D', '7D', '9D'], ['5S', '6S']], top: '9H' }), 'p2');
    expect(JSON.stringify(getPlayerView(s, 'p1').events.at(-1))).not.toContain('6D');
  });

  it("if it was the forfeiting player's turn, play moves on and a pending attack against them is cleared", () => {
    let s = ko({ hands: [['2H', '4C', '5C'], ['6D', '7D', '9D'], ['5S', '6S']], top: '9H' });
    s = act(s, play('p1', '2H'));
    s = forfeit(s, 'p2');
    expect(current(s)).toBe('p3');
    expect(s.pendingAttack).toBeNull();
    expect(s.events.find((e) => e.type === 'PLAYER_FORFEITED')).toMatchObject({ attackCleared: true });
  });

  it('only the server may forfeit someone else; a player may forfeit themselves', () => {
    const s = ko({ hands: [['3C', '4C'], ['6D', '7D'], ['5S', '6S']], top: '9H' });
    expect(reject(s, { type: 'FORFEIT', playerId: 'p1', targetPlayerId: 'p2' })).toBe('INVALID_FORFEIT_TARGET');
    expect(act(s, { type: 'FORFEIT', playerId: 'p3' }).players[2]!.status).toBe('forfeited');
  });

  it('a forfeit closes a Last Card window aimed at that player and resumes play', () => {
    let s = act(ko({ hands: [['5H', '7C'], ['3D', '4D'], ['6S', '7S']], top: '9H' }), play('p1', '5H'));
    expect(s.phase).toBe('lastCardWindow');
    s = forfeit(s, 'p1');
    expect(s.phase).toBe('playing');
    expect(current(s)).toBe('p2');
    expect(findInvariantViolations(s)).toEqual([]);
  });

  it('classic: when everyone else has forfeited, the last player wins by forfeit', () => {
    const s = forfeit(scenario({ hands: [['3C', '4C'], ['6D', '7D']], top: '9H' }), 'p2');
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('forfeit');
    expect(s.winnerId).toBe('p1');
  });

  it('knockout: a forfeit that leaves one holder ends the round without eliminating that holder', () => {
    const s = forfeit(ko({ hands: [[], ['6D', '7D'], ['5S', '6S']], top: '9H', statuses: ['finished', 'active', 'active'], finishOrder: ['p1'], current: 1 }), 'p2');
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('roundComplete');
    expect(s.eliminatedId).toBeNull();
    expect(s.events.at(-1)).toMatchObject({ type: 'ROUND_COMPLETE', reason: 'forfeit' });
  });

  it('forfeiting twice is refused', () => {
    const s = forfeit(ko({ hands: [['3C', '4C'], ['6D', '7D'], ['5S', '6S']], top: '9H' }), 'p2');
    expect(forfeitPlayer(s, 'p2', 'again').ok).toBe(false);
  });
});

describe('Knockouts tournament', () => {
  /** Plays the current round by always picking the first legal move (declaring), closing windows as the server. */
  const playRound = (t: TournamentState): TournamentState => {
    let n = 0;
    while (t.phase === 'playing' && n++ < 20000) {
      const g = t.game;
      let res;
      if (g.phase === 'lastCardWindow') {
        res = applyTournamentAction(t, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: `c${n}` });
      } else {
        const id = g.players[g.currentPlayerIndex]!.id;
        const move = getLegalMoves(g, id).find((m) => m.type === 'PLAY_CARDS') ?? { type: 'DRAW' as const };
        res = applyTournamentAction(t, { ...move, playerId: id, actionId: `m${n}` });
      }
      if (!res.ok) throw new Error(res.error.code);
      t = res.state;
    }
    return t;
  };

  it('creates round 1 in knockout mode with every entrant dealt 7 cards', () => {
    const t = createTournament({ seed: 'k1', players: seats(4) });
    expect(t.round).toBe(1);
    expect(t.phase).toBe('playing');
    expect(t.game.mode).toBe('knockout');
    expect(t.game.players.map((p) => p.hand.length)).toEqual([7, 7, 7, 7]);
    expect(getTournamentView(t, 'p1').expectedTotalRounds).toBe(3);
  });

  it('rejects fewer than 2 or more than 6 players', () => {
    expect(() => createTournament({ seed: 1, players: seats(1) })).toThrow();
    expect(() => createTournament({ seed: 1, players: seats(7) })).toThrow();
  });

  it('runs rounds until two remain, then the final crowns a champion', () => {
    let t = createTournament({ seed: 'full', players: seats(5) });
    const sizes: number[] = [];
    while (t.phase !== 'complete') {
      sizes.push(t.game.players.length);
      t = playRound(t);
      if (t.phase === 'roundOver') {
        expect(applyTournamentAction(t, { type: 'DRAW', playerId: 'p1', actionId: 'x' }).ok).toBe(false);
        const r = applyTournamentAction(t, { type: 'NEXT_ROUND' });
        if (!r.ok) throw new Error(r.error.code);
        t = r.state;
        expect(t.game.players.every((p) => p.hand.length === 7)).toBe(true); // fresh 7-card deal
      }
    }
    expect(sizes).toEqual([5, 4, 3, 2]);
    expect(t.rounds).toHaveLength(4);
    expect(t.rounds.at(-1)!.final).toBe(true);
    expect(t.championId).toBe(t.rounds.at(-1)!.finishOrder[0]);
    const standings = tournamentStandings(t);
    expect(standings[0]).toBe(t.championId);
    expect(new Set(standings).size).toBe(5);
  });

  it('round summaries list finishing order, the eliminated player and who advances', () => {
    let t = playRound(createTournament({ seed: 'sum', players: seats(3) }));
    expect(t.phase).toBe('roundOver');
    const r = t.rounds[0]!;
    expect(r.eliminated).toHaveLength(1);
    expect(r.advancing).toHaveLength(2);
    expect(r.advancing).toEqual(r.finishOrder);
    expect(r.advancing.every((id) => t.alive.includes(id))).toBe(true);
    expect(t.alive).not.toContain(r.eliminated[0]!.playerId);
    t = (applyTournamentAction(t, { type: 'NEXT_ROUND' }) as { state: TournamentState }).state;
    expect(t.game.players.map((p) => p.id).sort()).toEqual([...r.advancing].sort());
  });

  it('is deterministic for a seed', () => {
    const a = playRound(createTournament({ seed: 'det', players: seats(4) }));
    const b = playRound(createTournament({ seed: 'det', players: seats(4) }));
    expect(a).toEqual(b);
  });

  it('a mid-round disconnect eliminates the player at once (ranked below everyone still in)', () => {
    let t = createTournament({ seed: 'dc', players: seats(4) });
    const r = applyTournamentAction(t, { type: 'LEAVE_TOURNAMENT', playerId: 'p3' });
    if (!r.ok) throw new Error(r.error.code);
    t = r.state;
    expect(t.game.players[2]!.status).toBe('forfeited');
    t = playRound(t);
    expect(t.rounds[0]!.eliminated.map((e) => e.reason)).toEqual(['forfeit', 'lastHolder']);
    expect(t.alive).toHaveLength(2);
    expect(tournamentStandings(t).at(-1)).toBe('p3');
  });

  it('a player leaving between rounds is out; if only one is left they are champion', () => {
    let t = playRound(createTournament({ seed: 'gap', players: seats(3) }));
    const [a, b] = t.alive;
    t = (applyTournamentAction(t, { type: 'LEAVE_TOURNAMENT', playerId: a! }) as { state: TournamentState }).state;
    expect(t.phase).toBe('complete');
    expect(t.championId).toBe(b);
  });

  it('the tournament view hides other hands and makes knocked-out players spectators', () => {
    let t = playRound(createTournament({ seed: 'spec', players: seats(3) }));
    const out = t.rounds[0]!.eliminated[0]!.playerId;
    t = (applyTournamentAction(t, { type: 'NEXT_ROUND' }) as { state: TournamentState }).state;
    const v = getTournamentView(t, out);
    expect(v.game.viewerId).toBeNull();
    expect(v.game.hand).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('rngState');
  });

  it('every state reached is internally consistent', () => {
    let t = createTournament({ seed: 'inv', players: seats(6) });
    let n = 0;
    while (t.phase !== 'complete' && n++ < 50000) {
      expect(findInvariantViolations(t.game)).toEqual([]);
      if (t.phase === 'roundOver') {
        t = (applyTournamentAction(t, { type: 'NEXT_ROUND' }) as { state: TournamentState }).state;
        continue;
      }
      const g = t.game;
      const res =
        g.phase === 'lastCardWindow'
          ? applyTournamentAction(t, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: `c${n}` })
          : (() => {
              const id = g.players[g.currentPlayerIndex]!.id;
              const move = getLegalMoves(g, id)[0]!;
              return applyTournamentAction(t, { ...move, playerId: id, actionId: `m${n}` });
            })();
      if (!res.ok) throw new Error(res.error.code);
      t = res.state;
    }
    expect(t.phase).toBe('complete');
  });
});

describe('classic mode is unchanged by Knockouts', () => {
  it('first to empty their hand wins the whole game', () => {
    const s = act(scenario({ hands: [['5H'], ['3D'], ['6S']], top: '9H', declared: [true, false, false] }), play('p1', '5H'));
    expect(s.phase).toBe('finished');
    expect(s.endReason).toBe('win');
    expect(s.finishOrder).toEqual([]);
  });

  it('startGame defaults to classic', () => {
    expect(startGame({ seed: 1, players: seats(3) }).mode).toBe('classic');
    const r = applyAction(startGame({ seed: 1, players: seats(3), mode: 'knockout' }), { type: 'FORFEIT', playerId: 'p1', actionId: 'z' });
    expect(r.ok).toBe(true);
  });

  it('sequences still resolve normally in knockout rounds', () => {
    const s = act(ko({ hands: [['7S', '6S', '3C'], ['4D'], ['4H']], top: '7H' }), seq('p1', ['7S', '6S'], true));
    expect(current(s)).toBe('p2');
  });
});
