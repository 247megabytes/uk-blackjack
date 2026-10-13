import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import type { Card } from '@ukbj/game-engine';
import { cardName } from '../game';
import { SuitIcon, suitColour } from './SuitIcon';
import { cardSizes, colors, radius, serif, type CardSize } from './theme';

interface FaceProps {
  card: Card;
  size?: CardSize;
  dimmed?: boolean;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

const POWER_NOTE: Partial<Record<Card['rank'], string>> = { '2': '+2', '8': 'Skip', K: 'Reverse' };

function powerNote(card: Card): string | undefined {
  if (card.rank === 'J') return card.suit === 'S' || card.suit === 'C' ? '+5' : 'Block';
  return POWER_NOTE[card.rank];
}

/** An ivory card face: corner indices, a large centre pip, and a tiny power hint on power cards. */
export const CardFace = memo(function CardFace({ card, size = 'hand', dimmed, highlighted, style }: FaceProps) {
  const { width, height } = cardSizes[size];
  const tint = suitColour(card.suit);
  const scale = width / 64;
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const note = powerNote(card);

  return (
    <View
      accessible
      accessibilityLabel={cardName(card)}
      style={[
        styles.card,
        { width, height, borderRadius: radius.card * scale },
        highlighted && styles.highlighted,
        style,
      ]}
    >
      <View style={[styles.corner, { top: 4 * scale, left: 5 * scale }]}>
        <Text style={[styles.rank, { color: tint, fontSize: 17 * scale, lineHeight: 19 * scale }]}>{card.rank}</Text>
        <SuitIcon suit={card.suit} size={11 * scale} />
      </View>

      <View style={styles.centre} pointerEvents="none">
        {isCourt ? (
          <View style={[styles.court, { borderColor: tint, width: width * 0.46, height: height * 0.46, borderRadius: 4 * scale }]}>
            <Text style={[styles.courtLetter, { color: tint, fontSize: 22 * scale, lineHeight: 26 * scale }]}>{card.rank}</Text>
            <SuitIcon suit={card.suit} size={14 * scale} />
          </View>
        ) : (
          <SuitIcon suit={card.suit} size={30 * scale} />
        )}
      </View>

      <View style={[styles.corner, styles.cornerFlip, { bottom: 4 * scale, right: 5 * scale }]}>
        <Text style={[styles.rank, { color: tint, fontSize: 17 * scale, lineHeight: 19 * scale }]}>{card.rank}</Text>
        <SuitIcon suit={card.suit} size={11 * scale} />
      </View>

      {note && size !== 'mini' ? (
        <Text style={[styles.note, { fontSize: 8.5 * scale, bottom: 5 * scale, left: 6 * scale }]}>{note}</Text>
      ) : null}

      {dimmed ? <View style={[StyleSheet.absoluteFill, styles.dim, { borderRadius: radius.card * scale }]} /> : null}
    </View>
  );
});

/** Card back: deep green with a brass lattice. */
export const CardBack = memo(function CardBack({ size = 'hand', style }: { size?: CardSize; style?: StyleProp<ViewStyle> }) {
  const { width, height } = cardSizes[size];
  const r = (radius.card * width) / 64;
  const inset = Math.max(2, width * 0.06);
  return (
    <View style={[styles.back, { width, height, borderRadius: r }, style]} accessibilityLabel="Face-down card">
      <Svg width={width - inset * 2} height={height - inset * 2}>
        <Defs>
          <Pattern id="lattice" x={0} y={0} width={10} height={10} patternUnits="userSpaceOnUse">
            <Path d="M0 5 L5 0 L10 5 L5 10 Z" fill="none" stroke={colors.brassDeep} strokeWidth={0.9} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" rx={Math.max(1, r - inset)} fill={colors.baizeDeep} />
        <Rect x={0} y={0} width="100%" height="100%" rx={Math.max(1, r - inset)} fill="url(#lattice)" />
        <Rect x={1} y={1} width={width - inset * 2 - 2} height={height - inset * 2 - 2} rx={Math.max(1, r - inset)} fill="none" stroke={colors.brass} strokeWidth={1} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ivory,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  highlighted: {
    borderColor: colors.brass,
    borderWidth: 2,
  },
  corner: { position: 'absolute', alignItems: 'center' },
  cornerFlip: { transform: [{ rotate: '180deg' }] },
  rank: { fontFamily: serif, fontWeight: '700' },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  court: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(200,160,74,0.10)' },
  courtLetter: { fontFamily: serif, fontWeight: '700' },
  note: { position: 'absolute', color: colors.brassDeep, fontWeight: '700' },
  dim: { backgroundColor: 'rgba(20, 28, 25, 0.42)' },
  back: {
    backgroundColor: colors.ivoryShade,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
