import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SUIT_NAMES, SUITS, type Card, type Suit } from '@ukbj/game-engine';
import { Button } from './Buttons';
import { CardFace } from './PlayingCard';
import { SuitIcon } from './SuitIcon';
import { colors, radius, serif, space } from './theme';

interface Props {
  ace: Card;
  onChoose: (suit: Suit) => void;
  onCancel: () => void;
}

/** Bottom sheet shown when an Ace joins the sequence: pick the suit play continues in. */
export function SuitPicker({ ace, onChoose, onCancel }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(140)} style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel choosing a suit" />
      <Animated.View entering={SlideInDown.duration(240)} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.head}>
          <CardFace card={ace} size="hand" />
          <View style={styles.headText}>
            <Text style={styles.title} accessibilityRole="header">
              Call a suit
            </Text>
            <Text style={styles.body}>Your Ace is wild. Play continues in the suit you choose.</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {SUITS.map((suit) => (
            <Pressable
              key={suit}
              onPress={() => onChoose(suit)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${SUIT_NAMES[suit]}`}
              style={({ pressed }) => [styles.suit, pressed && styles.suitPressed]}
            >
              <SuitIcon suit={suit} size={38} colour={suit === 'H' || suit === 'D' ? colors.redSoft : colors.text} />
              <Text style={styles.suitName}>{SUIT_NAMES[suit]}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Cancel" variant="ghost" compact onPress={onCancel} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 14, 12, 0.66)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xl,
    paddingBottom: space.xxl + 8,
    gap: space.lg,
  },
  head: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  headText: { flex: 1, gap: 4 },
  title: { fontFamily: serif, fontSize: 26, color: colors.text },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  suit: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.md,
  },
  suitPressed: { borderColor: colors.brass, backgroundColor: 'rgba(200,160,74,0.16)' },
  suitName: { color: colors.text, fontSize: 18, fontWeight: '600' },
});
