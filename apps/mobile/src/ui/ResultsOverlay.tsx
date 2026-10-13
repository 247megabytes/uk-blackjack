import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import type { PlayerView } from '@ukbj/game-engine';
import { standings } from '../game';
import type { Stats } from '../state/settings';
import { Button } from './Buttons';
import { colors, radius, serif, space } from './theme';

interface Props {
  view: PlayerView;
  stats: Stats;
  onRematch: () => void;
  onChangeTable: () => void;
  onHome: () => void;
}

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function ResultsOverlay({ view, stats, onRematch, onChangeTable, onHome }: Props) {
  const won = view.winnerId !== null && view.winnerId === view.viewerId;
  const winner = view.players.find((p) => p.id === view.winnerId);
  const headline =
    view.endReason === 'stalemate'
      ? winner ? `Stalemate — ${winner.id === view.viewerId ? 'you take it' : `${winner.name} takes it`}` : 'Stalemate — a draw'
      : won ? 'You win!' : `${winner?.name ?? 'Someone'} wins`;
  const sub = won
    ? stats.currentStreak > 1 ? `${stats.currentStreak} wins in a row` : 'Cleanly out of cards'
    : 'Shuffle up and go again';
  const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.scrim}>
      <Animated.View entering={SlideInDown.duration(320)} style={styles.sheet} accessibilityViewIsModal>
        <Text style={[styles.headline, won && styles.headlineWin]} accessibilityRole="header">
          {headline}
        </Text>
        <Text style={styles.sub}>{sub}</Text>

        <View style={styles.table}>
          {standings(view).map((s) => (
            <View key={s.playerId} style={[styles.row, s.playerId === view.viewerId && styles.rowYou]}>
              <Text style={styles.place}>{PLACE[s.place - 1] ?? `${s.place}th`}</Text>
              <Text style={styles.who} numberOfLines={1}>
                {s.playerId === view.viewerId ? `${s.name} (you)` : s.name}
              </Text>
              <Text style={styles.left}>{s.cardsLeft === 0 ? 'Out' : `${s.cardsLeft} left`}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stats}>
          <Stat value={stats.played} label="Played" />
          <Stat value={stats.won} label="Won" />
          <Stat value={`${rate}%`} label="Win rate" />
          <Stat value={stats.bestStreak} label="Best streak" />
        </View>

        <Button label="Rematch" onPress={onRematch} />
        <View style={styles.secondary}>
          <Button label="Change table" variant="secondary" compact onPress={onChangeTable} style={styles.flex} />
          <Button label="Home" variant="secondary" compact onPress={onHome} style={styles.flex} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headline: { fontFamily: serif, fontSize: 32, lineHeight: 38, color: colors.text, textAlign: 'center' },
  headlineWin: { color: colors.brassBright },
  sub: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: -4 },
  table: { marginTop: space.sm, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: space.lg, backgroundColor: colors.surfaceRaised, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowYou: { backgroundColor: 'rgba(200,160,74,0.14)' },
  place: { width: 44, color: colors.brass, fontFamily: serif, fontSize: 16, fontWeight: '700' },
  who: { flex: 1, color: colors.text, fontSize: 16 },
  left: { color: colors.textMuted, fontSize: 14 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  secondary: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
});
