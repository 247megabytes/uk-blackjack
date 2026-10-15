# UK Black Jack — Rules (ruleset `uk-classic-v1.2`)

The British shedding game, not casino Blackjack. The engine in `packages/game-engine` is the
reference implementation (`src/sequence.ts` holds the card-play rules, `src/tournament.ts` the
Knockouts tournament) and the tests in `packages/game-engine/test` are the executable specification.

**v1.2 changes from v1.1**
1. Runs go **up or down** in the same suit.
2. **Unified pickups:** 2s (+2) and black Jacks (+5) build one shared pick-up. Either can answer
   the other, and a **red Jack cancels the whole pick-up**.
3. **After a black Jack** only another black Jack, a 2 or a red Jack may follow.
4. **Any pick-up ends the turn.** A drawn card can only be played on a later turn. PASS is retired.
5. **Power cards only work at the end of a sequence.** A power card followed later by a normal card
   has no effect.
6. **Aces:** played on their own at any time, or as the last card of a descending same-suit run
   (3♥ 2♥ A♥). The player calls a suit and the turn ends.
7. Queen covering is unchanged.
8. **Ending your hand on a 2, 8, J, Q, K or A is allowed but doesn't win.** The card takes
   effect and you pick up one card.
9. **A winning go-out requires Last Card**, declared with the final play or earlier.
10. **Knockouts mode** is added alongside Classic.

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
   - **one number up or down in the same suit** (v1.2). Runs use A(=1), 2 … 10: 5♠ → 6♠ → 7♠ and
     9♥ → 8♥ → 7♥ are both fine. Jack, Queen and King never form runs. Same-rank steps can be mixed
     in (6♠ → 5♠ → 5♦ → 4♦).
3. **Pickup cards work together:** after a 2, any Jack may also follow (2♠ → J♣ makes 7).
4. **After a black Jack:** only another black Jack, any 2 or any red Jack (`BLACK_JACK_FOLLOW`). No
   ordinary card, Queen, King, 8 or Ace.
5. **An Ace mid-turn** may only end a descending run in its own suit (2♥ → A♥), or cover a Queen of
   its suit (Q♥ → A♥). **Nothing may follow an Ace** (`ACE_MUST_BE_LAST`).
6. **After a Queen:** a card of the Queen's suit (see Queens).
7. Every transition is validated before anything changes. A rejected sequence leaves the game
   exactly as it was.

### Picking up (v1.2)
- Draw one card, or take the whole pending attack penalty. **Either way your turn ends at once.**
  None of the cards you picked up can be played until your next turn. PASS is never legal (the
  action is kept in the protocol only for compatibility and is always rejected).
- Drawing voluntarily is allowed even if you could play.
- If nothing is left to draw and you hold a playable card, you must play.

## Power cards
| Card | Effect |
|---|---|
| **Black Jack** (J♠ J♣) | Adds 5 to the pick-up. Only a black Jack, a 2 or a red Jack may follow it. |
| **2** | Adds 2 to the pick-up. 2s and black Jacks share one total (2♠ → J♣ = 7, J♠ → 2♦ → J♣ = 12). |
| **Red Jack** (J♥ J♦) | Cancels the whole pending pick-up, however it was built (2♠ → J♣ → J♥ = cancelled). Normal sequence rules continue afterwards (confirmed). Otherwise a normal card. |
| **King** | Reverses direction. With two players left in the game, the same player goes again. |
| **8** | Skips the next player. With two players left, the same player goes again. |
| **Queen** | Must be covered immediately by a card of the same suit (below). |
| **Ace** | Wild: on its own at any time (not on a live pick-up), or ending a descending same-suit run. The player calls the suit and the turn ends. Never the winning card. |

### Power cards inside a sequence (v1.2, confirmed)
- Only the **final block** of consecutive power cards (2, 8, J, K) takes effect. Every card in that
  block counts: 2♠ 2♥ = pick up 4, 8♠ 8♥ = skip two, K♠ K♥ = reverse twice, J♠ J♣ = pick up 10.
- A power card followed later by a **normal card** does nothing. In 7♠ 8♠ 9♠ the 9 covers the 8,
  so nobody is skipped. In 2♠ 3♠ the 3 cancels the 2's pick-up. In 8♠ 9♠ 9♦ 8♦ only the last 8
  skips. The engine emits `POWER_COVERED` for covered power cards.
- Examples from the brief: 2♠ 3♠ = no pick-up; 3♠ 2♠ = pick up 2; 8♠ 9♠ = no skip; 3♥ 2♥ A♥ = no
  pick-up from the 2 (the Ace covers it). Every card in a final run of 8s or Kings counts
  (confirmed): 7♠ 8♠ 8♥ skips two players.
- Inside the final block, cards apply in order: a red Jack after your own black Jack (J♠ J♦)
  cancels it; 2♠ J♣ = 7.
- **Answering a pick-up always counts.** The cards that answer an incoming pick-up, up to and
  including a cancelling red Jack, always take effect, even if more cards follow afterwards. Only
  the cards after that are subject to the final-block rule.
- **Stacking across turns is unchanged.** A 2 attack can be answered with more 2s, and so on.
- Skips and reverses resolve at the end of the turn: the final direction is used, and play moves
  1 + (number of 8s) active seats (+1 per King when only two players are left in the game).

### Pick-ups
- A pending pick-up can only be answered with **any 2, any black Jack or any red Jack**. No other
  card can interrupt it, including Aces.
- 2s and black Jacks add to the total and pass it on. A red Jack cancels it entirely. After the
  cancelling red Jack, normal sequence rules apply again (confirmed), so a further black Jack would
  start a fresh pick-up of 5.
- Otherwise **pick up** the whole total. The turn ends at once.

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
- **v1.2:** an Ace is played **on its own**, or as the **last card of a descending run in its own
  suit** (3♥ 2♥ A♥ ✓; 3♥ 2♥ A♠ ✗; 7♠ 7♦ A♦ ✗), or as a Queen's cover in its suit (confirmed). The
  player calls a suit and the turn ends. No cards, including the called suit, may follow.
- The player **must call a suit**. The called suit replaces the Ace's printed suit until another card
  is played on it. A missing or invalid suit, or a suit on a non-Ace card, is rejected.
- An Ace can never be the winning card (see Ending on a power card).

## Last Card
- When a play leaves you with one card you announce **Last Card**, normally with the play.
- If you forget, a short **server-controlled window** opens. You may still declare (safe), or any
  active opponent may **challenge**, and you then pick up **2**. The window closes on a declaration,
  a challenge or the server's timer. Duplicate and late challenges are rejected.
- **v1.2: to win by playing out your hand you must have declared Last Card**, either with the
  finishing play (`declareLastCard: true`) or earlier while holding one card. An undeclared winning
  go-out is **refused** (`LAST_CARD_NOT_DECLARED`) and the player keeps their turn. A legal declared
  finish carries no penalty and opens no window. This lets you declare before a multi-card go-out
  (7♠ 8♠ 9♠ from three cards).
- Emptying the hand on a power card (below) leaves the player holding one card after the automatic
  pick-up. It needs no prior declaration; the normal one-card rules apply (confirmed). Declared:
  safe. Not declared: the catch window opens.
- Your declared status resets whenever your hand grows above one card.

## Ending on a power card (v1.2)
- If the last card of the sequence that empties your hand is a **2, 8, Jack, Queen, King or Ace**,
  the play is allowed:
  1. the card's legal effect applies (a pick-up, skip, reverse, called suit or cancel);
  2. you automatically pick up **exactly one card** (for a Queen this is the Queen pick-up, not a
     second card);
  3. your turn ends;
  4. no winner is declared.
- The automatic pick-up never cancels the pick-up, skip or reverse that the card created.
- Event `FINISH_BLOCKED`, draw reason `blockedFinish` (or `queenPenalty`).
- The Queen's covering duty still applies. If you hold a same-suit cover you must use it, even if
  the cover is itself a power card ending your hand (Q♥ 2♥ attacks, then you pick up one).

## Winning (Classic)
- The first player to empty their hand on an ordinary card (3–10), with Last Card declared, wins.
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

## Decisions confirmed on 2026-10-15
- Every card in a final run of 8s or Kings counts (8♠ 8♥ skips two).
- Ending the hand on a power card needs no Last Card declaration; the normal one-card rules apply
  after the automatic pick-up.
- A Queen can still be covered by the Ace of its suit.
- Normal sequence rules continue after a red Jack cancels a pick-up.

## Interpretations awaiting sign-off (v1.2)
These were not specified. The engine implements the choice shown, each covered by a test.
1. **Answering a pick-up always counts** even if later cards follow, so a red Jack's cancel can't be
   "covered" and undone.
2. **Literal Black Jack restriction:** it only governs the card directly after a black Jack.
   J♣ → 2♦ → 3♦ is legal, and the 3 covers both, so there is no pick-up.
3. **Forfeiting while facing a pick-up clears it** instead of passing it to the next player.
4. **A forfeit that leaves one player holding cards ends the round without eliminating them.**
5. **Surviving holders in a stalled round are ranked by fewest cards, then seat.**
6. **Two-player behaviour (King = skip, 8 = go again) uses the number of players still active** in
   the round. This also applies after a blocked finish: a final 8 with two players left gives the
   same player another turn with the card they just picked up.
7. **Finished players cannot challenge Last Card** for the rest of the round.
8. **Each round's first player is random** (seeded); the round winner does not lead the next round.
