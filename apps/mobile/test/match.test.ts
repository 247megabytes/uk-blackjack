import { describe, expect, it } from 'vitest';
import { findInvariantViolations, SUITS, type CardPlay, type MoveIntent, type PlayerView } from '@ukbj/game-engine';
import { createEasyBot, type Bot } from '@ukbj/game-bots';
import {
  addAce,
  buildPlay,
  canArmLastCard,
  selectableCardIds,
  selectionState,
  tapCard,
  HUMAN_ID,
  MatchController,
  PACING,
  playableCardIds,
  standings,
  type Plan,
} from '../src/game';

type HumanPolicy = (view: PlayerView, step: number) => MoveIntent | null;

/**
 * Plays a turn exactly as a person would in the app: tap lit cards to build a
 * sequence (choosing a suit when an Ace is tapped), back off the last card if the
 * sequence can't end there, then press Play — or Draw / Pass when nothing is lit.
 */
export function uiTurn(view: PlayerView, step: number, armed: boolean): MoveIntent {
  let sel: CardPlay[] = [];
  for (let k = 0; k < 14; k++) {
    const opts = [...selectableCardIds(view, sel)].sort();
    const state = selectionState(view, sel);
    if (opts.length === 0 || (state.kind === 'ready' && (step + k) % 3 === 0)) break;
    const card = view.hand.find((c) => c.id === opts[(step * 7 + k) % opts.length])!;
    const r = tapCard(view, sel, card);
    if (r.kind === 'chooseSuit') sel = addAce(sel, card, SUITS[(step + k) % 4]!);
    else if (r.kind === 'selection') sel = r.selection;
    else throw new Error(`lit card was rejected: ${r.reason}`);
  }
  while (sel.length > 0 && selectionState(view, sel).kind !== 'ready') {
    const last = view.hand.find((c) => c.id === sel[sel.length - 1]!.cardId)!;
    const r = tapCard(view, sel, last);
    if (r.kind !== 'selection') throw new Error('tapping a selected card must remove it');
    sel = r.selection;
  }
  const move = sel.length ? buildPlay(view, sel, armed && canArmLastCard(view, sel)) : null;
  if (move) return move;
  if (view.legalMoves.some((m) => m.type === 'PASS')) return { type: 'PASS' };
  if (view.legalMoves.some((m) => m.type === 'DRAW')) return { type: 'DRAW' };
  throw new Error(`no UI move available: ${JSON.stringify(view.legalMoves)}`);
}

/** Random legal play, sometimes forgets Last Card, challenges when possible. */
const randomHuman = (forgetEvery = 3): HumanPolicy => (view, step) => {
  const moves = view.legalMoves;
  if (view.phase === 'lastCardWindow') {
    return moves.find((m) => m.type === 'CHALLENGE_LAST_CARD' || (m.type === 'DECLARE_LAST_CARD' && step % 2 === 0)) ?? null;
  }
  if (view.currentPlayerId !== view.viewerId) return null;
  void moves;
  return uiTurn(view, step, step % forgetEvery !== 0);
};

interface RunResult {
  match: MatchController;
  steps: number;
  violations: string[];
  humanWindowPlans: Plan[];
}

/** Drives a match exactly as the UI does: plan → (human acts | wait → runPlan). */
function runMatch(seed: string, botCount: number, human: HumanPolicy, makeBot?: (id: string, seat: number) => Bot): RunResult {
  const match = new MatchController({ seed, humanName: 'Tester', botCount }, makeBot);
  const violations: string[] = [];
  const humanWindowPlans: Plan[] = [];
  let steps = 0;
  while (!match.isFinished() && steps < 4000 && violations.length === 0) {
    steps++;
    const plan = match.plan(PACING.normal);
    if (plan.kind === 'finished') break;
    const view = match.view();
    if (view.phase === 'lastCardWindow' && view.lastCardWindowPlayerId === HUMAN_ID) humanWindowPlans.push(plan);
    const humanMove = human(view, steps);
    const humanActs = plan.kind === 'human' || (view.phase === 'lastCardWindow' && humanMove !== null);
    if (humanActs) {
      if (!humanMove) {
        violations.push(`human had nothing to do on a human plan: ${JSON.stringify(view.legalMoves)}`);
        break;
      }
      const r = match.submitHuman(humanMove);
      if (!r.ok) violations.push(`human move rejected: ${r.error.code} ${JSON.stringify(humanMove)}`);
      else if (plan.kind !== 'human' && match.runPlan(plan) !== null) violations.push('stale plan executed after human acted');
    } else {
      if (plan.delayMs <= 0) violations.push('non-positive delay');
      const r = match.runPlan(plan);
      if (!r || !r.ok) violations.push(`plan failed: ${JSON.stringify(plan)} ${r && !r.ok ? r.error.code : 'stale'}`);
    }
    for (const v of findInvariantViolations(match.state)) violations.push(v);
  }
  return { match, steps, violations, humanWindowPlans };
}

describe('MatchController — full offline matches', () => {
  for (const bots of [1, 2, 3, 4, 5]) {
    it(`completes 150 matches against ${bots} bot(s) through the UI drive loop`, () => {
      let humanWins = 0;
      for (let i = 0; i < 150; i++) {
        const r = runMatch(`m-${bots}-${i}`, bots, randomHuman());
        if (r.violations.length) throw new Error(`seed m-${bots}-${i}: ${r.violations.join('; ')}`);
        expect(r.match.isFinished()).toBe(true);
        if (r.match.state.winnerId === HUMAN_ID) humanWins++;
        expect(r.match.state.players).toHaveLength(bots + 1);
      }
      expect(humanWins).toBeGreaterThan(0);
    });
  }

  it('is reproducible from its seed', () => {
    const a = runMatch('repro', 3, randomHuman());
    const b = runMatch('repro', 3, randomHuman());
    expect(a.match.state).toEqual(b.match.state);
  });

  it('clamps the bot count to 1–5', () => {
    expect(new MatchController({ seed: 'x', humanName: 'A', botCount: 0 }).botIds).toHaveLength(1);
    expect(new MatchController({ seed: 'x', humanName: 'A', botCount: 9 }).botIds).toHaveLength(5);
  });

  it('names the human seat and uses a fallback for blank names', () => {
    const m = new MatchController({ seed: 'x', humanName: '   ', botCount: 2 });
    expect(m.state.players[0]).toMatchObject({ id: HUMAN_ID, name: 'You' });
  });
});

describe('MatchController — planning', () => {
  it('memoises the plan per state version so bots decide only once', () => {
    let calls = 0;
    const counting = (id: string): Bot => {
      const inner = createEasyBot({ seed: id });
      return { difficulty: 'easy', chooseMove: (v) => (calls++, inner.chooseMove(v)) };
    };
    const m = new MatchController({ seed: 'memo', humanName: 'A', botCount: 3 }, counting);
    // Advance until a bot is to move.
    for (let i = 0; i < 50 && m.plan(PACING.normal).kind === 'human'; i++) {
      const v = m.view();
      m.submitHuman(uiTurn(v, i, true));
      if (m.view().drawnCardId) m.submitHuman({ type: 'PASS' });
    }
    const p1 = m.plan(PACING.normal);
    const before = calls;
    const p2 = m.plan(PACING.normal);
    expect(p2).toBe(p1);
    expect(calls).toBe(before);
    // Changing pacing re-times but does not re-decide.
    const p3 = m.plan(PACING.fast);
    expect(calls).toBe(before);
    expect(p3.kind).toBe(p1.kind);
  });

  it('ignores stale plans', () => {
    const m = new MatchController({ seed: 'stale', humanName: 'A', botCount: 1 });
    const plan = m.plan(PACING.normal);
    const fake: Plan = { kind: 'closeWindow', version: plan.version - 1, delayMs: 10 };
    expect(m.runPlan(fake)).toBeNull();
  });

  it('gives the human a grace period before bots challenge a missed Last Card', () => {
    // A human who always forgets — collect the plans made while the human is on the spot.
    let graced = 0;
    for (let i = 0; i < 60; i++) {
      const r = runMatch(`grace-${i}`, 4, randomHuman(1));
      for (const p of r.humanWindowPlans) {
        if (p.kind === 'bot') {
          expect(p.move.type).toBe('CHALLENGE_LAST_CARD');
          expect(p.delayMs).toBe(PACING.normal.windowHumanGraceMs);
          graced++;
        }
      }
    }
    expect(graced).toBeGreaterThan(0);
  });

  it('a human who declares inside the window escapes the penalty and voids the challenge', () => {
    for (let i = 0; i < 400; i++) {
      const m = new MatchController({ seed: `escape-${i}`, humanName: 'A', botCount: 3 });
      for (let step = 0; step < 600 && !m.isFinished(); step++) {
        const plan = m.plan(PACING.normal);
        const v = m.view();
        if (v.phase === 'lastCardWindow' && v.lastCardWindowPlayerId === HUMAN_ID && plan.kind === 'bot') {
          const r = m.submitHuman({ type: 'DECLARE_LAST_CARD' });
          expect(r.ok).toBe(true);
          expect(m.runPlan(plan)).toBeNull(); // the bot's challenge never lands
          expect(m.view().hand).toHaveLength(1);
          return;
        }
        if (plan.kind === 'human') {
          m.submitHuman(uiTurn(v, step, false));
        } else if (plan.kind !== 'finished') m.runPlan(plan);
      }
    }
    throw new Error('never reached a challenged human window');
  });

  it('the human can catch a bot that forgot Last Card', () => {
    const forgetful = (id: string): Bot => createEasyBot({ seed: id, forgetLastCardChance: 1, lateDeclareChance: 0, challengeChance: 0 });
    for (let i = 0; i < 200; i++) {
      const m = new MatchController({ seed: `catch-${i}`, humanName: 'A', botCount: 2 }, forgetful);
      for (let step = 0; step < 600 && !m.isFinished(); step++) {
        const v = m.view();
        if (v.phase === 'lastCardWindow' && v.lastCardWindowPlayerId !== HUMAN_ID) {
          const target = v.lastCardWindowPlayerId!;
          const before = v.players.find((p) => p.id === target)!.cardCount;
          expect(m.plan(PACING.normal).kind).toBe('closeWindow');
          const r = m.submitHuman({ type: 'CHALLENGE_LAST_CARD', targetPlayerId: target });
          expect(r.ok).toBe(true);
          expect(m.view().players.find((p) => p.id === target)!.cardCount).toBe(before + 2);
          return;
        }
        const plan = m.plan(PACING.normal);
        if (plan.kind === 'human') {
          m.submitHuman(uiTurn(v, step, true));
        } else if (plan.kind !== 'finished') m.runPlan(plan);
      }
    }
    throw new Error('no bot ever forgot Last Card');
  });
});

describe('human move helpers', () => {
  it('only declares Last Card when the human armed it', () => {
    let m = new MatchController({ seed: 'arm', humanName: 'A', botCount: 1 });
    // Find a state where the human holds 2 cards on their turn with a play available.
    for (let i = 0; i < 2000; i++) {
      m = new MatchController({ seed: `arm-${i}`, humanName: 'A', botCount: 1 });
      for (let step = 0; step < 400 && !m.isFinished(); step++) {
        const v = m.view();
        const plan = m.plan(PACING.fast);
        const firstCard = [...playableCardIds(v)].map((id) => v.hand.find((c) => c.id === id)!).find((c) => c.rank !== 'A' && c.rank !== 'Q');
        const sel: CardPlay[] = firstCard ? [{ cardId: firstCard.id }] : [];
        if (plan.kind === 'human' && sel.length && canArmLastCard(v, sel)) {
          expect(buildPlay(v, sel, false)).toEqual({ type: 'PLAY_CARDS', plays: sel });
          expect(buildPlay(v, sel, true)).toEqual({ type: 'PLAY_CARDS', plays: sel, declareLastCard: true });
          expect(buildPlay(v, [{ cardId: 'XX' as never }], true)).toBeNull();
          return;
        }
        if (plan.kind === 'human') {
          m.submitHuman(uiTurn(v, step, true));
        } else if (plan.kind !== 'finished') m.runPlan(plan);
      }
    }
    throw new Error('no armable state found');
  });

  it('ranks standings with the winner first and ties sharing a place', () => {
    const r = runMatch('stand', 4, randomHuman());
    const s = standings(r.match.view());
    expect(s[0]!.playerId).toBe(r.match.state.winnerId);
    expect(s[0]!.place).toBe(1);
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!.cardsLeft).toBeGreaterThanOrEqual(s[i - 1]!.playerId === r.match.state.winnerId ? 0 : s[i - 1]!.cardsLeft);
      if (s[i]!.cardsLeft === s[i - 1]!.cardsLeft && i > 1) expect(s[i]!.place).toBe(s[i - 1]!.place);
    }
  });
});
