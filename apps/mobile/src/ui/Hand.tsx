import { memo, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { Card } from '@ukbj/game-engine';
import { cardName, fanAngle, handLayout, handRows, sortHand } from '../game';
import { CardFace } from './PlayingCard';
import { cardSizes, colors } from './theme';

const { width: CW, height: CH } = cardSizes.hand;
const ROW_OFFSET = Math.round(CH * 0.52);
const TOP_PAD = 22;

interface HandProps {
  cards: readonly Card[];
  /** Cards that can be tapped next (start or extend the sequence). */
  playable: ReadonlySet<string>;
  /** Cards already chosen for this turn, in play order. */
  selection: readonly string[];
  /** Highlight playable cards and dim the rest (only meaningful on your turn). */
  showHints: boolean;
  /** The card just drawn this turn (shown raised). */
  drawnCardId: string | null;
  /** Bumped to make a card shake after an illegal tap. */
  rejected: { cardId: string; nonce: number } | null;
  width: number;
  onTap: (card: Card) => void;
}

interface Placed {
  card: Card;
  left: number;
  top: number;
  angle: number;
}

/**
 * The local player's hand, sorted by suit and rank. Fans in one row, folds into two
 * rows when crowded, and scrolls only for very large hands. Tapping builds the turn's
 * sequence: chosen cards rise and show their order; the next legal cards are lit.
 */
export function Hand({ cards, playable, selection, showHints, drawnCardId, rejected, width, onTap }: HandProps) {
  const available = Math.max(CW, width - 20);
  const { placed, boxWidth, boxHeight, scroll } = useMemo(() => {
    const sorted = sortHand(cards);
    let rows = handRows(sorted.length, available, CW);
    const tooBig = rows.length === 2 && handLayout(rows[0]!, available, CW).scroll;
    if (tooBig) rows = [sorted.length];
    const out: Placed[] = [];
    let index = 0;
    let maxWidth = 0;
    rows.forEach((count, r) => {
      const layout = handLayout(count, available, CW);
      maxWidth = Math.max(maxWidth, layout.width);
      const offset = layout.scroll ? 0 : (available - layout.width) / 2;
      for (let i = 0; i < count; i++) {
        const angle = layout.scroll ? 0 : fanAngle(i, count, rows.length > 1 ? 8 : 14);
        out.push({ card: sorted[index++]!, left: offset + i * layout.step, top: TOP_PAD + r * ROW_OFFSET + Math.abs(angle) * 0.7, angle });
      }
    });
    return { placed: out, boxWidth: tooBig ? maxWidth : available, boxHeight: TOP_PAD + CH + 6 + (rows.length - 1) * ROW_OFFSET, scroll: tooBig };
  }, [cards, available]);

  const inner = (
    <View style={{ width: boxWidth, height: boxHeight }}>
      {placed.map((p) => (
        <HandCard
          key={p.card.id}
          {...p}
          playable={playable.has(p.card.id)}
          order={selection.indexOf(p.card.id)}
          showHints={showHints}
          raised={p.card.id === drawnCardId}
          shakeNonce={rejected && rejected.cardId === p.card.id ? rejected.nonce : 0}
          onTap={onTap}
        />
      ))}
    </View>
  );
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {inner}
      </ScrollView>
    );
  }
  return <View style={styles.centre}>{inner}</View>;
}

interface CardProps extends Placed {
  playable: boolean;
  /** Position in the selected sequence, or -1. */
  order: number;
  showHints: boolean;
  raised: boolean;
  shakeNonce: number;
  onTap: (card: Card) => void;
}

const HandCard = memo(function HandCard({ card, left, top, angle, playable, order, showHints, raised, shakeNonce, onTap }: CardProps) {
  const lift = useSharedValue(0);
  const shake = useSharedValue(0);
  const selected = order >= 0;
  const target = selected ? -34 : raised ? -22 : showHints && playable ? -12 : 0;

  useEffect(() => {
    lift.value = withSpring(target, { damping: 14, stiffness: 180 });
  }, [target, lift]);

  useEffect(() => {
    if (shakeNonce) shake.value = withSequence(withTiming(-7, { duration: 45 }), withTiming(7, { duration: 70 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 45 }));
  }, [shakeNonce, shake]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { translateX: shake.value }, { rotate: `${angle}deg` }],
  }));

  return (
    <Animated.View entering={FadeInUp.duration(260)} layout={LinearTransition.duration(220)} style={[styles.card, { left, top }, style]}>
      <Pressable
        onPress={() => onTap(card)}
        accessibilityRole="button"
        accessibilityLabel={`${cardName(card)}${selected ? `, selected ${order + 1}` : playable ? ', playable' : ''}`}
        accessibilityHint={selected ? 'Removes this card and any after it' : playable ? 'Adds this card to your play' : undefined}
        accessibilityState={{ selected }}
      >
        <CardFace card={card} size="hand" highlighted={selected || (showHints && playable)} dimmed={showHints && !playable && !selected} />
        {selected ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{order + 1}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  centre: { alignItems: 'center' },
  scroll: { paddingHorizontal: 10 },
  card: { position: 'absolute' },
  badge: {
    position: 'absolute',
    top: -9,
    right: -7,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    backgroundColor: colors.brassBright,
    borderWidth: 2,
    borderColor: colors.chrome,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.ink, fontWeight: '800', fontSize: 13 },
});
