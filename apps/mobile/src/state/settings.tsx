import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MatchMode, PacingName } from '../game';

export interface Settings {
  readonly playerName: string;
  readonly botCount: number;
  readonly pacing: PacingName;
  readonly haptics: boolean;
  readonly highlightPlayable: boolean;
  readonly mode: MatchMode;
}

export interface Stats {
  readonly played: number;
  readonly won: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** Knockouts tournaments finished / won (as champion). */
  readonly tournaments: number;
  readonly championships: number;
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'You',
  botCount: 3,
  pacing: 'normal',
  haptics: true,
  highlightPlayable: true,
  mode: 'classic',
};

export const EMPTY_STATS: Stats = { played: 0, won: 0, currentStreak: 0, bestStreak: 0, tournaments: 0, championships: 0 };

const SETTINGS_KEY = 'ukbj.settings.v1';
const STATS_KEY = 'ukbj.stats.v1';

interface SettingsContextValue {
  settings: Settings;
  stats: Stats;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  recordResult: (won: boolean, mode?: MatchMode) => void;
  resetStats: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

async function readJson<T extends object>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...(parsed as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

/** Persists settings and win/loss stats on the device. Nothing leaves the phone. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([readJson(SETTINGS_KEY, DEFAULT_SETTINGS), readJson(STATS_KEY, EMPTY_STATS)]).then(([s, st]) => {
      if (!alive) return;
      setSettings(s);
      setStats(st);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeJson(SETTINGS_KEY, next);
      return next;
    });
  }, []);

  const recordResult = useCallback((won: boolean, mode: MatchMode = 'classic') => {
    setStats((prev) => {
      if (mode === 'knockouts') {
        const ko: Stats = { ...prev, tournaments: prev.tournaments + 1, championships: prev.championships + (won ? 1 : 0) };
        writeJson(STATS_KEY, ko);
        return ko;
      }
      const currentStreak = won ? prev.currentStreak + 1 : 0;
      const next: Stats = {
        ...prev,
        played: prev.played + 1,
        won: prev.won + (won ? 1 : 0),
        currentStreak,
        bestStreak: Math.max(prev.bestStreak, currentStreak),
      };
      writeJson(STATS_KEY, next);
      return next;
    });
  }, []);

  const resetStats = useCallback(() => {
    setStats(EMPTY_STATS);
    writeJson(STATS_KEY, EMPTY_STATS);
  }, []);

  const value = useMemo(
    () => ({ settings, stats, loaded, update, recordResult, resetStats }),
    [settings, stats, loaded, update, recordResult, resetStats],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
