import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import type { Card, PendingAttack } from '@ukbj/game-engine';
import { discardTilt } from '../game';
import { CardBack, CardFace } from './PlayingCard';
import { cardSizes, colors, radius } from './theme';

const { width: CW, height: CH } = cardSizes.table;

export interface Origin {
  x: number;
  y: number;
}

interface DiscardProps {
  top: Card | null;
  /** Where the newest card was thrown from, relative to the pile centre. */
  origin: Origin;
  /** Changes whenever a new card lands (the play's state version). */
  playKey: number;
}

/**
 * The discard pile. When a new card lands it flies in from the player's seat and
 * settles with its own tilt, while the previous card stays visible underneath.
 */
export function DiscardPile({ top, origin, playKey }: DiscardProps) {
  const [under, setUnder] = useState<Card | null>(null);
  const prevTop = useRef<Card | null>(top);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(top ? discardTilt(top.id) : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!top) return;
    if (prevTop.current && prevTop.current.id !== top.id) {
      setUnder(prevTop.current);
      tx.value = origin.x;
      ty.value = origin.y;
      rot.value = origin.x * 0.08 + (origin.y > 0 ? -8 : 8);
      scale.value = origin.y > 0 ? 0.9 : 0.7;
      const ease = { duration: 300, easing: Easing.out(Easing.cubic) };
      tx.value = withTiming(0, ease);
      ty.value = withTiming(0, ease);
      rot.value = withTiming(discardTilt(top.id), ease);
      scale.value = withSequence(withTiming(1.06, { duration: 260 }), withSpring(1, { damping: 12 }));
    }
    prevTop.current = top;
    // Origin is read at the moment the card changes; it is not a trigger.
  }, [top?.id, playKey]);

  const flying = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${rot.value}deg` }, { scale: scale.value }],
  }));

  return (
    <View style={styles.slot} accessible accessibilityLabel={top ? 'Discard pile' : 'Empty discard pile'}>
      {under ? <CardFace card={under} size="table" style={[styles.abs, { transform: [{ rotate: `${discardTilt(under.id)}deg` }] }]} /> : null}
      {top ? (
        <Animated.View style={[styles.abs, flying]}>
          <CardFace card={top} size="table" />
        </Animated.View>
      ) : null}
    </View>
  );
}

interface DrawProps {
  count: number;
  enabled: boolean;
  onDraw: () => void;
  label: string;
}

/** The draw pile: tappable when drawing is legal, with a stacked-depth look and a count. */
export function DrawPile({ count, enabled, onDraw, label }: DrawProps) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = enabled ? withSequence(withTiming(1.05, { duration: 160 }), withTiming(1, { duration: 200 })) : 1;
  }, [enabled, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const depth = Math.min(4, Math.ceil(count / 8));

  return (
    <Pressable onPress={onDraw} disabled={!enabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }}>
      <Animated.View style={[styles.slot, style]}>
        {count === 0 ? (
          <View style={[styles.empty]}>
            <Text style={styles.emptyText}>Empty</Text>
          </View>
        ) : (
          Array.from({ length: depth }, (_, i) => (
            <CardBack key={i} size="table" style={[styles.abs, { top: -i * 1.5, left: -i * 1.5 }, enabled && i === depth - 1 && styles.ready]} />
          ))
        )}
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** "Pick up N" chip shown while an attack is pending. */
export function AttackChip({ attack }: { attack: PendingAttack | null }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = attack ? withSequence(withTiming(1.15, { duration: 140 }), withSpring(1, { damping: 10 })) : withTiming(0, { duration: 150 });
  }, [attack?.amount, attack, s]);
  const style = useAnimatedStyle(() => ({ opacity: s.value === 0 ? 0 : 1, transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.attack, style]} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.attackText}>
        {attack ? `${attack.kind === 'blackJack' ? 'Black Jack' : 'Twos'}: pick up ${attack.amount}` : ' '}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { width: CW, height: CH },
  abs: { position: 'absolute', top: 0, left: 0 },
  ready: { borderWidth: 2, borderColor: colors.brassBright },
  empty: {
    width: CW,
    height: CH,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.baizeLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: colors.textFaint, fontSize: 12 },
  countPill: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.chrome,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  countText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  attack: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    borderWidth: 1,
    borderColor: colors.redSoft,
  },
  attackText: { color: '#FFF6F2', fontWeight: '700', fontSize: 14 },
});
