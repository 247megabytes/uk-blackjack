import { describe, expect, it } from 'vitest';
import { findInvariantViolations, parseCard, type GameEvent, type MoveIntent, type PlayerView, type RoundSummary } from '@ukbj/game-engine';
import {
  describeEvents,
  finalStandings,
  HUMAN_ID,
  MatchController,
  PACING,
  progressLabel,
  progressPips,
  roundHeadline,
  roundRows,
  statusLine,
} from '../src/game';
import { runMatch, uiTurn } from './drive';

const human = (view: PlayerView, step: number): MoveIntent | null => {
  if (view.phase === 'lastCardWindow') return view.legalMoves.find((m) => m.type === 'DECLARE_LAST_CARD' || m.type === 'CHALLENGE_LAST_CARD') ?? null;
  if (view.currentPlayerId !== view.viewerId || !view.legalMoves.length) return null;
  return uiTurn(view, step, step % 3 !== 0);
};
const nameOf = (id: string) => ({ you: 'You', bot1: 'Ada', bot2: 'Monty', bot3: 'Priya', bot4: 'Jonah', bot5: 'Lena' })[id] ?? id;

describe('Knockouts through the UI drive loop', () => {
  for (const bots of [1, 2, 3, 4, 5]) {
    it(`completes 40 tournaments with ${bots + 1} players, one round per knockout, a champion at the end`, () => {
      let humanTitles = 0;
      for (let i = 0; i < 40; i++) {
        const r = runMatch(`ko-${bots}-${i}`, bots, human, undefined, 'knockouts');
        if (r.violations.length) throw new Error(`seed ko-${bots}-${i}: ${r.violations.join('; ')}`);
        expect(r.match.isFinished()).toBe(true);
        const t = r.match.tournamentView()!;
        expect(t.phase).toBe('complete');
        expect(t.rounds).toHaveLength(bots);
        expect(t.championId).not.toBeNull();
        if (t.championId === HUMAN_ID) humanTitles++;
      }
      if (bots <= 2) expect(humanTitles).toBeGreaterThan(0);
    });
  }

  it('pauses at the round results until the human continues', () => {
    const m = new MatchController({ seed: 'pause', humanName: 'A', botCount: 3, mode: 'knockouts' });
    for (let step = 0; step < 5000 && !m.isRoundOver(); step++) {
      const plan = m.plan(PACING.fast);
      if (plan.kind === 'human') m.submitHuman(uiTurn(m.view(), step, true));
      else if (plan.kind === 'bot' || plan.kind === 'closeWindow') m.runPlan(plan);
    }
    expect(m.isRoundOver()).toBe(true);
    const plan = m.plan(PACING.fast);
    expect(plan.kind).toBe('roundOver');
    expect(m.runPlan(plan)).toBeNull();
    expect(m.plan(PACING.fast)).toBe(plan); // stays put
    expect(m.nextRound()).toBe(true);
    expect(m.round).toBe(2);
    expect(m.state.players).toHaveLength(3);
    expect(m.state.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(findInvariantViolations(m.state)).toEqual([]);
  });

  it('a knocked-out human becomes a spectator and can skip to the champion deterministically', () => {
    const play = (seed: string) => {
      const m = new MatchController({ seed, humanName: 'A', botCount: 4, mode: 'knockouts' });
      for (let step = 0; step < 20000 && !m.isFinished(); step++) {
        const plan = m.plan(PACING.fast);
        if (plan.kind === 'roundOver') {
          if (m.humanEliminated()) break;
          m.nextRound();
        } else if (plan.kind === 'human') {
          const v = m.view(); // a hopeless human: always picks up when allowed
          m.submitHuman(v.legalMoves.some((x) => x.type === 'DRAW') ? { type: 'DRAW' } : uiTurn(v, step, true));
        } else if (plan.kind === 'bot' || plan.kind === 'closeWindow') m.runPlan(plan);
      }
      return m;
    };
    for (let i = 0; i < 20; i++) {
      const m = play(`spec-${i}`);
      if (!m.humanEliminated()) continue;
      m.nextRound();
      expect(m.view().viewerId).toBeNull();
      expect(m.view().hand).toEqual([]);
      expect(m.view().legalMoves).toEqual([]);
      expect(statusLine(m.view(), nameOf).startsWith('Watching')).toBe(true);
      m.fastForward();
      expect(m.isFinished()).toBe(true);
      const again = play(`spec-${i}`);
      again.nextRound();
      again.fastForward();
      expect(again.tournamentView()!.championId).toBe(m.tournamentView()!.championId);
      return;
    }
    throw new Error('the always-drawing human was never knocked out');
  });

  it('a human who finishes a round watches the rest and can skip to the results', () => {
    for (let i = 0; i < 60; i++) {
      const m = new MatchController({ seed: `fin-${i}`, humanName: 'A', botCount: 4, mode: 'knockouts' });
      for (let step = 0; step < 5000 && !m.isRoundOver(); step++) {
        if (!m.humanActive() && m.state.players.find((p) => p.id === HUMAN_ID)?.status === 'finished') {
          expect(statusLine(m.view(), nameOf).startsWith('You finished')).toBe(true);
          m.fastForward(true);
          expect(m.isRoundOver()).toBe(true);
          expect(m.tournamentView()!.rounds[0]!.advancing).toContain(HUMAN_ID);
          return;
        }
        const plan = m.plan(PACING.fast);
        if (plan.kind === 'human') m.submitHuman(uiTurn(m.view(), step, true));
        else if (plan.kind === 'bot' || plan.kind === 'closeWindow') m.runPlan(plan);
      }
    }
    throw new Error('the human never finished a round early');
  });
});

describe('Knockouts presentation', () => {
  const summary: RoundSummary = {
    round: 1,
    playerIds: ['you', 'bot1', 'bot2', 'bot3'],
    finishOrder: ['bot2', 'you', 'bot3'],
    advancing: ['bot2', 'you', 'bot3'],
    eliminated: [{ playerId: 'bot1', round: 1, reason: 'lastHolder', cardsHeld: 4 }],
    reason: 'lastHolder',
    final: false,
  };

  it('round rows list finishers in order, then the eliminated player', () => {
    const rows = roundRows(summary, nameOf, HUMAN_ID, false);
    expect(rows.map((r) => [r.name, r.label, r.kind])).toEqual([
      ['Monty', '1st', 'safe'],
      ['You', '2nd', 'safe'],
      ['Priya', '3rd', 'safe'],
      ['Ada', 'Out', 'out'],
    ]);
    expect(rows[3]!.detail).toBe('Last one holding cards (4)');
    expect(roundHeadline(summary, HUMAN_ID, nameOf)).toBe('You’re through!');
    expect(roundHeadline({ ...summary, eliminated: [{ ...summary.eliminated[0]!, playerId: 'you' }], advancing: ['bot2', 'bot3', 'bot1'] }, HUMAN_ID, nameOf)).toBe('You’re knocked out');
  });

  it('forfeits and stalled rounds read clearly', () => {
    const rows = roundRows(
      { ...summary, eliminated: [{ playerId: 'bot4', round: 1, reason: 'forfeit', cardsHeld: 0 }, { playerId: 'bot1', round: 1, reason: 'stalled', cardsHeld: 9 }] },
      nameOf,
      HUMAN_ID,
      false,
    );
    expect(rows.slice(-2).map((r) => [r.label, r.detail])).toEqual([
      ['Left', 'Forfeited'],
      ['Out', 'Most cards when the round stalled (9)'],
    ]);
  });

  it('progress label, pips and final standings', () => {
    const m = new MatchController({ seed: 'prog', humanName: 'A', botCount: 3, mode: 'knockouts' });
    const t = m.tournamentView()!;
    expect(progressLabel(t)).toBe('Round 1 of 3');
    expect(progressPips(t).every((p) => p.alive)).toBe(true);
    const r = runMatch('prog-full', 3, human, undefined, 'knockouts');
    const done = r.match.tournamentView()!;
    expect(progressLabel(done)).toBe('Champion crowned');
    const st = finalStandings(done, nameOf, HUMAN_ID);
    expect(st).toHaveLength(4);
    expect(st[0]!.detail).toBe('Champion');
    expect(st[1]!.detail).toBe('Runner-up');
    expect(st.map((s) => s.place)).toEqual([1, 2, 3, 4]);
  });

  it('banners for finishing, forfeits, rounds and covered powers', () => {
    const ev = (e: Record<string, unknown>) => ({ version: 9, ...e }) as GameEvent;
    const fx = describeEvents(
      [
        ev({ type: 'PLAYER_FINISHED', playerId: 'you', place: 1 }),
        ev({ type: 'PLAYER_FORFEITED', playerId: 'bot2', cardsReturned: 5, attackCleared: false }),
        ev({ type: 'ROUND_COMPLETE', finishOrder: ['you'], eliminatedId: 'bot1', reason: 'lastHolder' }),
        ev({ type: 'POWER_COVERED', playerId: 'bot1', cards: [parseCard('8S'), parseCard('8H')] }),
      ],
      HUMAN_ID,
      nameOf,
    );
    expect(fx.map((f) => f.title)).toEqual(["You're out — 1st!", 'Monty left', 'Ada is knocked out', 'Covered']);
    expect(fx[3]!.subtitle).toBe('8s covered — no effect');
  });
});

describe('banners while watching', () => {
  it('does not tell a finished or knocked-out human to catch anyone', () => {
    const ev = { type: 'LAST_CARD_WINDOW_OPENED', version: 3, playerId: 'bot1' } as GameEvent;
    expect(describeEvents([ev], HUMAN_ID, nameOf)[0]!.subtitle).toBe('Tap Catch Ada before they say it');
    expect(describeEvents([ev], HUMAN_ID, nameOf, { watching: true })[0]!.subtitle).toBe('Will anyone catch them?');
  });
});
