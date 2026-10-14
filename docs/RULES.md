# UK Black Jack — Rules (ruleset `uk-classic-v1.2`)

The British shedding game, not casino Blackjack. The engine in `packages/game-engine` is the
reference implementation (`src/sequence.ts` holds the card-play rules, `src/tournament.ts` the
Knockouts tournament) and the tests in `packages/game-engine/test` are the executable specification.

**v1.2 changes from v1.1**
1. Runs go **up or down** in the same suit.
2. **Red Jacks cancel any pick-up attack**: 2s as well as black Jacks.
3. **Any pick-up ends the turn.** A drawn card can only be played on a later turn. PASS is retired.
4. **Power cards only work at the end of a sequence.** A power card followed later by a normal card
   has no effect.
5. **An Ace must be the last card** of a sequence.
6. **Going out requires Last Card**, declared with the final play or earlier.
7. Queen covering is unchanged.
8. **Knockouts mode** is added alongside Classic.

## Setup
- 2–6 players, standard 52-card deck, no Jokers.
- 7 cards each, dealt one at a time. The next card is turned face up as the **starter**.
- The starter card has **no power effect**: a starter 2/8/J/K does nothing, a starter Queen needs
  no cover, and a starter Ace keeps its printed suit (no suit is called).
- First player is chosen at random (seeded). Play starts clockwise.

## Your turn
Either **play** one or more cards, or **pick up**.

### Playing one or more cards
A turn is an ordered sequence of cards, submitted together.

1. **First card:** must match the top card's suit (or the suit called by a wild Ace on top) or its
   rank, or be an **Ace** (wild).
2. **Each next card** must be one of:
   - the **same rank** as the previous card (7♠ → 7♦), or
   - **one number up or down in the same suit** (v1.2). Runs use A(=1), 2 … 10: 7♠ → 6♠ → 5♠ and
     5♠ → 6♠ → 7♠ are both fine. Jack, Queen and King never form runs. Same-rank steps can be mixed
     in (6♠ → 5♠ → 5♦ → 4♦), or
   - an **Ace** (wild), which ends the sequence.
3. **Nothing may follow an Ace** (v1.2, error `ACE_MUST_BE_LAST`).
4. **After a Queen:** a card of the Queen's suit (see Queens).

### Picking up (v1.2)
- Draw one card, or take the whole pending attack penalty. **Either way your turn ends at once.**
  None of the cards you picked up can be played until your next turn. PASS is never legal (the
  action is kept in the protocol only for compatibility and is always rejected).
- Drawing voluntarily is allowed even if you could play.
- If nothing is left to draw and you hold a playable card, you must play.

## Power cards
| Card | Effect |
|---|---|
| **Black Jack** (J♠ J♣) | Next player picks up 5. Stackable: each extra black Jack adds 5. |
| **Red Jack** (J♥ J♦) | v1.2: cancels **any** pending pick-up, including 2s and black Jacks, for the full accumulated amount, and ends that turn. Otherwise a normal card. |
| **2** | Next player picks up 2. Stackable across suits: each extra 2 adds 2. |
| **King** | Reverses direction. With two players left in the game, the same player goes again. |
| **8** | Skips the next player. With two players left, the same player goes again. |
| **Queen** | Must be covered immediately by a card of the same suit (below). |
| **Ace** | Wild: playable on anything (except under attack); the player calls the new suit. Must end the sequence. |

### Power cards inside a sequence (v1.2, confirmed)
- Only the **final block** of consecutive power cards (2, 8, J, K) takes effect. Every card in that
  block counts: 2♠ 2♥ = pick up 4, 8♠ 8♥ = skip two, K♠ K♥ = reverse twice, J♠ J♣ = pick up 10.
- A power card followed later by a **normal card** does nothing. In 7♠ 8♠ 9♠ the 9 covers the 8,
  so nobody is skipped. In 2♠ 3♠ the 3 cancels the 2's pick-up. In 8♠ 9♠ 9♦ 8♦ only the last 8
  skips. The engine emits `POWER_COVERED` for covered power cards.
- An **Ace counts as a normal card** for covering, since it is not in the 2/8/J/K power set:
  J♠ → A♠ cancels the black Jack, K♠ → A♠ cancels the reverse. *(Interpretation, flagged below.)*
- Inside the final block, cards apply in order: a red Jack after your own black Jack (J♠ J♦)
  cancels it.
- Because a power card can only be followed by its own rank (or a 2 by a 3, or by an Ace), final
  blocks are always one rank.
- **Stacking across turns is unchanged.** A 2 attack can be answered with more 2s, and so on.
- Skips and reverses resolve at the end of the turn: the final direction is used, and play moves
  1 + (number of 8s) active seats (+1 per King when only two players are left in the game).

### Attacks
- Under a **2 attack** the defender may play one or more 2s (any suits). They may also play a
  **red Jack**, alone or after their 2s, which cancels the whole pick-up, their own 2s included.
- Under a **black Jack attack** the defender may play black Jacks, and may finish with a red Jack,
  which cancels everything.
- Nothing may follow the cancelling red Jack.
- **Aces cannot be played under attack.**
- Otherwise **pick up**: take the whole penalty. The turn ends.

## Queens (unchanged)
- A Queen must be **covered immediately** by a card of the **same suit**: Q♥ → 6♥. Another Queen
  doesn't cover (Q♥ → Q♠ ✗). Only the Ace **of the Queen's suit** can cover it (Q♥ → A♥ ✓,
  Q♥ → A♠ ✗); an Ace cover then ends the turn.
- The sequence may **continue from the cover** (Q♥ → 6♥ → 7♥ → 7♣).
- **If you hold a card that can cover, you must cover.**
- **If you cannot cover**, you pick up **exactly one card** and your **turn ends at once**. The Queen
  stays on the discard pile. A cover that would have to be your final card but is a restricted
  finishing card counts as "cannot cover".
- The next player simply plays on the Queen (its suit, another Queen, or an Ace).

## Wild Aces
- Any Ace may be played at any time, except under a pending attack, or as a Queen's cover unless it
  is the Ace of the Queen's suit.
- **v1.2: the Ace must be the last card of the sequence.** The player calls a suit and the turn
  ends. An Ace can end a run (3♠ 2♠ A♠).
- The player **must call a suit**. The called suit replaces the Ace's printed suit until another card
  is played on it. A missing or invalid suit, or a suit on a non-Ace card, is rejected.
- An Ace can never be the winning card.

## Last Card
- When a play leaves you with one card you announce **Last Card**, normally with the play.
- If you forget, a short **server-controlled window** opens. You may still declare (safe), or any
  active opponent may **challenge**, and you then pick up **2**. The window closes on a declaration,
  a challenge or the server's timer. Duplicate and late challenges are rejected.
- **v1.2: to play out your hand you must have declared Last Card**, either with the finishing play
  (`declareLastCard: true`) or earlier while holding one card. An undeclared go-out is **refused**
  (`LAST_CARD_NOT_DECLARED`) and the player keeps their turn. A legal declared finish carries no
  penalty and opens no window. This lets you declare before a multi-card go-out (5♥ 5♠ 6♠ from three
  cards).
- Your declared status resets whenever your hand grows above one card.

## Winning (Classic)
- The first player to legally play their final card wins.
- You **cannot finish on a 2, 8, Jack, Queen, King or Ace**. This is checked on the last card of the
  sequence that empties your hand.
- If every other player forfeits, the last player left wins (`endReason: 'forfeit'`).

## Knockouts (v1.2)
A tournament for 2–6 players, played as a chain of **knockout rounds**.

- **Each round** deals a fresh 7-card hand to every surviving player (new seeded shuffle, direction
  reset to clockwise, random first player).
- A player who empties their hand **finishes**, is ranked in finishing order, and takes no more
  turns that round. Their seat is skipped; 8s and Kings count active players only, and the
  two-player rules apply when two players are left holding cards.
- The round goes on until **only one player holds cards**. That player is **eliminated**.
- Everyone else **advances** to the next round. Rounds repeat until two players remain. In the
  **final**, the first player to empty their hand is **champion**.
- **Stuck round** (confirmed): if a round hits the turn cap or deadlocks, the active player holding
  the **most cards** is eliminated, with ties broken by a **seeded draw**. The other holders survive,
  ranked by fewest cards, then seat.
- **Disconnects** (confirmed): a player who leaves or disconnects **forfeits**. They are eliminated
  immediately, ranked below everyone still in. Their cards are shuffled into the draw pile and no
  card ids are revealed.
- Finished and eliminated players cannot act, declare or challenge.
- All Classic card rules apply in every round, including Last Card to go out.

### Forfeits in detail (both modes)
- Action `FORFEIT`: a player may forfeit themselves; the server (`SYSTEM_PLAYER_ID`) forfeits a
  disconnected player by naming `targetPlayerId`.
- If it was the forfeiting player's turn, play moves to the next active player. A **pending attack
  aimed at them is cleared** rather than passed on *(interpretation, flagged below)*.
- A Last Card window aimed at the forfeiter closes and play resumes. If the forfeiter was the next to
  play after a window, the resume moves on to the next active player.
- Knockouts: if a forfeit leaves only one player holding cards, the round ends there and that player
  is **not** eliminated, because the forfeiter is the round's casualty *(interpretation, flagged
  below)*. A player who leaves after finishing a round, or between rounds, is eliminated at the
  tournament level. If that leaves one player, they are champion.

## Deck exhaustion and stalemates
- When the draw pile runs out, every discard except the top card is shuffled (seeded) into a new
  draw pile. Cards are never duplicated. Short draws are fulfilled as far as possible.
- **Deadlock** (nothing drawable, no attack pending, no active player can play) and the **turn cap**
  (`maxTurns`, default 1000 per game or round) end the game or round:
  - Classic: the player with the fewest cards wins; a tie for fewest is a draw.
  - Knockouts: the most cards is eliminated (see above).

## Interpretations awaiting sign-off (v1.2)
These were not specified. The engine implements the choice shown, each covered by a test.
1. **An Ace covering a power card cancels it** (J♠ → A♠ is no attack; K♠ → A♠ no reverse), because an
   Ace isn't one of the 2/8/J/K power cards.
2. **A defender may stack 2s and then finish with a red Jack** (2♥ J♦ under a 2 attack). The red Jack
   cancels the whole amount, including their own 2s.
3. **Forfeiting while facing an attack clears the attack** instead of passing it to the next player.
4. **A forfeit that leaves one player holding cards ends the round without eliminating them.**
5. **Surviving holders in a stalled round are ranked by fewest cards, then seat.**
6. **Two-player behaviour (King = skip, 8 = go again) uses the number of players still active** in
   the round, not the number dealt in.
7. **Finished players cannot challenge Last Card** for the rest of the round.
8. **Each round's first player is random** (seeded); the round winner does not lead the next round.
