import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameError, MoveIntent, PlayerId, PlayerView } from '@ukbj/game-engine';
import { describeEvents, MatchController, PACING, type MatchSetup, type PacingName, type TableEffect } from '../game';

export interface UseMatch {
  view: PlayerView;
  /** Effects (banners) produced by the most recent state changes, newest last. */
  effects: TableEffect[];
  nameOf: (id: PlayerId) => string;
  /** Submits a human move; returns an error if the engine rejected it. */
  act: (move: MoveIntent) => GameError | null;
  seed: string;
}

/**
 * Binds a MatchController to React. Each state version gets at most one timer:
 * when the human acts first, the effect cleanup cancels the pending bot/window timer.
 */
export function useMatch(setup: MatchSetup, pacingName: PacingName, onEffects?: (fx: TableEffect[]) => void): UseMatch {
  const controller = useMemo(() => new MatchController(setup), [setup]);
  const [view, setView] = useState<PlayerView>(() => controller.view());
  const [effects, setEffects] = useState<TableEffect[]>([]);
  const seenVersion = useRef(controller.state.version);
  const effectsCallback = useRef(onEffects);
  effectsCallback.current = onEffects;

  const names = useMemo(() => new Map(controller.state.players.map((p) => [p.id, p.name])), [controller]);
  const nameOf = useCallback((id: PlayerId) => names.get(id) ?? id, [names]);

  // Reset when a new match (rematch) starts.
  useEffect(() => {
    seenVersion.current = controller.state.version;
    setView(controller.view());
    setEffects([]);
  }, [controller]);

  const sync = useCallback(() => {
    const next = controller.view();
    const fresh = next.events.filter((e) => e.version > seenVersion.current);
    seenVersion.current = next.version;
    const fx = describeEvents(fresh, next.viewerId, nameOf);
    if (fx.length) {
      setEffects(fx);
      effectsCallback.current?.(fx);
    }
    setView(next);
  }, [controller, nameOf]);

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

  return { view, effects, nameOf, act, seed: setup.seed };
}
