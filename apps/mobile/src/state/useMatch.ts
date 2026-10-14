import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameError, MoveIntent, PlayerId, PlayerView, TournamentView } from '@ukbj/game-engine';
import { describeEvents, MatchController, PACING, type MatchSetup, type PacingName, type TableEffect } from '../game';

export interface UseMatch {
  view: PlayerView;
  /** Knockouts progress (null in Classic). */
  tournament: TournamentView | null;
  /** Effects (banners) produced by the most recent state changes, newest last. */
  effects: TableEffect[];
  nameOf: (id: PlayerId) => string;
  /** Submits a human move; returns an error if the engine rejected it. */
  act: (move: MoveIntent) => GameError | null;
  /** Knockouts: deal the next round after the round results. */
  nextRound: () => void;
  /** Knockouts, while watching: play on instantly to the round results (or to the champion). */
  skip: (toChampion: boolean) => void;
  /** Knockouts: is the human still taking turns this round? */
  humanActive: boolean;
  humanEliminated: boolean;
  seed: string;
}

/**
 * Binds a MatchController to React. Each state version gets at most one timer:
 * when the human acts first, the effect cleanup cancels the pending bot/window timer.
 * In Knockouts every round is a new game (new gameId, versions restart).
 */
export function useMatch(setup: MatchSetup, pacingName: PacingName, onEffects?: (fx: TableEffect[]) => void): UseMatch {
  const controller = useMemo(() => new MatchController(setup), [setup]);
  const [view, setView] = useState<PlayerView>(() => controller.view());
  const [tournament, setTournament] = useState<TournamentView | null>(() => controller.tournamentView());
  const [effects, setEffects] = useState<TableEffect[]>([]);
  const seen = useRef({ gameId: controller.state.gameId, version: controller.state.version });
  const effectsCallback = useRef(onEffects);
  effectsCallback.current = onEffects;

  // Names come from the entrants, so knocked-out players keep their names in results.
  const names = useMemo(() => new Map(controller.state.players.map((p) => [p.id, p.name])), [controller]);
  const nameOf = useCallback((id: PlayerId) => names.get(id) ?? id, [names]);

  // Reset when a new match (rematch) starts.
  useEffect(() => {
    seen.current = { gameId: controller.state.gameId, version: controller.state.version };
    setView(controller.view());
    setTournament(controller.tournamentView());
    setEffects([]);
  }, [controller]);

  const sync = useCallback(
    (quiet = false) => {
      const next = controller.view();
      const newRound = next.gameId !== seen.current.gameId;
      const since = newRound ? 0 : seen.current.version;
      const fresh = next.events.filter((e) => e.version > since);
      seen.current = { gameId: next.gameId, version: next.version };
      const watching = !next.players.some((p) => p.id === next.viewerId && p.status === 'active');
      const fx = quiet ? [] : describeEvents(fresh, next.viewerId, nameOf, { watching });
      if (fx.length || newRound || quiet) setEffects(fx);
      if (fx.length) effectsCallback.current?.(fx);
      setView(next);
      setTournament(controller.tournamentView());
    },
    [controller, nameOf],
  );

  const pacing = PACING[pacingName];

  useEffect(() => {
    if (view.gameId !== controller.state.gameId || view.version !== controller.state.version) return;
    const plan = controller.plan(pacing);
    if (plan.kind !== 'bot' && plan.kind !== 'closeWindow') return;
    const timer = setTimeout(() => {
      if (controller.runPlan(plan)) sync();
    }, plan.delayMs);
    return () => clearTimeout(timer);
  }, [controller, view.gameId, view.version, pacing, sync]);

  const act = useCallback(
    (move: MoveIntent): GameError | null => {
      const res = controller.submitHuman(move);
      if (!res.ok) return res.error;
      if (!res.duplicate) sync();
      return null;
    },
    [controller, sync],
  );

  const nextRound = useCallback(() => {
    if (controller.nextRound()) sync();
  }, [controller, sync]);

  const skip = useCallback(
    (toChampion: boolean) => {
      controller.fastForward(!toChampion);
      sync(true);
    },
    [controller, sync],
  );

  return {
    view,
    tournament,
    effects,
    nameOf,
    act,
    nextRound,
    skip,
    humanActive: view.players.some((p) => p.id === view.viewerId && p.status === 'active'),
    humanEliminated: tournament ? !tournament.alive.includes(controller.humanId) : false,
    seed: setup.seed,
  };
}
