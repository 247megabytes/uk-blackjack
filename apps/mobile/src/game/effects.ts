/**
 * Turns engine events into short, human-readable table effects (banners) plus a
 * haptic hint. Pure, so the wording and priority rules are unit-tested.
 */

import { SUIT_NAMES, type Card, type GameEvent, type PlayerId, type PlayerView } from '@ukbj/game-engine';

export type EffectTone = 'attack' | 'defend' | 'info' | 'warn' | 'win' | 'turn';
export type HapticHint = 'none' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface TableEffect {
  /** Stable key: "<version>-<index>". */
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly tone: EffectTone;
  readonly haptic: HapticHint;
  /** Player the effect is about (for highlighting a seat). */
  readonly playerId?: PlayerId;
  /** Set on Last Card window prompts: the banner is withdrawn as soon as that window closes. */
  readonly windowFor?: PlayerId;
}

const TONE_PRIORITY: Record<EffectTone, number> = { win: 5, attack: 4, warn: 3, defend: 3, info: 1, turn: 0 };

/**
 * Chooses the one banner to show for a batch of simultaneous effects: the most
 * important, latest on ties. Banners never queue, so they can't lag behind the table.
 */
export function pickBanner(effects: readonly TableEffect[]): TableEffect | null {
  let best: TableEffect | null = null;
  for (const e of effects) if (!best || TONE_PRIORITY[e.tone] >= TONE_PRIORITY[best.tone]) best = e;
  return best;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

function powerList(cards: readonly Card[]): string {
  const names = cards.map((c) => (c.rank === 'J' ? 'Jack' : c.rank === 'K' ? 'King' : c.rank));
  const uniq = [...new Set(names)];
  return uniq.length === 1 ? (cards.length > 1 ? `${uniq[0]}s` : `The ${uniq[0]}`) : 'Power cards';
}

const RANK_NAMES: Record<Card['rank'], string> = {
  A: 'Ace', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
  '8': 'Eight', '9': 'Nine', '10': 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
};

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}

/**
 * Produces effects for `events` from the viewpoint of `viewerId`.
 * `nameOf` resolves display names; the viewer is addressed as "You".
 */
export function describeEvents(
  events: readonly GameEvent[],
  viewerId: PlayerId | null,
  nameOf: (id: PlayerId) => string,
): TableEffect[] {
  const out: TableEffect[] = [];
  const who = (id: PlayerId) => (id === viewerId ? 'You' : nameOf(id));
  const isYou = (id: PlayerId) => id === viewerId;
  const versionCount = new Map<number, number>();

  const push = (e: GameEvent, effect: Omit<TableEffect, 'key'>) => {
    const i = versionCount.get(e.version) ?? 0;
    versionCount.set(e.version, i + 1);
    out.push({ key: `${e.version}-${i}`, ...effect });
  };

  for (const e of events) {
    switch (e.type) {
      case 'ATTACK_STARTED':
        push(e, e.kind === 'blackJack'
          ? { title: 'Black Jack!', subtitle: `Pick up ${e.amount}`, tone: 'attack', haptic: 'heavy' }
          : { title: 'Two!', subtitle: `Pick up ${e.amount}`, tone: 'attack', haptic: 'medium' });
        break;
      case 'ATTACK_STACKED':
        push(e, { title: e.kind === 'blackJack' ? 'Stacked Black Jack!' : 'Stacked Two!', subtitle: `Now pick up ${e.amount}`, tone: 'attack', haptic: 'heavy' });
        break;
      case 'ATTACK_CANCELLED':
        push(e, { title: 'Red Jack block!', subtitle: `${who(e.playerId)} cancelled ${e.cancelledAmount} cards`, tone: 'defend', haptic: 'success', playerId: e.playerId });
        break;
      case 'DIRECTION_REVERSED':
        push(e, { title: 'Reverse', subtitle: e.direction === 1 ? 'Now clockwise' : 'Now anticlockwise', tone: 'info', haptic: 'light' });
        break;
      case 'PLAYER_SKIPPED':
        push(e, { title: 'Skip', subtitle: isYou(e.playerId) ? 'You miss a turn' : `${nameOf(e.playerId)} misses a turn`, tone: 'info', haptic: isYou(e.playerId) ? 'warning' : 'light', playerId: e.playerId });
        break;
      case 'CARDS_DRAWN':
        if (e.reason === 'blackJackPenalty' || e.reason === 'twoPenalty') {
          push(e, {
            title: `${who(e.playerId)} ${isYou(e.playerId) ? 'pick' : 'picks'} up ${e.count}`,
            subtitle: e.count < e.requested ? `Only ${e.count} of ${e.requested} cards left` : undefined,
            tone: 'warn',
            haptic: isYou(e.playerId) ? 'error' : 'light',
            playerId: e.playerId,
          });
        }
        break;
      case 'LAST_CARD_DECLARED':
        push(e, { title: 'Last Card!', subtitle: `${who(e.playerId)} ${isYou(e.playerId) ? 'are' : 'is'} on one card`, tone: 'warn', haptic: 'medium', playerId: e.playerId });
        break;
      case 'LAST_CARD_WINDOW_OPENED':
        push(e, isYou(e.playerId)
          ? { title: 'Say Last Card!', subtitle: 'Tap Last Card before someone catches you', tone: 'warn', haptic: 'warning', playerId: e.playerId, windowFor: e.playerId }
          : { title: `${nameOf(e.playerId)} forgot Last Card`, subtitle: `Tap Catch ${nameOf(e.playerId)} before they say it`, tone: 'warn', haptic: 'light', playerId: e.playerId, windowFor: e.playerId });
        break;
      case 'LAST_CARD_CHALLENGED':
        push(e, {
          title: 'Caught!',
          subtitle: `${who(e.challengerId)} caught ${isYou(e.targetPlayerId) ? 'you' : nameOf(e.targetPlayerId)} — pick up 2`,
          tone: 'attack',
          haptic: isYou(e.targetPlayerId) ? 'error' : 'success',
          playerId: e.targetPlayerId,
        });
        break;
      case 'SEQUENCE_PLAYED':
        push(e, { title: `${who(e.playerId)} ${isYou(e.playerId) ? 'play' : 'plays'} ${e.cards.length} cards`, tone: 'info', haptic: 'light', playerId: e.playerId });
        break;
      case 'SUIT_CHOSEN':
        push(e, { title: `${SUIT_NAMES[e.suit]}!`, subtitle: `${who(e.playerId)} ${isYou(e.playerId) ? 'call' : 'calls'} ${SUIT_NAMES[e.suit].toLowerCase()} with an Ace`, tone: 'warn', haptic: 'medium', playerId: e.playerId });
        break;
      case 'QUEEN_UNCOVERED':
        push(e, {
          title: 'Queen left uncovered',
          subtitle: `${who(e.playerId)} ${isYou(e.playerId) ? 'pick' : 'picks'} up 1`,
          tone: 'warn',
          haptic: isYou(e.playerId) ? 'error' : 'light',
          playerId: e.playerId,
        });
        break;
      case 'POWER_COVERED':
        push(e, {
          title: 'Covered',
          subtitle: `${powerList(e.cards)} covered — no effect`,
          tone: 'defend',
          haptic: 'light',
          playerId: e.playerId,
        });
        break;
      case 'PLAYER_FINISHED':
        push(e, {
          title: isYou(e.playerId) ? `You're out — ${ordinal(e.place)}!` : `${nameOf(e.playerId)} is out — ${ordinal(e.place)}`,
          subtitle: isYou(e.playerId) ? 'Safe this round' : 'Safe this round',
          tone: isYou(e.playerId) ? 'win' : 'info',
          haptic: isYou(e.playerId) ? 'success' : 'light',
          playerId: e.playerId,
        });
        break;
      case 'PLAYER_FORFEITED':
        push(e, { title: `${who(e.playerId)} left`, subtitle: isYou(e.playerId) ? 'You forfeited' : `${nameOf(e.playerId)} forfeits`, tone: 'warn', haptic: 'warning', playerId: e.playerId });
        break;
      case 'ROUND_COMPLETE':
        push(e, e.eliminatedId
          ? { title: isYou(e.eliminatedId) ? 'Knocked out' : `${nameOf(e.eliminatedId)} is knocked out`, subtitle: e.reason === 'stalled' ? 'Round stalled — most cards goes' : 'Last one holding cards', tone: 'win', haptic: isYou(e.eliminatedId) ? 'error' : 'success', playerId: e.eliminatedId }
          : { title: 'Round over', tone: 'win', haptic: 'light' });
        break;
      case 'TURN_STARTED':
        if (isYou(e.playerId)) push(e, { title: 'Your turn', tone: 'turn', haptic: 'light', playerId: e.playerId });
        break;
      case 'DISCARDS_RECYCLED':
        push(e, { title: 'Reshuffle', subtitle: `${e.count} cards back in the deck`, tone: 'info', haptic: 'light' });
        break;
      case 'GAME_WON':
        push(e, { title: isYou(e.playerId) ? 'You win!' : `${nameOf(e.playerId)} wins`, tone: 'win', haptic: isYou(e.playerId) ? 'success' : 'warning', playerId: e.playerId });
        break;
      case 'STALEMATE':
        push(e, { title: 'Stalemate', subtitle: e.winnerId ? `${who(e.winnerId)} ${isYou(e.winnerId) ? 'have' : 'has'} the fewest cards` : 'Nobody can move', tone: 'win', haptic: 'warning' });
        break;
      default:
        break;
    }
  }
  return out;
}

/** The cards played in the most recent turn, in order (for the discard fan). */
export function lastTurnCards(view: PlayerView): Card[] {
  const play = lastPlay(view);
  if (!play) return [];
  return view.events.filter((e): e is Extract<GameEvent, { type: 'CARD_PLAYED' }> => e.type === 'CARD_PLAYED' && e.version === play.version).map((e) => e.card);
}

/** The most recent CARD_PLAYED event in a view (used to animate the discard from the right seat). */
export function lastPlay(view: PlayerView): { playerId: PlayerId; card: Card; version: number } | null {
  for (let i = view.events.length - 1; i >= 0; i--) {
    const e = view.events[i]!;
    if (e.type === 'CARD_PLAYED') return { playerId: e.playerId, card: e.card, version: e.version };
  }
  return null;
}

/** Status line for the human, e.g. "Your turn — match ♥ or 9". */
export function statusLine(view: PlayerView, nameOf: (id: PlayerId) => string): string {
  if (view.phase === 'finished') return view.mode === 'knockout' ? 'Round over' : 'Game over';
  const me = view.players.find((p) => p.id === view.viewerId);
  if (!me) return `Watching — ${nameOf(view.currentPlayerId)} to play`;
  if (me.status === 'finished') return `You finished ${ordinal(me.place ?? 0)} — watching the rest of the round`;
  if (view.phase === 'lastCardWindow') {
    return view.lastCardWindowPlayerId === view.viewerId ? 'Quick — say Last Card!' : `${nameOf(view.lastCardWindowPlayerId ?? '')} is on one card…`;
  }
  const yourTurn = view.currentPlayerId === view.viewerId;
  if (!yourTurn) return `${nameOf(view.currentPlayerId)} is thinking…`;
  if (view.pendingAttack) {
    return view.pendingAttack.kind === 'two'
      ? `Play a 2 or a red Jack, or pick up ${view.pendingAttack.amount}`
      : `Play a Jack or pick up ${view.pendingAttack.amount}`;
  }
  const top = view.topCard;
  const hasPlay = view.legalMoves.some((m) => m.type === 'PLAY_CARDS');
  if (!hasPlay) return 'No match — draw a card';
  if (view.activeSuit) return `Your turn — ${SUIT_NAMES[view.activeSuit].toLowerCase()} were called, or play an Ace`;
  return top ? `Your turn — match ${SUIT_NAMES[top.suit].toLowerCase()} or ${RANK_NAMES[top.rank].toLowerCase()}s` : 'Your turn';
}
