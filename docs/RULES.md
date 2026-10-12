# UK Black Jack — Rules (ruleset `uk-classic-v1`)

The British shedding game, not casino Blackjack. These rules are locked; the engine in
`packages/game-engine` is the reference implementation and the tests in
`packages/game-engine/test` are the executable specification.

## Setup
- 2–6 players, standard 52-card deck, no Jokers.
- 7 cards each, dealt one at a time. The next card is turned face up as the **starter**.
- The starter card has **no power effect**, even if it is a 2, 8, Jack or King. *(Engine decision.)*
- First player is chosen at random (seeded). Play starts clockwise.

## Your turn
- Play **one** card matching the **suit or rank** of the top discard, or
- **Draw** one card. If the drawn card is playable you may play it immediately or **pass**;
  otherwise your turn ends automatically.
- Drawing voluntarily is allowed even if you could play — but afterwards only the newly drawn
  card may be played.
- Exception: if nothing is left to draw (draw pile empty, nothing to recycle) and you hold a
  playable card, you must play. *(Engine decision — prevents deliberate deadlocks.)*

## Power cards
| Card | Effect |
|---|---|
| **Black Jack** (J♠ J♣) | Next player draws 5. Stackable: each extra black Jack adds 5. |
| **Red Jack** (J♥ J♦) | During a black Jack attack: cancels the *entire* penalty and ends the defender's turn. Cannot cancel a 2 attack. Otherwise a normal card. |
| **2** | Next player draws 2. Stackable across suits: each extra 2 adds 2. Cannot be mixed with Jack attacks. |
| **King** | Reverses direction. With two players, the same player goes again. |
| **8** | Skips exactly one player. Skips never accumulate. With two players, the same player goes again. |
| **Ace, Queen** | Normal cards. |

### Attacks
- Under a **2 attack** the only legal plays are 2s (any suit).
- Under a **black Jack attack** the only legal plays are black Jacks (stack) or red Jacks (cancel).
- A player who cannot or will not defend chooses **Draw**: they take the whole penalty and lose their turn.
- Power cards played outside an attack must still match suit or rank (Jacks match any Jack).

## Last Card
- When a play leaves you with one card you must announce **Last Card** — normally as part of the play.
- If you forget, a short **server-controlled window** opens. During it, turn play is paused and:
  - you may still declare (safe), or
  - any opponent may **challenge**: you draw **2** penalty cards and the window closes.
- The window closes on a declaration, a challenge, or the server's timer
  (`CLOSE_LAST_CARD_WINDOW`). Escaping the window unchallenged carries no penalty.
- Only one challenge can succeed; duplicate and late challenges are rejected.
- Your declared status resets whenever your hand grows above one card.

## Winning
- The first player to legally play their final card wins.
- You **cannot finish on a 2, 8, King or Jack** (red or black) — that play is rejected, including when
  defending an attack. You must draw instead.

## Deck exhaustion and stalemates
- When the draw pile runs out, every discard except the visible top card is shuffled (seeded) into a
  new draw pile. Cards are never duplicated.
- If too few cards exist, a draw (including a penalty) is fulfilled as far as possible.
- **Deadlock:** nothing drawable, no attack pending, and nobody can play → stalemate.
  (With a full deck this cannot actually arise — the 15 cards matching any top card can't all be
  held as single unplayable power cards — but the engine detects it defensively.)
- **Turn cap:** after `maxTurns` (default 1000) turns the game ends as a stalemate. In 10,000
  simulated Easy-bot games the longest took 609 turns.
- A stalemate is won by the player with the fewest cards; a tie for fewest is a draw.
