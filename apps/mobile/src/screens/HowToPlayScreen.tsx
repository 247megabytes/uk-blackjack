import { StyleSheet, Text, View } from 'react-native';
import { parseCard } from '@ukbj/game-engine';
import { CardFace } from '../ui/PlayingCard';
import { colors, serif, space, type as t } from '../ui/theme';
import { Screen } from './Screen';

const POWERS: { cards: string[]; title: string; body: string }[] = [
  { cards: ['JS', 'JC'], title: 'Black Jacks', body: 'The next player picks up 5. Another black Jack passes it on with 5 more.' },
  { cards: ['JH', 'JD'], title: 'Red Jacks', body: 'Play one on a black Jack attack to cancel the whole pick-up. Otherwise they are normal cards.' },
  { cards: ['2H', '2C'], title: 'Twos', body: 'The next player picks up 2. Twos stack in any suit, but never mix with Jacks.' },
  { cards: ['KD'], title: 'Kings', body: 'Reverse the direction of play. With two players, you go again.' },
  { cards: ['8S'], title: 'Eights', body: 'Skip the next player. With two players, you go again.' },
  { cards: ['QH', '6H'], title: 'Queens', body: 'Must be covered straight away by a card of the same suit. Can’t cover? Pick up one card and your turn ends.' },
  { cards: ['AS', 'AD'], title: 'Aces', body: 'Wild: play one on anything, then call the suit play continues in. Not while you’re under attack.' },
];

export function HowToPlayScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="How to play" onBack={onBack}>
      <Section title="The aim">
        Be the first to get rid of all your cards. Everyone starts with seven.
      </Section>
      <Section title="Your turn">
        Your first card must match the top card by suit or rank. If you can’t, or don’t want to, tap the deck to draw one. If the drawn card fits you may play it straight away, or pass.
      </Section>
      <Section title="Playing several cards">
        Keep adding cards in the same turn: the same rank (7♥ then 7♠), or the next number up in the same suit (7♠ 8♠ 9♠). Aces count as 1 and are wild. Tap cards in order, check the tray, then tap Play. Every power card you play takes effect — two 8s skip two players.
      </Section>

      <Text style={styles.h2} accessibilityRole="header">
        Power cards
      </Text>
      {POWERS.map((p) => (
        <View key={p.title} style={styles.power}>
          <View style={styles.cards}>
            {p.cards.map((id, i) => (
              <CardFace key={id} card={parseCard(id)} size="hand" style={i > 0 ? styles.overlap : undefined} />
            ))}
          </View>
          <View style={styles.powerText}>
            <Text style={t.heading}>{p.title}</Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        </View>
      ))}
      <Section title="Under attack">
        When a 2 or black Jack is played on you, answer with the same kind of card — as many as you like — to pass the pick-up along, use a red Jack against black Jacks, or take the cards and miss your turn. Cover your own 2 with the next card up (2♠ 3♠) and the pick-up is cancelled.
      </Section>
      <Section title="Last Card">
        When your play leaves you with one card, tap the brass Last Card button first. Forget, and you get a moment to say it late — but if someone catches you first, you pick up 2. You can catch the bots too.
      </Section>
      <Section title="Going out">
        Your final card must be an ordinary card. You can’t finish on a 2, 8, Jack, Queen, King or Ace — you’ll have to draw instead.
      </Section>
      <Section title="Running out of cards">
        When the deck empties, the played cards are shuffled back in, keeping the top card on the table.
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={t.heading} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  h2: { fontFamily: serif, fontSize: 22, color: colors.text, marginTop: space.sm },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  power: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  cards: { flexDirection: 'row', width: 104 },
  overlap: { marginLeft: -24, transform: [{ rotate: '8deg' }] },
  powerText: { flex: 1, gap: 2 },
});
