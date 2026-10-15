import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { SUIT_NAMES, type Card, type CardPlay } from '@ukbj/game-engine';
import type { SelectionState } from '../game';
import { Button } from './Buttons';
import { CardFace } from './PlayingCard';
import { SuitIcon } from './SuitIcon';
import { colors, radius, space } from './theme';

interface Props {
  selection: readonly CardPlay[];
  hand: readonly Card[];
  state: SelectionState;
  /** Last Card is armed for this play. */
  armed: boolean;
  onPlay: () => void;
  onClear: () => void;
}

const SUIT_WORD = { H: 'heart', D: 'diamond', S: 'spade', C: 'club' } as const;

/**
 * Shows the cards chosen so far, in play order, with what will happen if they are
 * played: a Queen waiting for its cover, an Ace's called suit, the pick-up penalty for
 * an uncovered Queen, or why the sequence can't end here yet.
 */
export function SequenceTray({ selection, hand, state, armed, onPlay, onClear }: Props) {
  if (selection.length === 0) return null;
  const cards = selection.map((p) => ({ play: p, card: hand.find((c) => c.id === p.cardId)! })).filter((x) => x.card);
  const count = selection.length;

  let note: { text: string; tone: 'ok' | 'warn' | 'bad' };
  if (state.kind === 'needsCover') note = { text: `Cover the Queen with a ${SUIT_WORD[state.suit]}`, tone: 'warn' };
  else if (state.kind === 'invalid') note = { text: state.error.message, tone: 'bad' };
  else if (state.kind === 'ready' && state.needsLastCard && !armed) note = { text: 'Tap Last Card first to play out your hand', tone: 'warn' };
  else if (state.kind === 'ready' && state.wins) note = { text: 'Winning play — this empties your hand', tone: 'ok' };
  else if (state.kind === 'ready' && state.blockedFinish) note = { text: 'Can’t win on a power card — it still takes effect, then you pick up 1', tone: 'warn' };
  else if (state.kind === 'ready' && state.outcome.effects.some((e) => e.kind === 'powerCovered')) note = { text: 'Your covered power card won’t take effect', tone: 'warn' };
  else if (state.kind === 'ready' && state.queenPenalty) note = { text: 'No card to cover the Queen — you’ll pick up 1 and your turn ends', tone: 'warn' };
  else if (state.kind === 'ready' && state.outcome.attack) note = { text: `Next player picks up ${state.outcome.attack.amount} unless they answer`, tone: 'ok' };
  else if (state.kind === 'ready' && state.outcome.activeSuit) note = { text: `Calls ${SUIT_NAMES[state.outcome.activeSuit].toLowerCase()}`, tone: 'ok' };
  else note = { text: 'Add more cards, or play these', tone: 'ok' };

  const canPlay = state.kind === 'ready';
  const label =
    state.kind === 'ready' && (state.queenPenalty || state.blockedFinish)
      ? 'Play and pick up 1'
      : state.kind === 'ready' && state.wins
        ? 'Play to win'
        : count === 1
          ? 'Play card'
          : `Play ${count} cards`;

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.tray} accessibilityLabel={`Selected ${count} ${count === 1 ? 'card' : 'cards'}`}>
      <View style={styles.row}>
        {cards.map(({ play, card }, i) => (
          <Animated.View key={card.id} entering={ZoomIn.duration(160)} layout={LinearTransition.duration(160)} style={styles.item}>
            {i > 0 ? <Text style={styles.arrow}>›</Text> : null}
            <View>
              <CardFace card={card} size="tray" />
              {play.chosenSuit ? (
                <View style={styles.called} accessibilityLabel={`calls ${SUIT_NAMES[play.chosenSuit]}`}>
                  <SuitIcon suit={play.chosenSuit} size={11} colour={play.chosenSuit === 'H' || play.chosenSuit === 'D' ? colors.red : colors.ink} />
                </View>
              ) : null}
            </View>
          </Animated.View>
        ))}
      </View>
      <Text style={[styles.note, note.tone === 'warn' && styles.noteWarn, note.tone === 'bad' && styles.noteBad]} accessibilityLiveRegion="polite">
        {note.text}
      </Text>
      <View style={styles.buttons}>
        <Button label="Clear" variant="secondary" compact onPress={onClear} />
        <Button label={label} compact disabled={!canPlay} onPress={onPlay} style={styles.play} accessibilityHint="Plays the selected cards in order" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tray: {
    marginHorizontal: space.md,
    padding: space.md,
    gap: space.sm,
    borderRadius: 18,
    backgroundColor: 'rgba(25, 28, 27, 0.82)',
    borderWidth: 1,
    borderColor: colors.baizeLine,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 },
  item: { flexDirection: 'row', alignItems: 'center' },
  arrow: { color: colors.brass, fontSize: 20, marginHorizontal: 5, fontWeight: '700' },
  called: {
    position: 'absolute',
    right: -6,
    top: -8,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.brassBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: colors.textMuted, fontSize: 13 },
  noteWarn: { color: colors.brassBright, fontWeight: '600' },
  noteBad: { color: colors.redSoft, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: space.sm },
  play: { flex: 1 },
});
