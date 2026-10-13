import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import type { PlayerId } from '@ukbj/game-engine';
import { pickBanner, type EffectTone, type TableEffect } from '../game';
import { colors, radius, serif } from './theme';

const TONE: Record<EffectTone, { bg: string; border: string; text: string }> = {
  attack: { bg: colors.red, border: colors.redSoft, text: '#FFF6F2' },
  defend: { bg: colors.baize, border: colors.brass, text: colors.text },
  info: { bg: colors.surfaceRaised, border: colors.hairline, text: colors.text },
  warn: { bg: colors.brass, border: colors.brassBright, text: colors.ink },
  win: { bg: colors.brass, border: colors.brassBright, text: colors.ink },
};

interface Props {
  effects: TableEffect[];
  /** Player whose Last Card window is open, if any. Window prompts vanish when it closes. */
  windowPlayerId: PlayerId | null;
}

/**
 * Shows the most important effect of the latest batch. A newer batch replaces the
 * current banner immediately, so the banner always describes what just happened.
 */
export function EffectBanner({ effects, windowPlayerId }: Props) {
  const [current, setCurrent] = useState<TableEffect | null>(null);

  useEffect(() => {
    const next = pickBanner(effects.filter((e) => e.tone !== 'win'));
    if (next) setCurrent(next);
  }, [effects]);

  useEffect(() => {
    if (!current) return;
    if (current.windowFor) return; // lives exactly as long as its window (below)
    const t = setTimeout(() => setCurrent((c) => (c === current ? null : c)), 1400);
    return () => clearTimeout(t);
  }, [current]);

  useEffect(() => {
    if (current?.windowFor && current.windowFor !== windowPlayerId) setCurrent(null);
  }, [current, windowPlayerId]);

  if (!current) return null;
  const tone = TONE[current.tone];
  return (
    <Animated.View
      key={current.key}
      entering={ZoomIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}
      pointerEvents="none"
      accessibilityLiveRegion="assertive"
    >
      <Text style={[styles.title, { color: tone.text }]}>{current.title}</Text>
      {current.subtitle ? <Text style={[styles.subtitle, { color: tone.text }]}>{current.subtitle}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.sheet,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    maxWidth: 320,
  },
  title: { fontFamily: serif, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});
