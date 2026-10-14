import { StyleSheet, Text, View } from 'react-native';
import { parseCard } from '@ukbj/game-engine';
import { CardFace } from '../ui/PlayingCard';
import { colors, serif, space, type as t } from '../ui/theme';
import { Screen } from './Screen';

const POWERS: { cards: string[]; title: string; body: string }[] = [
  { cards: ['JS', 'JC'], title: 'Black Jacks', body: 'The next player picks up 5. Another black Jack passes it on with 5 more.' },
  { cards: ['JH', 'JD'], title: 'Red Jacks', body: 'Play one on any pick-up attack — 2s or black Jacks — to cancel the whole pick-up. It ends your turn. Otherwise they are normal cards.' },
  { cards: ['2H', '2C'], title: 'Twos', body: 'The next player picks up 2. Twos stack in any suit.' },
  { cards: ['KD'], title: 'Kings', body: 'Reverse the direction of play. With two players, you go again.' },
  { cards: ['8S'], title: 'Eights', body: 'Skip the next player. With two players, you go again.' },
  { cards: ['QH', '6H'], title: 'Queens', body: 'Must be covered straight away by a card of the same suit. Can’t cover? Pick up one card and your turn ends.' },
  { cards: ['AS', 'AD'], title: 'Aces', body: 'Wild: play one on anything — it must be your last card of the turn — then call the suit play continues in. Not while you’re under attack.' },
];

export function HowToPlayScreen({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="How to play" onBack={onBack}>
      <Section title="The aim">
        Be the first to get rid of all your cards. Everyone starts with seven.
      </Section>
      <Section title="Your turn">
        Your first card must match the top card by suit or rank. If you can’t, or don’t want to, tap the deck to draw one. Picking up always ends your turn — the card you drew waits until your next go.
      </Section>
      <Section title="Playing several cards">
        Keep adding cards in the same turn: the same rank (7♥ then 7♠), or the next number up or down in the same suit (7♠ 8♠ 9♠ or 7♠ 6♠ 5♠). An Ace can finish any run. Tap cards in order, check the tray, then tap Play.
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
      <Section title="Power cards only count at the end">
        A power card (2, 8, Jack, King) only works if it’s the last card you play — or part of a run of power cards at the very end. 7♠ 8♠ 9♠ skips nobody, because the 9 covers the 8. 8♠ 8♥ at the end skips two players, and 2♠ 2♥ makes the next player pick up 4.
      </Section>
      <Section title="Under attack">
        When a 2 or black Jack is played on you, answer with the same kind of card — as many as you like — to pass the pick-up along, play a red Jack to cancel it, or take the cards and miss your turn.
      </Section>
      <Section title="Last Card">
        When your play leaves you with one card, tap the brass Last Card button first. Forget, and you get a moment to say it late — but if someone catches you first, you pick up 2. You can catch the bots too. To play out your whole hand, you must say Last Card first — the game won’t let the play through until you do.
      </Section>
      <Section title="Going out">
        Your final card must be an ordinary card. You can’t finish on a 2, 8, Jack, Queen, King or Ace — you’ll have to draw instead.
      </Section>
      <Section title="Knockouts">
        A tournament for 2–6 players. Each round deals seven cards each. Get rid of your cards to finish safely — finishers sit out the rest of the round in the order they went out. The last player still holding cards is knocked out, and everyone else goes through to a fresh round. When two are left, the first to empty their hand in the final is champion. If a round stalls, whoever holds the most cards goes out.
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
