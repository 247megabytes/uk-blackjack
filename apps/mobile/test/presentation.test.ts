import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, parseCard, type GameEvent } from '@ukbj/game-engine';
import { describeEvents, pickBanner, handRows, sortHand, discardTilt, fanAngle, handLayout, initials, lastPlay, opponentSeats, statusLine, cardName, MatchController } from '../src/game';

const names: Record<string, string> = { you: 'You', bot1: 'Ada', bot2: 'Monty' };
const nameOf = (id: string) => names[id] ?? id;
type EventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'version'> & { version?: number } : never) : never;
const ev = (e: EventInput) => ({ version: 5, ...e }) as GameEvent;

describe('describeEvents', () => {
  it('announces attacks, stacks and red Jack blocks', () => {
    const fx = describeEvents(
      [
        ev({ type: 'ATTACK_STARTED', kind: 'blackJack', amount: 5 }),
        ev({ type: 'ATTACK_STACKED', kind: 'blackJack', amount: 10, version: 6 }),
        ev({ type: 'ATTACK_CANCELLED', playerId: 'you', cancelledAmount: 10, version: 7 }),
      ],
      'you',
      nameOf,
    );
    expect(fx.map((f) => f.title)).toEqual(['Black Jack!', 'Stacked Black Jack!', 'Red Jack block!']);
    expect(fx[1]!.subtitle).toBe('Now pick up 10');
    expect(fx[2]!.subtitle).toBe('You cancelled 10 cards');
    expect(new Set(fx.map((f) => f.key)).size).toBe(3);
  });

  it('addresses the viewer as "You" and others by name', () => {
    const fx = describeEvents(
      [
        ev({ type: 'CARDS_DRAWN', playerId: 'you', cards: [], count: 4, requested: 4, reason: 'twoPenalty' }),
        ev({ type: 'CARDS_DRAWN', playerId: 'bot1', cards: [], count: 3, requested: 5, reason: 'blackJackPenalty' }),
        ev({ type: 'PLAYER_SKIPPED', playerId: 'bot2' }),
      ],
      'you',
      nameOf,
    );
    expect(fx[0]!.title).toBe('You pick up 4');
    expect(fx[0]!.haptic).toBe('error');
    expect(fx[1]!.title).toBe('Ada picks up 3');
    expect(fx[1]!.subtitle).toBe('Only 3 of 5 cards left');
    expect(fx[2]!.subtitle).toBe('Monty misses a turn');
  });

  it('ignores ordinary draws and plays (they animate rather than banner)', () => {
    const fx = describeEvents(
      [
        ev({ type: 'CARDS_DRAWN', playerId: 'bot1', cards: [], count: 1, requested: 1, reason: 'normal' }),
        ev({ type: 'CARD_PLAYED', playerId: 'bot1', card: parseCard('5H'), index: 0, of: 1 }),
        ev({ type: 'TURN_STARTED', playerId: 'bot2', turnNumber: 3 }),
      ],
      'you',
      nameOf,
    );
    expect(fx).toEqual([]);
  });

  it('prompts the human differently when they or a bot forget Last Card', () => {
    expect(describeEvents([ev({ type: 'LAST_CARD_WINDOW_OPENED', playerId: 'you' })], 'you', nameOf)[0]!.title).toBe('Say Last Card!');
    expect(describeEvents([ev({ type: 'LAST_CARD_WINDOW_OPENED', playerId: 'bot1' })], 'you', nameOf)[0]!.title).toBe('Ada forgot Last Card');
    const caught = describeEvents([ev({ type: 'LAST_CARD_CHALLENGED', challengerId: 'bot1', targetPlayerId: 'you' })], 'you', nameOf)[0]!;
    expect(caught.subtitle).toBe('Ada caught you — pick up 2');
  });

  it('describes wins and stalemates', () => {
    expect(describeEvents([ev({ type: 'GAME_WON', playerId: 'you' })], 'you', nameOf)[0]!.title).toBe('You win!');
    expect(describeEvents([ev({ type: 'STALEMATE', winnerId: null })], 'you', nameOf)[0]!.subtitle).toBe('Nobody can move');
  });
});

describe('v1.1 banners', () => {
  it('announces sequences, called suits, uncovered Queens, covered attacks and your turn', () => {
    const fx = describeEvents(
      [
        ev({ type: 'SEQUENCE_PLAYED', playerId: 'bot1', cards: ['7S', '8S', '9S'].map(parseCard) }),
        ev({ type: 'SUIT_CHOSEN', playerId: 'bot2', suit: 'H' }),
        ev({ type: 'QUEEN_UNCOVERED', playerId: 'you', queen: parseCard('QH') }),
        ev({ type: 'ATTACK_NEUTRALISED', playerId: 'bot1', kind: 'two', amount: 2 }),
        ev({ type: 'TURN_STARTED', playerId: 'you', turnNumber: 4 }),
      ],
      'you',
      nameOf,
    );
    expect(fx.map((f) => f.title)).toEqual(['Ada plays 3 cards', 'Hearts!', 'Queen left uncovered', 'Covered', 'Your turn']);
    expect(fx[1]!.subtitle).toBe('Monty calls hearts with an Ace');
    expect(fx[2]!.subtitle).toBe('You pick up 1');
    expect(fx[2]!.haptic).toBe('error');
    // "Your turn" never hides anything more important in the same batch.
    expect(pickBanner(fx)!.title).not.toBe('Your turn');
    expect(pickBanner([fx[4]!])!.title).toBe('Your turn');
  });
});

describe('pickBanner', () => {
  it('shows the most important effect of a batch, latest on ties', () => {
    const fx = describeEvents(
      [
        ev({ type: 'DIRECTION_REVERSED', direction: -1 }),
        ev({ type: 'LAST_CARD_WINDOW_OPENED', playerId: 'bot1' }),
      ],
      'you',
      nameOf,
    );
    const b = pickBanner(fx)!;
    expect(b.title).toBe('Ada forgot Last Card');
    expect(b.subtitle).toBe('Tap Catch Ada before they say it');
    expect(b.windowFor).toBe('bot1');
    expect(pickBanner([])).toBeNull();
    const attack = describeEvents([ev({ type: 'ATTACK_CANCELLED', playerId: 'bot2', cancelledAmount: 5 }), ev({ type: 'LAST_CARD_CHALLENGED', challengerId: 'you', targetPlayerId: 'bot1' })], 'you', nameOf);
    expect(pickBanner(attack)!.title).toBe('Caught!');
  });
});

describe('view helpers', () => {
  it('finds the last played card and builds a status line', () => {
    const m = new MatchController({ seed: 'status', humanName: 'A', botCount: 2 });
    const v = m.view();
    expect(statusLine(v, nameOf).length).toBeGreaterThan(0);
    expect(lastPlay(v)).toBeNull();
    // Play out until a card hits the table.
    for (let i = 0; i < 20 && !lastPlay(m.view()); i++) {
      const plan = m.plan({ botTurnMs: 1, botTurnJitterMs: 0, windowBotDeclareMs: 1, windowChallengeMs: 1, windowHumanGraceMs: 1, windowCloseMs: 1 });
      if (plan.kind === 'human') {
        const move = m.view().legalMoves.find((x) => x.type === 'PLAY_CARDS') ?? { type: 'DRAW' as const };
        m.submitHuman(move);
        if (m.view().drawnCardId) m.submitHuman({ type: 'PASS' });
      } else m.runPlan(plan);
    }
    expect(lastPlay(m.view())).not.toBeNull();
  });

  it('status line explains attacks', () => {
    const m = new MatchController({ seed: 'att', humanName: 'A', botCount: 1 });
    const s = { ...m.state, pendingAttack: { kind: 'blackJack' as const, amount: 10 }, currentPlayerIndex: 0 };
    expect(statusLine(getPlayerView(s, 'you'), nameOf)).toBe('Play a Jack or pick up 10');
    void applyAction;
  });

  it('names cards for accessibility', () => {
    expect(cardName(parseCard('QH'))).toBe('Queen of Hearts');
    expect(cardName(parseCard('10S'))).toBe('Ten of Spades');
  });
});

describe('layout', () => {
  it('provides one seat per opponent, all inside the area', () => {
    for (let n = 1; n <= 5; n++) {
      const seats = opponentSeats(n);
      expect(seats).toHaveLength(n);
      for (const s of seats) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(1);
      }
      // Clockwise order runs left → right across the top.
      for (let i = 1; i < seats.length; i++) expect(seats[i]!.x).toBeGreaterThan(seats[i - 1]!.x);
    }
  });

  it('fits hands into the available width, scrolling only when necessary', () => {
    const seven = handLayout(7, 360, 62);
    expect(seven.width).toBeLessThanOrEqual(360);
    expect(seven.scroll).toBe(false);
    const huge = handLayout(30, 360, 62);
    expect(huge.step).toBe(26);
    expect(huge.scroll).toBe(true);
    expect(handLayout(1, 360, 62)).toEqual({ step: 0, width: 62, scroll: false });
    expect(handLayout(0, 360, 62).width).toBe(0);
  });

  it('fans symmetrically and tilts discards deterministically', () => {
    expect(Math.abs(fanAngle(0, 5) + fanAngle(4, 5))).toBeLessThan(1e-9);
    expect(fanAngle(0, 1)).toBe(0);
    expect(discardTilt('QH')).toBe(discardTilt('QH'));
    expect(Math.abs(discardTilt('7C'))).toBeLessThanOrEqual(8);
  });

  it('folds crowded hands into two rows and sorts by suit then rank', () => {
    expect(handRows(7, 370, 64)).toEqual([7]);
    expect(handRows(16, 370, 64)).toEqual([8, 8]);
    expect(handRows(13, 370, 64)).toEqual([7, 6]);
    expect(handRows(0, 370, 64)).toEqual([]);
    const sorted = sortHand(['KD', '3S', 'AH', '10S', '2C', 'QH'].map(parseCard)).map((c) => c.id);
    expect(sorted).toEqual(['3S', '10S', 'AH', 'QH', '2C', 'KD']);
  });

  it('builds initials', () => {
    expect(initials('Ada')).toBe('AD');
    expect(initials('Mary Jane Watson')).toBe('MW');
    expect(initials('  ')).toBe('?');
  });
});

