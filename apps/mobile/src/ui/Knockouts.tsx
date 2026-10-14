import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import type { PlayerId, Suit, TournamentView } from '@ukbj/game-engine';
import { finalStandings, progressLabel, progressPips, roundHeadline, roundRows } from '../game';
import type { Stats } from '../state/settings';
import { Button } from './Buttons';
import { SuitIcon } from './SuitIcon';
import { colors, radius, serif, space } from './theme';

// ---------------------------------------------------------------------------
// Header progress indicator
// ---------------------------------------------------------------------------

/** "Round 2 of 4" with one pip per entrant (filled = still in). */
export function TournamentProgress({ tournament, nameOf }: { tournament: TournamentView; nameOf: (id: PlayerId) => string }) {
  const pips = progressPips(tournament);
  const label = progressLabel(tournament);
  const alive = pips.filter((p) => p.alive).length;
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Knockouts, ${label}. ${alive} of ${pips.length} players still in: ${pips.filter((p) => p.alive).map((p) => nameOf(p.playerId)).join(', ')}`}
    >
      <Text style={[styles.progressLabel, tournament.finalRound && styles.progressFinal]}>{label}</Text>
      <View style={styles.pips}>
        {pips.map((p) => (
          <View key={p.playerId} style={[styles.pip, p.alive ? styles.pipAlive : styles.pipOut]} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Round results
// ---------------------------------------------------------------------------

interface RoundResultsProps {
  tournament: TournamentView;
  youId: PlayerId;
  nameOf: (id: PlayerId) => string;
  /** The human is out of the tournament (watching from here on). */
  eliminated: boolean;
  onNext: () => void;
  onSkip: () => void;
  onHome: () => void;
}

export function RoundResultsOverlay({ tournament, youId, nameOf, eliminated, onNext, onSkip, onHome }: RoundResultsProps) {
  const summary = tournament.rounds[tournament.rounds.length - 1];
  if (!summary) return null;
  const rows = roundRows(summary, nameOf, youId, summary.final);
  const headline = roundHeadline(summary, youId, nameOf);
  const nextIsFinal = tournament.alive.length === 2;
  const nextLabel = nextIsFinal ? 'Play the final' : `Deal round ${tournament.round + 1}`;
  const youThrough = summary.advancing.includes(youId);

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.scrim}>
      <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet} accessibilityViewIsModal>
        <Text style={styles.kicker}>Round {summary.round} results</Text>
        <Text style={[styles.headline, youThrough && styles.headlineGood, !youThrough && summary.eliminated.some((e) => e.playerId === youId) && styles.headlineBad]} accessibilityRole="header">
          {headline}
        </Text>

        <View style={styles.table}>
          {rows.map((r, i) => (
            <Animated.View key={r.playerId} entering={FadeIn.delay(120 + i * 90).duration(200)} style={[styles.row, r.isYou && styles.rowYou]}>
              <Text style={[styles.place, r.kind === 'out' && styles.placeOut, r.kind === 'left' && styles.placeLeft]}>{r.label}</Text>
              <View style={styles.flex}>
                <Text style={styles.who} numberOfLines={1}>
                  {r.isYou ? `${r.name} (you)` : r.name}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {r.detail}
                </Text>
              </View>
              <Text style={[styles.tag, r.kind === 'safe' ? styles.tagSafe : styles.tagOut]}>{r.kind === 'safe' ? 'Through' : r.kind === 'left' ? 'Left' : 'Out'}</Text>
            </Animated.View>
          ))}
        </View>

        <Text style={styles.next}>
          {nextIsFinal ? `The final: ${tournament.alive.map(nameOf).join(' v ')}` : `${tournament.alive.length} players go through to round ${tournament.round + 1}`}
        </Text>

        {eliminated ? (
          <>
            <Button label={nextIsFinal ? 'Watch the final' : `Watch round ${tournament.round + 1}`} onPress={onNext} />
            <View style={styles.secondary}>
              <Button label="Skip to champion" variant="secondary" compact onPress={onSkip} style={styles.flex} />
              <Button label="Home" variant="secondary" compact onPress={onHome} style={styles.flex} />
            </View>
          </>
        ) : (
          <Button label={nextLabel} onPress={onNext} />
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Champion celebration
// ---------------------------------------------------------------------------

interface ChampionProps {
  tournament: TournamentView;
  youId: PlayerId;
  nameOf: (id: PlayerId) => string;
  stats: Stats;
  onRematch: () => void;
  onChangeTable: () => void;
  onHome: () => void;
}

const CONFETTI_SUITS: Suit[] = ['H', 'S', 'D', 'C'];

export function ChampionOverlay({ tournament, youId, nameOf, stats, onRematch, onChangeTable, onHome }: ChampionProps) {
  const youWon = tournament.championId === youId;
  const champion = tournament.championId ? nameOf(tournament.championId) : 'Nobody';
  const standings = finalStandings(tournament, nameOf, youId);
  const { width } = useWindowDimensions();

  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.scrim}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 18 }, (_, i) => (
          <Confetti key={i} index={i} width={width} suit={CONFETTI_SUITS[i % 4]!} />
        ))}
      </View>
      <Animated.View entering={SlideInDown.duration(380)} style={styles.sheet} accessibilityViewIsModal>
        <Animated.View entering={ZoomIn.delay(200).duration(420)} style={styles.trophy}>
          <Trophy />
        </Animated.View>
        <Text style={styles.kicker}>Knockouts champion</Text>
        <Text style={[styles.headline, styles.headlineGood]} accessibilityRole="header">
          {youWon ? 'You win the Knockouts!' : `${champion} is champion`}
        </Text>
        <Text style={styles.sub}>{youWon ? `Unbeaten through ${tournament.rounds.length} ${tournament.rounds.length === 1 ? 'round' : 'rounds'}` : 'Shuffle up and go again'}</Text>

        <View style={styles.table}>
          {standings.map((s) => (
            <View key={s.playerId} style={[styles.row, s.isYou && styles.rowYou]}>
              <Text style={[styles.place, s.place === 1 && styles.placeChamp]}>{s.place === 1 ? '★' : ordinalShort(s.place)}</Text>
              <Text style={[styles.who, styles.flex]} numberOfLines={1}>
                {s.isYou ? `${s.name} (you)` : s.name}
              </Text>
              <Text style={styles.detail}>{s.detail}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stats}>
          <Stat value={stats.tournaments} label="Knockouts played" />
          <Stat value={stats.championships} label="Titles" />
        </View>

        <Button label="New Knockouts" onPress={onRematch} />
        <View style={styles.secondary}>
          <Button label="Change table" variant="secondary" compact onPress={onChangeTable} style={styles.flex} />
          <Button label="Home" variant="secondary" compact onPress={onHome} style={styles.flex} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function ordinalShort(n: number): string {
  return ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** A falling, spinning suit — seeded by index so it is the same every time. */
function Confetti({ index, width, suit }: { index: number; width: number; suit: Suit }) {
  const fall = useSharedValue(0);
  const spin = useSharedValue(0);
  const { x, delay, duration, size } = useMemo(() => {
    const r = (k: number) => ((Math.sin(index * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return { x: r(1) * (width - 24), delay: r(2) * 1400, duration: 2600 + r(3) * 1800, size: 14 + Math.round(r(4) * 12) };
  }, [index, width]);

  useEffect(() => {
    fall.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.in(Easing.quad) }), -1, false));
    spin.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: duration / 2 }), withTiming(-1, { duration: duration / 2 })), -1, true));
  }, [fall, spin, delay, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: fall.value < 0.02 ? 0 : 1 - fall.value * 0.6,
    transform: [{ translateY: -40 + fall.value * 900 }, { rotate: `${spin.value * 40}deg` }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: 0 }, style]}>
      <SuitIcon suit={suit} size={size} colour={suit === 'H' || suit === 'D' ? colors.redSoft : colors.brassBright} />
    </Animated.View>
  );
}

function Trophy() {
  return (
    <View style={styles.trophyCup} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={styles.trophyStar}>★</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { alignItems: 'center', gap: 4 },
  progressLabel: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  progressFinal: { color: colors.brassBright, fontFamily: serif, fontSize: 16 },
  pips: { flexDirection: 'row', gap: 5 },
  pip: { width: 8, height: 8, borderRadius: 4 },
  pipAlive: { backgroundColor: colors.brass },
  pipOut: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.textFaint },

  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 14, 12, 0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xl,
    paddingBottom: space.xxl + 8,
    gap: space.md,
  },
  kicker: { color: colors.brass, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' },
  headline: { fontFamily: serif, fontSize: 30, lineHeight: 36, color: colors.text, textAlign: 'center' },
  headlineGood: { color: colors.brassBright },
  headlineBad: { color: colors.redSoft },
  sub: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: -4 },
  table: { marginTop: space.xs, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowYou: { backgroundColor: 'rgba(200,160,74,0.14)' },
  place: { width: 76, color: colors.brass, fontFamily: serif, fontSize: 16, fontWeight: '700' },
  placeChamp: { fontSize: 20, color: colors.brassBright },
  placeOut: { color: colors.redSoft },
  placeLeft: { color: colors.textFaint },
  who: { color: colors.text, fontSize: 16 },
  detail: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  tag: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  tagSafe: { color: colors.ink, backgroundColor: colors.win },
  tagOut: { color: '#FFF6F2', backgroundColor: colors.red },
  next: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  secondary: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space.xs },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  trophy: { alignSelf: 'center', marginTop: -56 },
  trophyCup: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brass,
    borderWidth: 3,
    borderColor: colors.brassBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyStar: { color: colors.ink, fontSize: 44, lineHeight: 50 },
});
