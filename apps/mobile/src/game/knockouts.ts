/**
 * Knockouts presentation helpers: progress labels, round-result rows and final
 * standings. Pure (no React), so the wording and ordering are unit-tested.
 */

import type { PlayerId, RoundSummary, TournamentView } from '@ukbj/game-engine';
import { ordinal } from './effects';

/** "Round 2 of 4", or "Final" for the last round. */
export function progressLabel(t: TournamentView): string {
  if (t.phase === 'complete') return 'Champion crowned';
  if (t.finalRound && t.phase === 'playing') return 'Final';
  return `Round ${t.round} of ${t.expectedTotalRounds}`;
}

/** One pip per entrant: still in, or out (with the round they went out in). */
export interface ProgressPip {
  readonly playerId: PlayerId;
  readonly alive: boolean;
}

export function progressPips(t: TournamentView): ProgressPip[] {
  return t.entrants.map((p) => ({ playerId: p.id, alive: t.alive.includes(p.id) }));
}

export type RoundRowKind = 'safe' | 'out' | 'left';

export interface RoundRow {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: RoundRowKind;
  readonly isYou: boolean;
}

/**
 * Rows for the round-results sheet: everyone advancing (finishers in order, then any
 * holders who survived a stalled round), then whoever was knocked out or left.
 */
export function roundRows(summary: RoundSummary, nameOf: (id: PlayerId) => string, youId: PlayerId, final: boolean): RoundRow[] {
  const rows: RoundRow[] = [];
  summary.advancing.forEach((id, i) => {
    const finished = summary.finishOrder.includes(id);
    rows.push({
      playerId: id,
      name: nameOf(id),
      label: final && i === 0 ? 'Champion' : ordinal(i + 1),
      detail: finished ? (final ? 'First out — wins the final' : 'Out of cards — through') : 'Fewer cards — through',
      kind: 'safe',
      isYou: id === youId,
    });
  });
  for (const e of summary.eliminated) {
    rows.push({
      playerId: e.playerId,
      name: nameOf(e.playerId),
      label: e.reason === 'forfeit' ? 'Left' : 'Out',
      detail:
        e.reason === 'forfeit'
          ? 'Forfeited'
          : e.reason === 'stalled'
            ? `Most cards when the round stalled (${e.cardsHeld})`
            : `Last one holding cards (${e.cardsHeld})`,
      kind: e.reason === 'forfeit' ? 'left' : 'out',
      isYou: e.playerId === youId,
    });
  }
  return rows;
}

export interface FinalStanding {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly place: number;
  readonly detail: string;
  readonly isYou: boolean;
}

/** Champion first, then the runner-up, down to the first player knocked out. */
export function finalStandings(t: TournamentView, nameOf: (id: PlayerId) => string, youId: PlayerId): FinalStanding[] {
  const out = [...t.eliminated].reverse();
  const top = t.championId ? [{ playerId: t.championId, detail: 'Champion' }] : [];
  const rest = out.map((e, i) => ({
    playerId: e.playerId,
    detail: e.reason === 'forfeit' ? `Left in round ${e.round}` : i === 0 && t.championId ? 'Runner-up' : `Out in round ${e.round}`,
  }));
  return [...top, ...rest].map((r, i) => ({ ...r, name: nameOf(r.playerId), place: i + 1, isYou: r.playerId === youId }));
}

/** Headline for the round-results sheet from the human's point of view. */
export function roundHeadline(summary: RoundSummary, youId: PlayerId, nameOf: (id: PlayerId) => string): string {
  const out = summary.eliminated.find((e) => e.reason !== 'forfeit') ?? summary.eliminated[0];
  if (summary.final) return summary.advancing[0] === youId ? 'You’re the champion!' : `${nameOf(summary.advancing[0] ?? '')} wins the final`;
  if (out?.playerId === youId) return 'You’re knocked out';
  if (summary.advancing.includes(youId)) return 'You’re through!';
  return out ? `${nameOf(out.playerId)} is knocked out` : `Round ${summary.round} complete`;
}
