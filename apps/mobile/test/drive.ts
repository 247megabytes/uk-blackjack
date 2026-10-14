import { findInvariantViolations, SUITS, type CardPlay, type MoveIntent, type PlayerView } from '@ukbj/game-engine';
import type { Bot } from '@ukbj/game-bots';
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
  type MatchMode,
  type Plan,
} from '../src/game';

/** Shared UI drive loop for the mobile tests (not a test file itself). */

export type HumanPolicy = (view: PlayerView, step: number) => MoveIntent | null;

/**
 * Plays a turn exactly as a person would in the app: tap lit cards to build a
 * sequence (choosing a suit when an Ace is tapped), back off the last card if the
 * sequence can't end there, then press Play — or Draw when nothing is lit. Going out
 * always arms Last Card first (the app refuses the play otherwise and says so).
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
  const st = selectionState(view, sel);
  const arm = st.kind === 'ready' && st.needsLastCard ? true : armed && canArmLastCard(view, sel);
  const move = sel.length ? buildPlay(view, sel, arm) : null;
  if (move) return move;
  if (view.legalMoves.some((m) => m.type === 'DRAW')) return { type: 'DRAW' };
  throw new Error(`no UI move available: ${JSON.stringify(view.legalMoves)}`);
}

/** Random legal play, sometimes forgets Last Card, challenges when possible. */
export const randomHuman = (forgetEvery = 3): HumanPolicy => (view, step) => {
  const moves = view.legalMoves;
  if (view.phase === 'lastCardWindow') {
    return moves.find((m) => m.type === 'CHALLENGE_LAST_CARD' || (m.type === 'DECLARE_LAST_CARD' && step % 2 === 0)) ?? null;
  }
  if (view.currentPlayerId !== view.viewerId) return null;
  void moves;
  return uiTurn(view, step, step % forgetEvery !== 0);
};

export interface RunResult {
  match: MatchController;
  steps: number;
  violations: string[];
  humanWindowPlans: Plan[];
}

/** Drives a match exactly as the UI does: plan → (human acts | wait → runPlan). */
export function runMatch(seed: string, botCount: number, human: HumanPolicy, makeBot?: (id: string, seat: number) => Bot, mode: MatchMode = 'classic'): RunResult {
  const match = new MatchController({ seed, humanName: 'Tester', botCount, mode }, makeBot);
  const violations: string[] = [];
  const humanWindowPlans: Plan[] = [];
  let steps = 0;
  while (!match.isFinished() && steps < 20000 && violations.length === 0) {
    steps++;
    const plan = match.plan(PACING.normal);
    if (plan.kind === 'finished') break;
    if (plan.kind === 'roundOver') {
      if (!match.nextRound()) violations.push('nextRound refused at roundOver');
      continue;
    }
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
    } else if (plan.kind === 'bot' || plan.kind === 'closeWindow') {
      if (plan.delayMs <= 0) violations.push('non-positive delay');
      const r = match.runPlan(plan);
      if (!r || !r.ok) violations.push(`plan failed: ${JSON.stringify(plan)} ${r && !r.ok ? r.error.code : 'stale'}`);
    }
    for (const v of findInvariantViolations(match.state)) violations.push(v);
  }
  return { match, steps, violations, humanWindowPlans };
}

