import { describe, expect, it } from 'vitest';
import { getLegalMoves, getPlayerView, startGame } from '@ukbj/game-engine';
import { act, draw, play, scenario } from './helpers';

const seats = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Cara' },
];

describe('hidden-card protection', () => {
  it('a view contains only the viewer hand, never opponents hands or deck order', () => {
    const s = startGame({ seed: 'secret', players: seats });
    const view = getPlayerView(s, 'a');
    const json = JSON.stringify(view);
    expect(view.hand).toEqual(s.players[0]!.hand);
    for (const opp of s.players.slice(1)) for (const c of opp.hand) expect(json).not.toContain(`"${c.id}"`);
    for (const c of s.drawPile) expect(json).not.toContain(`"${c.id}"`);
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('processedActionIds');
    expect(view.players.map((p) => p.cardCount)).toEqual([7, 7, 7]);
    expect(view.drawPileCount).toBe(s.drawPile.length);
  });

  it("redacts other players' drawn cards in the event log but keeps the count", () => {
    let s = scenario({ hands: [['3C', '4C', '6C'], ['5D'], ['6D']], top: '9H', drawPile: ['7S'], leftovers: 'discard' });
    s = act(s, draw('p1'));
    const own = getPlayerView(s, 'p1').events.find((e) => e.type === 'CARDS_DRAWN');
    const other = getPlayerView(s, 'p2').events.find((e) => e.type === 'CARDS_DRAWN');
    expect(own).toMatchObject({ cards: [{ id: '7S' }], count: 1 });
    expect(other).toMatchObject({ cards: [], count: 1 });
    expect(JSON.stringify(getPlayerView(s, 'p2'))).not.toContain('"7S"');
  });

  it('spectators (or unknown viewers) see no hand and no legal moves', () => {
    const s = startGame({ seed: 'spec', players: seats });
    for (const v of [getPlayerView(s, null), getPlayerView(s, 'intruder')]) {
      expect(v.hand).toEqual([]);
      expect(v.legalMoves).toEqual([]);
      expect(v.viewerId).toBeNull();
      const json = JSON.stringify(v);
      for (const p of s.players) for (const c of p.hand) expect(json).not.toContain(`"${c.id}"`);
    }
  });

  it('a drawn card is shown only to the drawer (event log), and there is never a pending drawn card', () => {
    let s = scenario({ hands: [['3C', '4C', '6C'], ['5D', '7D'], ['6D', '8D']], top: '9H', drawPile: ['5H'], leftovers: 'discard' });
    s = act(s, draw('p1'));
    expect(getPlayerView(s, 'p1').drawnCardId).toBeNull();
    expect(getPlayerView(s, 'p1').events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({ cards: [{ id: '5H' }] });
    expect(getPlayerView(s, 'p2').events.find((e) => e.type === 'CARDS_DRAWN')).toMatchObject({ cards: [], count: 1 });
  });

  it('exposes mode, player status and finishing places', () => {
    const s = scenario({ hands: [['3C', '4C'], [], ['6D', '8D']], top: '9H', mode: 'knockout', statuses: ['active', 'finished', 'active'], finishOrder: ['p2'] });
    const v = getPlayerView(s, 'p1');
    expect(v.mode).toBe('knockout');
    expect(v.players.map((p) => [p.status, p.place])).toEqual([['active', null], ['finished', 1], ['active', null]]);
    expect(v.finishOrder).toEqual(['p2']);
  });

  it('includes the viewer legal moves and supports incremental events', () => {
    let s = scenario({ hands: [['5H', '9S', 'KC'], ['5C', '6C']], top: '9H' });
    const v1 = getPlayerView(s, 'p1');
    expect(v1.legalMoves).toEqual(getLegalMoves(s, 'p1'));
    s = act(s, play('p1', '5H'));
    const delta = getPlayerView(s, 'p2', { eventsSinceVersion: v1.version });
    expect(delta.events.every((e) => e.version > v1.version)).toBe(true);
    expect(delta.events.length).toBeGreaterThan(0);
  });
});
