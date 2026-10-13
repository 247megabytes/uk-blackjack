import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseCard, type Card } from '@ukbj/game-engine';
import { useSettings } from '../state/settings';
import { Button } from '../ui/Buttons';
import { Felt } from '../ui/Felt';
import { CardFace } from '../ui/PlayingCard';
import { colors, serif, space } from '../ui/theme';

interface Props {
  onPlay: () => void;
  onRules: () => void;
  onSettings: () => void;
}

const HERO: { card: Card; angle: number; x: number }[] = [
  { card: parseCard('JC'), angle: -16, x: -46 },
  { card: parseCard('JH'), angle: 0, x: 0 },
  { card: parseCard('JS'), angle: 16, x: 46 },
];

/** The opening moment: three Jacks deal out into a fan, once. */
function HeroFan() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(150, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [t]);
  return (
    <View style={styles.hero} accessible accessibilityLabel="Jack of Clubs, Jack of Hearts and Jack of Spades">
      {HERO.map((h, i) => (
        <FanCard key={h.card.id} t={t} index={i} {...h} />
      ))}
    </View>
  );
}

function FanCard({ card, angle, x, t, index }: { card: Card; angle: number; x: number; t: { value: number }; index: number }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x * t.value },
      { translateY: Math.abs(angle) * 0.6 * t.value },
      { rotate: `${angle * t.value}deg` },
    ],
    zIndex: index === 1 ? 2 : 1,
  }));
  return (
    <Animated.View style={[styles.heroCard, style]}>
      <CardFace card={card} size="showcase" />
    </Animated.View>
  );
}

export function HomeScreen({ onPlay, onRules, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  const { stats } = useSettings();
  return (
    <View style={styles.root}>
      <Felt id="home-felt" />
      <View style={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: Math.max(insets.bottom, space.lg) + space.md }]}>
        <View style={styles.top}>
          <HeroFan />
          <Text style={styles.title} accessibilityRole="header">
            UK Black Jack
          </Text>
          <Text style={styles.tagline}>The pub card game of stacked Jacks and sudden reversals.</Text>
        </View>

        <View style={styles.actions}>
          <Button label="Play solo" onPress={onPlay} accessibilityHint="Choose opponents and start a game" />
          <Button label="How to play" variant="secondary" onPress={onRules} />
          <Button label="Settings" variant="secondary" onPress={onSettings} />
          <Text style={styles.record}>
            {stats.played === 0 ? 'Online rooms are coming in a later update.' : `Your record: ${stats.won} won of ${stats.played}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  top: { alignItems: 'center' },
  hero: { height: 150, width: 220, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  heroCard: { position: 'absolute' },
  title: { fontFamily: serif, fontSize: 44, lineHeight: 50, color: colors.text, textAlign: 'center' },
  tagline: { marginTop: space.sm, color: colors.textMuted, fontSize: 16, lineHeight: 22, textAlign: 'center', maxWidth: 300 },
  actions: { gap: space.md },
  record: { marginTop: space.xs, textAlign: 'center', color: colors.textFaint, fontSize: 13 },
});
