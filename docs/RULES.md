# UK Black Jack — Rules (ruleset `uk-classic-v1.1`)

The British shedding game, not casino Blackjack. The engine in `packages/game-engine` is the
reference implementation (`src/sequence.ts` holds the card-play rules) and the tests in
`packages/game-engine/test` are the executable specification.

v1.1 adds **multi-card turns**, **Queen covering** and **wild Aces** to v1. Everything else
from v1 is unchanged.

## Setup
- 2–6 players, standard 52-card deck, no Jokers.
- 7 cards each, dealt one at a time. The next card is turned face up as the **starter**.
- The starter card has **no power effect**: a starter 2/8/J/K does nothing, a starter Queen needs
  no cover, and a starter Ace keeps its printed suit (no suit is called).
- First player is chosen at random (seeded). Play starts clockwise.

## Your turn
Either **play** one or more cards, or **draw**.

### Playing one or more cards (v1.1)
A turn is an ordered sequence of cards, submitted together.

1. **First card:** must match the top card's suit (or the suit called by a wild Ace on top) or its
   rank, or be an **Ace** (wild).
2. **Each next card** must be one of:
   - the **same rank** as the previous card (7♠ → 7♦), or
   - the **next number up in the same suit** — runs use A(=1), 2 … 10 (7♠ → 8♠ → 9♠); Jack,
     Queen and King never form runs; runs never go down, or
   - an **Ace** (wild).
3. **After an Ace:** any card of the suit that Ace called, or another Ace.
4. **After a Queen:** a card of the Queen's suit (see Queens).

Example: 7♥ on the table → play 7♠ → 8♠ → 9♠ in one turn.

### Drawing
- Draw one card. If it can be played you may play it immediately — **on its own** (a drawn Queen
  may be followed by its cover, nothing more) — or **pass**. Otherwise your turn ends.
- Drawing voluntarily is allowed even if you could play.
- If nothing is left to draw and you hold a playable card, you must play.

## Power cards
| Card | Effect |
|---|---|
| **Black Jack** (J♠ J♣) | Next player picks up 5. Stackable: each extra black Jack adds 5. |
| **Red Jack** (J♥ J♦) | Against a black Jack attack: cancels the *entire* pick-up and ends that turn. Otherwise a normal card. |
| **2** | Next player picks up 2. Stackable across suits: each extra 2 adds 2. Never mixes with Jacks. |
| **King** | Reverses direction. With two players, the same player goes again. |
| **8** | Skips the next player. With two players, the same player goes again. |
| **Queen** (v1.1) | Must be covered immediately by a card of the same suit (below). |
| **Ace** (v1.1) | Wild: playable on anything (except under attack); the player calls the new suit. |

### Power cards inside a sequence (confirmed)
- **Every power card in the sequence takes effect.** 7♠ 8♠ 9♠ skips one player; 8♠ 8♥ skips two;
  K♠ K♥ reverses twice (no change); 2♠ 2♥ attacks for 4; J♠ J♣ attacks for 10.
- **Covering your own attack cancels it.** If you play a 2 and then cover it in the same turn with a
  card that is not another 2 (e.g. 2♠ → 3♠), the pick-up is cancelled. *Implementation note:* the
  same applies to a black Jack covered by an Ace, and a red Jack after your own black Jack
  cancels it. 8s and Kings still count even when covered.
- Skips and reverses resolve at the end of the turn: the final direction is used, and play moves
  1 + (number of 8s) seats (+1 per King in a two-player game).

### Attacks
- Under a **2 attack** the defender may play one or more 2s (any suits) and nothing else.
- Under a **black Jack attack** the defender may play black Jacks, and may finish with a red Jack,
  which cancels everything; nothing may follow a red Jack.
- **Aces cannot be played under attack** (confirmed).
- Otherwise choose **Draw**: take the whole pick-up and lose the turn.

## Queens (v1.1)
- A Queen must be **covered immediately** by a card of the **same suit**: Q♥ → 6♥. Another Queen
  doesn't cover (Q♥ → Q♠ ✗). Only the Ace **of the Queen's suit** can cover it (Q♥ → A♥ ✓, Q♥ → A♠ ✗).
- The cover can be any card of that suit, including a power card, whose power applies
  (Q♥ → 2♥ attacks). The sequence may **continue from the cover** (Q♥ → 6♥ → 7♥ → 7♣).
- **If you hold a card that can cover, you must cover.**
- **If you cannot cover**, you pick up **exactly one card** and your **turn ends at once**. The drawn
  card cannot be played, and the Queen stays on the discard pile. A cover that would have to be
  your final card but is a restricted finishing card (e.g. Q♥ with only 2♥ left) counts as
  "cannot cover".
- The next player simply plays on the Queen (its suit, another Queen, or an Ace). The cover
  obligation does not pass on.
- A Queen penalty brings the hand back to 2+ cards, so it never opens a Last Card window.

## Wild Aces (v1.1)
- Any Ace may be played at any time — as the first card or anywhere in a sequence — except under
  a pending attack, or as a Queen's cover unless it is the Ace of the Queen's suit.
- The player **must call a suit** (Hearts, Diamonds, Clubs, Spades). The called suit replaces the
  Ace's printed suit until another card is played on it. Calling no suit, or a suit that doesn't
  exist, is rejected; so is a "called suit" on any non-Ace card.
- In a sequence the next card must follow the called suit (or be another Ace); the last Ace's call
  stands. Aces count as 1 in runs, which this already covers: A → 2 of the called suit.

## Last Card
- When a play leaves you with one card you must announce **Last Card**, normally with the play.
- If you forget, a short **server-controlled window** opens: you may still declare (safe), or any
  opponent may **challenge**, and you pick up **2**. The window closes on a declaration, a challenge
  or the server's timer. Duplicate and late challenges are rejected.
- Your declared status resets whenever your hand grows above one card.

## Winning
- The first player to legally play their final card wins.
- You **cannot finish on a 2, 8, Jack, Queen, King or Ace**. This is checked on the last card of the
  sequence that empties your hand (7♠ 8♠ as your last two cards is rejected; 7♠ 8♠ 9♠ wins).

## Deck exhaustion and stalemates
- When the draw pile runs out, every discard except the top card is shuffled (seeded) into a new
  draw pile. Cards are never duplicated. Short draws are fulfilled as far as possible.
- **Deadlock** (nothing drawable, no attack pending, nobody can play) → stalemate. With a full deck
  and wild Aces this is practically unreachable, but it is still detected.
- **Turn cap:** after `maxTurns` (default 1000) turns the game ends as a stalemate.
- A stalemate goes to the player with the fewest cards; a tie for fewest is a draw.
