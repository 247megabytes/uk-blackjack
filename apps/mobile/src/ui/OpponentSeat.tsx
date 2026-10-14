import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import type { PublicPlayer } from '@ukbj/game-engine';
import { initials, ordinal } from '../game';
import { CardBack } from './PlayingCard';
import { colors, radius } from './theme';

interface Props {
  player: PublicPlayer;
  colour: string;
  isTurn: boolean;
  /** True while this player is on one card without having declared (catchable). */
  catchable: boolean;
  flash: boolean;
}

const AVATAR = 46;

export function OpponentSeat({ player, colour, isTurn, catchable, flash }: Props) {
  const glow = useSharedValue(0);
  const bump = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (isTurn) glow.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.35, { duration: 650 })), -1, false);
    else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
    }
  }, [isTurn, glow]);

  useEffect(() => {
    bump.value = withSequence(withTiming(1.18, { duration: 120 }), withTiming(1, { duration: 180 }));
  }, [player.cardCount, bump]);

  useEffect(() => {
    if (flash) shake.value = withSequence(withTiming(-5, { duration: 50 }), withTiming(5, { duration: 70 }), withTiming(-3, { duration: 60 }), withTiming(0, { duration: 50 }));
  }, [flash, shake]);

  const ringStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const fan = Math.min(player.cardCount, 5);
  const state = isTurn ? ', their turn' : '';
  const lastCard = player.cardCount === 1 ? (player.declaredLastCard ? ', on last card' : ', on one card, not declared') : '';
  const finished = player.status === 'finished';
  const left = player.status === 'forfeited';
  const label = finished
    ? `${player.name}, finished ${ordinal(player.place ?? 0)} this round`
    : left
      ? `${player.name}, left the game`
      : `${player.name}, ${player.cardCount} ${player.cardCount === 1 ? 'card' : 'cards'}${lastCard}${state}`;

  return (
    <Animated.View style={[styles.seat, shakeStyle, left && styles.seatLeft]} accessible accessibilityLabel={label}>
      <View style={styles.avatarWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <View style={[styles.avatar, { backgroundColor: colour }]}>
          <Text style={styles.initials}>{initials(player.name)}</Text>
        </View>
        {player.status === 'active' ? (
          <Animated.View style={[styles.count, player.cardCount === 1 && styles.countHot, countStyle]}>
            <Text style={[styles.countText, player.cardCount === 1 && styles.countTextHot]}>{player.cardCount}</Text>
          </Animated.View>
        ) : null}
      </View>
      <Text style={[styles.name, isTurn && styles.nameTurn]} numberOfLines={1}>
        {player.name}
      </Text>
      <View style={styles.fan}>
        {Array.from({ length: fan }, (_, i) => (
          <CardBack key={i} size="mini" style={{ marginLeft: i === 0 ? 0 : -12, transform: [{ rotate: `${(i - (fan - 1) / 2) * 7}deg` }] }} />
        ))}
      </View>
      {finished ? (
        <Text style={[styles.badge, styles.badgeDone]}>{`${ordinal(player.place ?? 0)} · out`}</Text>
      ) : left ? (
        <Text style={[styles.badge, styles.badgeLeft]}>Left</Text>
      ) : player.cardCount === 1 ? (
        <Text style={[styles.badge, catchable ? styles.badgeCatch : styles.badgeSafe]}>{catchable ? 'Forgot!' : 'Last card'}</Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  seat: { width: 84, alignItems: 'center' },
  avatarWrap: { width: AVATAR + 10, height: AVATAR + 10, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: AVATAR + 10,
    height: AVATAR + 10,
    borderRadius: (AVATAR + 10) / 2,
    borderWidth: 3,
    borderColor: colors.brassBright,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  initials: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  count: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.chrome,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countHot: { backgroundColor: colors.red, borderColor: colors.redSoft },
  countText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  countTextHot: { color: '#FFF6F2' },
  name: { marginTop: 3, color: colors.textMuted, fontSize: 13, fontWeight: '600', maxWidth: 84 },
  nameTurn: { color: colors.brassBright },
  fan: { flexDirection: 'row', marginTop: 4, height: 30, alignItems: 'center' },
  badge: { marginTop: 2, fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  badgeSafe: { color: colors.ink, backgroundColor: colors.brass },
  badgeCatch: { color: '#FFF6F2', backgroundColor: colors.red },
  badgeDone: { color: colors.ink, backgroundColor: colors.win },
  badgeLeft: { color: colors.text, backgroundColor: colors.surfaceRaised },
  seatLeft: { opacity: 0.5 },
});
