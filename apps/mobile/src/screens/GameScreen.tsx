import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Card, CardPlay, MoveIntent, Suit } from '@ukbj/game-engine';
import {
  AVATAR_COLOURS,
  addAce,
  buildPlay,
  canArmLastCard,
  hasMove,
  HUMAN_ID,
  isHumanTurn,
  LAST_CARD_REMINDER,
  lastPlay,
  lastTurnCards,
  opponentSeats,
  selectableCardIds,
  selectionState,
  statusLine,
  tapCard,
  type MatchSetup,
  type TableEffect,
} from '../game';
import { haptic, tapHaptic } from '../state/haptics';
import { useSettings } from '../state/settings';
import { useMatch } from '../state/useMatch';
import { Button, IconButton } from '../ui/Buttons';
import { EffectBanner } from '../ui/EffectBanner';
import { Felt } from '../ui/Felt';
import { Hand } from '../ui/Hand';
import { BellIcon, CloseIcon, DirectionIcon } from '../ui/Icons';
import { OpponentSeat } from '../ui/OpponentSeat';
import { ActiveSuitChip, AttackChip, DiscardPile, DrawPile, type Origin } from '../ui/Piles';
import { SequenceTray } from '../ui/SequenceTray';
import { SuitPicker } from '../ui/SuitPicker';
import { ResultsOverlay } from '../ui/ResultsOverlay';
import { ChampionOverlay, RoundResultsOverlay, TournamentProgress } from '../ui/Knockouts';
import { colors, radius, serif, space } from '../ui/theme';

interface Props {
  setup: MatchSetup;
  onRematch: () => void;
  onChangeTable: () => void;
  onExit: () => void;
}

const OPPONENTS_HEIGHT = 178;

export function GameScreen({ setup, onRematch, onChangeTable, onExit }: Props) {
  const { settings, stats, recordResult } = useSettings();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tableWidth = Math.min(width, 560);

  const onEffects = useCallback(
    (fx: TableEffect[]) => {
      const strongest = fx.find((f) => f.haptic === 'error' || f.haptic === 'heavy') ?? fx[fx.length - 1];
      if (strongest) haptic(strongest.haptic, settings.haptics);
    },
    [settings.haptics],
  );
  const { view, tournament, effects, nameOf, act, nextRound, skip, humanActive, humanEliminated } = useMatch(setup, settings.pacing, onEffects);
  const knockouts = tournament !== null;
  const youId = HUMAN_ID;

  const [armed, setArmed] = useState(false);
  const [selection, setSelection] = useState<CardPlay[]>([]);
  const [pendingAce, setPendingAce] = useState<Card | null>(null);
  const [rejected, setRejected] = useState<{ cardId: string; nonce: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const recorded = useRef<string | null>(null);

  const yourTurn = isHumanTurn(view);
  const playable = useMemo(() => selectableCardIds(view, selection), [view, selection]);
  const selState = useMemo(() => selectionState(view, selection), [view, selection]);
  const opponents = useMemo(() => view.players.filter((p) => p.id !== view.viewerId), [view.players, view.viewerId]);
  const seats = opponentSeats(opponents.length);

  // Any state change (a play, a draw, a bot move) clears the half-built sequence.
  useEffect(() => {
    setSelection([]);
    setPendingAce(null);
  }, [view.version, view.gameId]);
  // Disarm Last Card whenever the hand, turn or selection changes what it would apply to.
  useEffect(() => setArmed(false), [view.hand.length, view.currentPlayerId, selection.length]);

  // Record the result once, then reveal the results sheet after the final card lands.
  // Classic: the game is the match. Knockouts: round results after each round, the
  // champion celebration once the tournament is complete.
  const matchOver = knockouts ? tournament.phase === 'complete' : view.phase === 'finished';
  const roundOver = knockouts && tournament.phase === 'roundOver';
  useEffect(() => {
    if (!matchOver && !roundOver) {
      setShowResults(false);
      return;
    }
    if (matchOver && recorded.current !== setup.seed) {
      recorded.current = setup.seed;
      recordResult(knockouts ? tournament.championId === HUMAN_ID : view.winnerId === view.viewerId, knockouts ? 'knockouts' : 'classic');
    }
    const t = setTimeout(() => setShowResults(true), 1100);
    return () => clearTimeout(t);
  }, [matchOver, roundOver, view.gameId, setup.seed, knockouts, tournament?.championId, view.winnerId, view.viewerId, recordResult]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 1800);
    return () => clearTimeout(t);
  }, [hint]);

  const send = useCallback(
    (move: MoveIntent) => {
      const err = act(move);
      if (err) setHint(err.message);
      else tapHaptic(settings.haptics);
    },
    [act, settings.haptics],
  );

  const onTap = useCallback(
    (card: Card) => {
      const r = tapCard(view, selection, card);
      if (r.kind === 'rejected') {
        setRejected({ cardId: card.id, nonce: Date.now() });
        haptic('warning', settings.haptics);
        setHint(r.reason);
        return;
      }
      tapHaptic(settings.haptics);
      if (r.kind === 'chooseSuit') setPendingAce(r.card);
      else setSelection(r.selection);
    },
    [view, selection, settings.haptics],
  );

  const onChooseSuit = useCallback(
    (suit: Suit) => {
      if (!pendingAce) return;
      setSelection((sel) => addAce(sel, pendingAce, suit));
      setPendingAce(null);
      tapHaptic(settings.haptics);
    },
    [pendingAce, settings.haptics],
  );

  const onPlaySelection = useCallback(() => {
    const move = buildPlay(view, selection, armed);
    if (!move) {
      haptic('warning', settings.haptics);
      if (selState.kind === 'invalid') setHint(selState.error.message);
      else if (selState.kind === 'ready' && selState.needsLastCard) setHint(LAST_CARD_REMINDER);
      return;
    }
    send(move);
  }, [view, selection, armed, send, selState, settings.haptics]);

  // Discard animation origin: from your hand, or from the opponent's seat.
  const play = lastPlay(view);
  const origin: Origin = useMemo(() => {
    if (!play || play.playerId === view.viewerId) return { x: 0, y: Math.min(300, height * 0.34) };
    const idx = opponents.findIndex((p) => p.id === play.playerId);
    const seat = seats[idx];
    if (!seat) return { x: 0, y: -200 };
    return { x: (seat.x - 0.5) * tableWidth, y: -(OPPONENTS_HEIGHT * (1 - seat.y) + 70) };
  }, [play, view.viewerId, opponents, seats, tableWidth, height]);

  const choosing = selection.length > 0;
  const canDraw = yourTurn && !choosing && hasMove(view, 'DRAW');
  const canDeclare = hasMove(view, 'DECLARE_LAST_CARD');
  const canArm = canArmLastCard(view, selection);
  const sequence = lastTurnCards(view);
  const challenge = view.legalMoves.find((m) => m.type === 'CHALLENGE_LAST_CARD');
  const drawLabel = view.pendingAttack ? `Pick up ${view.pendingAttack.amount}` : 'Draw';

  return (
    <View style={styles.root}>
      <Felt />
      <View style={[styles.column, { paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 12), width: tableWidth }]}>
        {/* Header */}
        <View style={styles.header}>
          <IconButton label="Leave game" onPress={() => setConfirmExit(true)}>
            <CloseIcon />
          </IconButton>
          {tournament ? (
            <TournamentProgress tournament={tournament} nameOf={nameOf} />
          ) : (
            <Text style={styles.turn} accessibilityRole="text">
              Turn {view.turnNumber}
            </Text>
          )}
          <View style={styles.direction} accessible accessibilityLabel={view.direction === 1 ? 'Play is clockwise' : 'Play is anticlockwise'}>
            <DirectionIcon clockwise={view.direction === 1} />
          </View>
        </View>

        {/* Opponents */}
        <View style={styles.opponents}>
          {opponents.map((p, i) => {
            const seat = seats[i]!;
            return (
              <View key={p.id} style={[styles.seat, { left: seat.x * tableWidth - 42, top: seat.y * (OPPONENTS_HEIGHT - 128) }]}>
                <OpponentSeat
                  player={p}
                  colour={AVATAR_COLOURS[(p.seat - 1 + AVATAR_COLOURS.length) % AVATAR_COLOURS.length]!}
                  isTurn={view.currentPlayerId === p.id && view.phase !== 'finished'}
                  catchable={view.lastCardWindowPlayerId === p.id}
                  flash={effects.some((e) => e.playerId === p.id && (e.tone === 'attack' || e.tone === 'warn'))}
                />
              </View>
            );
          })}
        </View>

        {/* Centre: piles, attack chip, banners */}
        <View style={styles.centre}>
          <View style={styles.attackRow}>
            {view.pendingAttack ? <AttackChip attack={view.pendingAttack} /> : <ActiveSuitChip suit={view.activeSuit} />}
          </View>
          <View style={styles.piles}>
            <DrawPile count={view.drawPileCount} enabled={canDraw} onDraw={() => send({ type: 'DRAW' })} label={canDraw ? drawLabel : 'Draw pile'} />
            <DiscardPile top={view.topCard} sequence={sequence} origin={origin} playKey={play?.version ?? 0} />
          </View>
          <View style={styles.bannerLayer} pointerEvents="none">
            <EffectBanner effects={effects} windowPlayerId={view.lastCardWindowPlayerId} />
          </View>
        </View>

        {/* Status + actions */}
        <View style={styles.statusRow}>
          {hint ? (
            <Animated.Text key={hint} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[styles.status, styles.hint]}>
              {hint}
            </Animated.Text>
          ) : (
            <Text style={[styles.status, yourTurn && styles.statusTurn]} accessibilityLiveRegion="polite">
              {statusLine(view, nameOf)}
            </Text>
          )}
        </View>

        <SequenceTray selection={selection} hand={view.hand} state={selState} armed={armed} onPlay={onPlaySelection} onClear={() => setSelection([])} />

        <View style={styles.actions}>
          {canDraw ? (
            <Button
              label={drawLabel}
              variant={view.pendingAttack ? 'danger' : 'secondary'}
              compact
              onPress={() => send({ type: 'DRAW' })}
              accessibilityHint={view.pendingAttack ? 'Takes the penalty and ends your turn' : 'Draws one card'}
            />
          ) : null}
          {canDeclare || canArm ? (
            <LastCardButton
              armed={armed}
              urgent={(canDeclare && view.lastCardWindowPlayerId === view.viewerId) || (selState.kind === 'ready' && selState.needsLastCard && !armed)}
              onPress={() => {
                if (canDeclare) send({ type: 'DECLARE_LAST_CARD' });
                else {
                  setArmed((a) => !a);
                  tapHaptic(settings.haptics);
                }
              }}
            />
          ) : null}
          {challenge && challenge.type === 'CHALLENGE_LAST_CARD' ? (
            <Button label={`Catch ${nameOf(challenge.targetPlayerId)}`} variant="danger" compact onPress={() => send(challenge)} />
          ) : null}
          {knockouts && !humanActive && tournament.phase === 'playing' && view.phase !== 'finished' ? (
            <Button
              label={humanEliminated ? 'Skip to champion' : 'Skip to results'}
              variant="secondary"
              compact
              onPress={() => skip(humanEliminated)}
              accessibilityHint="Plays the rest instantly"
            />
          ) : null}
        </View>

        {/* Your hand */}
        <View style={[styles.handArea, yourTurn && styles.handAreaTurn]}>
          <Hand
            cards={view.hand}
            playable={playable}
            selection={selection.map((p) => p.cardId)}
            showHints={yourTurn && (settings.highlightPlayable || choosing)}
            drawnCardId={view.drawnCardId}
            rejected={rejected}
            width={tableWidth}
            onTap={onTap}
          />
        </View>
      </View>

      {pendingAce ? <SuitPicker ace={pendingAce} onChoose={onChooseSuit} onCancel={() => setPendingAce(null)} /> : null}

      {showResults && !knockouts ? (
        <ResultsOverlay view={view} stats={stats} onRematch={onRematch} onChangeTable={onChangeTable} onHome={onExit} />
      ) : null}
      {showResults && knockouts && roundOver ? (
        <RoundResultsOverlay
          tournament={tournament}
          youId={youId}
          nameOf={nameOf}
          eliminated={humanEliminated}
          onNext={nextRound}
          onSkip={() => skip(true)}
          onHome={onExit}
        />
      ) : null}
      {showResults && knockouts && matchOver ? (
        <ChampionOverlay tournament={tournament} youId={youId} nameOf={nameOf} stats={stats} onRematch={onRematch} onChangeTable={onChangeTable} onHome={onExit} />
      ) : null}

      {confirmExit ? (
        <Animated.View entering={FadeIn.duration(150)} style={styles.scrim}>
          <View style={styles.confirm} accessibilityViewIsModal>
            <Text style={styles.confirmTitle}>{knockouts ? 'Leave the Knockouts?' : 'Leave this game?'}</Text>
            <Text style={styles.confirmBody}>It will count as unfinished and won’t affect your stats.</Text>
            <Button label="Keep playing" onPress={() => setConfirmExit(false)} />
            <Button label="Leave game" variant="secondary" onPress={onExit} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function LastCardButton({ armed, urgent, onPress }: { armed: boolean; urgent: boolean; onPress: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (urgent) pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 260 }), withTiming(1, { duration: 260 })), -1, false);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 120 });
    }
  }, [urgent, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const active = armed || urgent;
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={urgent ? 'Say Last Card now' : armed ? 'Last Card is set for your next play' : 'Say Last Card with your next play'}
        accessibilityState={{ selected: armed }}
        style={({ pressed }) => [styles.bell, active ? styles.bellActive : styles.bellIdle, pressed && { opacity: 0.85 }]}
      >
        <BellIcon colour={active ? colors.ink : colors.brass} />
        <Text style={[styles.bellText, { color: active ? colors.ink : colors.brass }]}>{armed && !urgent ? 'Last Card set' : 'Last Card'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome, alignItems: 'center' },
  column: { flex: 1 },
  header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md },
  turn: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  direction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25, 28, 27, 0.55)',
  },
  opponents: { height: OPPONENTS_HEIGHT, position: 'relative' },
  seat: { position: 'absolute' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 170 },
  attackRow: { height: 40, justifyContent: 'center' },
  piles: { flexDirection: 'row', gap: 28, alignItems: 'center' },
  bannerLayer: { position: 'absolute', left: 0, right: 0, top: -8, alignItems: 'center' },
  statusRow: { minHeight: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  status: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  statusTurn: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.brassBright, fontWeight: '600' },
  actions: { minHeight: 58, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, flexWrap: 'wrap' },
  handArea: { paddingTop: 2, borderTopWidth: 1, borderTopColor: 'transparent' },
  handAreaTurn: { borderTopColor: colors.baizeLine },
  bell: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radius.button, borderWidth: 1.5 },
  bellIdle: { borderColor: colors.brass, backgroundColor: 'rgba(200,160,74,0.10)' },
  bellActive: { borderColor: colors.brassBright, backgroundColor: colors.brass },
  bellText: { fontFamily: serif, fontSize: 16, fontWeight: '700' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 14, 12, 0.72)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  confirm: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.sheet, padding: space.xl, gap: space.md, borderWidth: 1, borderColor: colors.hairline },
  confirmTitle: { fontFamily: serif, fontSize: 24, color: colors.text },
  confirmBody: { color: colors.textMuted, fontSize: 15, lineHeight: 21, marginBottom: space.sm },
});
