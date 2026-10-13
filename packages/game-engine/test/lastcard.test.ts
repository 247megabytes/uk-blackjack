import { describe, expect, it } from 'vitest';
import {
  applyAction,
  challengeLastCard,
  closeLastCardWindow,
  declareLastCard,
  getLegalMoves,
  SYSTEM_PLAYER_ID,
} from '@ukbj/game-engine';
import { act, current, draw, hand, play, reject, scenario, single } from './helpers';

/** p1 holds 2 cards and can play 5H on 9H, going to one card. */
const base = () => scenario({ hands: [['5H', '7C'], ['3D', '4D', '6D'], ['3S', '4S', '6S']], top: '9H' });

describe('Last Card declarations', () => {
  it('declaring with the play avoids any window', () => {
    const s = act(base(), play('p1', '5H', true));
    expect(s.phase).toBe('playing');
    expect(s.players[0]!.declaredLastCard).toBe(true);
    expect(current(s)).toBe('p2');
    expect(s.events.some((e) => e.type === 'LAST_CARD_DECLARED')).toBe(true);
  });

  it('getLegalMoves suggests declaring when a play leaves one card', () => {
    expect(getLegalMoves(base(), 'p1')).toContainEqual(single('5H', true));
  });

  it('forgetting opens a server-controlled declaration/challenge window', () => {
    const s = act(base(), play('p1', '5H'));
    expect(s.phase).toBe('lastCardWindow');
    expect(s.lastCardWindow).toMatchObject({ playerId: 'p1' });
    expect(getLegalMoves(s, 'p1')).toEqual([{ type: 'DECLARE_LAST_CARD' }]);
    expect(getLegalMoves(s, 'p2')).toEqual([{ type: 'CHALLENGE_LAST_CARD', targetPlayerId: 'p1' }]);
  });

  it('turn actions are blocked while the window is open', () => {
    const s = act(base(), play('p1', '5H'));
    expect(reject(s, draw('p2'))).toBe('WRONG_PHASE');
  });

  it('a late declaration inside the window is safe and resumes play', () => {
    const s = act(base(), play('p1', '5H'));
    const r = declareLastCard(s, 'p1', 'decl-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe('playing');
    expect(current(r.state)).toBe('p2');
    expect(challengeLastCard(r.state, 'p2', 'p1', 'ch-late').ok).toBe(false);
  });

  it('a successful challenge forces the player to draw 2', () => {
    const s = act(base(), play('p1', '5H'));
    const r = challengeLastCard(s, 'p3', 'p1', 'ch-1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(hand(r.state, 'p1')).toHaveLength(3);
    expect(r.state.phase).toBe('playing');
    expect(current(r.state)).toBe('p2');
    expect(r.events.some((e) => e.type === 'CARDS_DRAWN' && e.reason === 'lastCardPenalty' && e.count === 2)).toBe(true);
  });

  it('prevents duplicate challenges', () => {
    const s = act(base(), play('p1', '5H'));
    const first = challengeLastCard(s, 'p2', 'p1', 'ch-a');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = challengeLastCard(first.state, 'p3', 'p1', 'ch-b');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('NO_OPEN_CHALLENGE_WINDOW');
    // Replaying the exact same challenge is an idempotent no-op, not a second penalty.
    const replay = challengeLastCard(first.state, 'p2', 'p1', 'ch-a');
    expect(replay.ok && replay.duplicate).toBe(true);
    if (replay.ok) expect(hand(replay.state, 'p1')).toHaveLength(3);
  });

  it('prevents late challenges after the server closes the window', () => {
    const s = act(base(), play('p1', '5H'));
    const closed = closeLastCardWindow(s, 'close-1');
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(hand(closed.state, 'p1')).toHaveLength(1); // escaped unchallenged
    const late = challengeLastCard(closed.state, 'p2', 'p1', 'ch-late');
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('NO_OPEN_CHALLENGE_WINDOW');
  });

  it('only the server may close the window', () => {
    const s = act(base(), play('p1', '5H'));
    const r = applyAction(s, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: 'p2', actionId: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SYSTEM_ONLY');
    const ok = applyAction(s, { type: 'CLOSE_LAST_CARD_WINDOW', playerId: SYSTEM_PLAYER_ID, actionId: 'y' });
    expect(ok.ok).toBe(true);
  });

  it('cannot challenge yourself or a player who is not on one card', () => {
    const s = act(base(), play('p1', '5H'));
    const self = challengeLastCard(s, 'p1', 'p1', 'c1');
    expect(!self.ok && self.error.code).toBe('CANNOT_CHALLENGE_SELF');
    const wrong = challengeLastCard(s, 'p2', 'p3', 'c2');
    expect(!wrong.ok && wrong.error.code).toBe('INVALID_CHALLENGE_TARGET');
  });

  it('cannot challenge a player who declared', () => {
    const s = act(base(), play('p1', '5H', true));
    const r = challengeLastCard(s, 'p2', 'p1', 'c');
    expect(!r.ok && r.error.code).toBe('NO_OPEN_CHALLENGE_WINDOW');
  });

  it('declaring without exactly one card is rejected, as is declaring twice', () => {
    expect(reject(base(), { type: 'DECLARE_LAST_CARD', playerId: 'p2' })).toBe('NOT_ON_LAST_CARD');
    const s = act(base(), play('p1', '5H', true));
    expect(reject(s, { type: 'DECLARE_LAST_CARD', playerId: 'p1' })).toBe('ALREADY_DECLARED');
  });

  it('the window resumes with the correct next player after a skip or 2-player King', () => {
    const skip = act(scenario({ hands: [['8H', '7C'], ['3D', '4D'], ['3S', '4S']], top: '9H' }), play('p1', '8H'));
    const r = closeLastCardWindow(skip, 'c');
    expect(r.ok && current(r.state)).toBe('p3');
    const twoP = act(scenario({ hands: [['KH', '7H'], ['3D', '4D']], top: '9H' }), play('p1', 'KH'));
    const r2 = closeLastCardWindow(twoP, 'c2');
    expect(r2.ok && current(r2.state)).toBe('p1');
  });

  it('the declared flag resets when the hand grows again', () => {
    let s = act(scenario({ hands: [['2H', '7C'], ['2D', '4D', '6D'], ['3S', '4S']], top: '9H' }), play('p1', '2H', true));
    s = act(s, play('p2', '2D'));
    s = act(s, draw('p3'));
    expect(s.players[0]!.declaredLastCard).toBe(true);
    // Attack someone holding one declared card.
    let t = act(scenario({ hands: [['2H', '5C', '6C'], ['3D'], ['3S', '4S']], top: '9H' }), play('p1', '2H'));
    t = { ...t, players: t.players.map((p) => (p.id === 'p2' ? { ...p, declaredLastCard: true } : p)) };
    t = act(t, draw('p2'));
    expect(t.players[1]!.declaredLastCard).toBe(false);
    expect(hand(t, 'p2')).toHaveLength(3);
  });
});
