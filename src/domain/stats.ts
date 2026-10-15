// The player's own numbers for the client-docked panel, from LCU match history (Rust:
// src-tauri/src/history.rs). Everything is derived here so it can be unit-tested.
import type { History, RecentGame } from "../types";

/** LCU numeric champion keys. */
export const GWEN_KEY = 887;
export const AMUMU_KEY = 32;

/** Shorter games are remakes: they say nothing about how the player played. */
export const REMAKE_SECS = 5 * 60;

/** Summoner's Rift modes the Gwen/Amumu advice is about (ARAM, Arena… are left out). */
const RIFT_MODES = new Set(["CLASSIC", "SWIFTPLAY"]);

const QUEUES: Record<number, string> = {
  400: "Normal Draft",
  420: "Ranked Solo/Duo",
  430: "Normal Blind",
  440: "Ranked Flex",
  450: "ARAM",
  480: "Swiftplay",
  490: "Quickplay",
  1700: "Arena",
};

/** A real game: not Practice Tool or a custom lobby, and not a remake. */
export function isRealGame(g: RecentGame): boolean {
  return g.gameType !== "CUSTOM_GAME" && g.gameMode !== "PRACTICETOOL" && g.durationSecs >= REMAKE_SECS;
}

export function isRiftGame(g: RecentGame): boolean {
  return isRealGame(g) && RIFT_MODES.has(g.gameMode);
}

export function queueName(g: RecentGame): string {
  return QUEUES[g.queueId] ?? g.gameMode.charAt(0) + g.gameMode.slice(1).toLowerCase();
}

/** (kills + assists) / deaths, with 0 deaths counted as 1 (the usual "perfect KDA" rule). */
export function kdaRatio(k: number, d: number, a: number): number {
  return (k + a) / Math.max(1, d);
}

export interface Rates {
  kda: number;
  csPerMin: number;
  damagePerMin: number;
}

function rates(games: RecentGame[]): Rates {
  const sum = (f: (g: RecentGame) => number) => games.reduce((t, g) => t + f(g), 0);
  const minutes = Math.max(1, sum((g) => g.durationSecs) / 60);
  return {
    kda: kdaRatio(sum((g) => g.kills), sum((g) => g.deaths), sum((g) => g.assists)),
    csPerMin: sum((g) => g.cs) / minutes,
    damagePerMin: sum((g) => g.damageToChampions) / minutes,
  };
}

export interface ChampStats extends Rates {
  championKey: number;
  games: number;
  wins: number;
  winRate: number;
  /** Average kills / deaths / assists per game. */
  kills: number;
  deaths: number;
  assists: number;
  /** Newest first: true = win. */
  form: boolean[];
  mastery: { level: number; points: number } | null;
}

/** Summoner's Rift stats on one champion; null when there are no real games on it. */
export function champStats(history: History, championKey: number): ChampStats | null {
  const games = history.games.filter((g) => g.championId === championKey && isRiftGame(g));
  const m = history.mastery.find((x) => x.championId === championKey);
  const mastery = m ? { level: m.level, points: m.points } : null;
  if (!games.length) return mastery ? { ...emptyStats(championKey), mastery } : null;
  const n = games.length;
  const wins = games.filter((g) => g.win).length;
  const avg = (f: (g: RecentGame) => number) => games.reduce((t, g) => t + f(g), 0) / n;
  return {
    championKey,
    games: n,
    wins,
    winRate: wins / n,
    kills: avg((g) => g.kills),
    deaths: avg((g) => g.deaths),
    assists: avg((g) => g.assists),
    ...rates(games),
    form: games.slice(0, 10).map((g) => g.win),
    mastery,
  };
}

function emptyStats(championKey: number): ChampStats {
  return { championKey, games: 0, wins: 0, winRate: 0, kills: 0, deaths: 0, assists: 0, kda: 0, csPerMin: 0, damagePerMin: 0, form: [], mastery: null };
}

export interface Recap extends Rates {
  game: RecentGame;
  /** Same champion's average over the other Summoner's Rift games, when there are any. */
  usual: Rates | null;
  /** How many games `usual` is based on. */
  usualGames: number;
}

/** The newest real game, compared with the player's usual numbers on that champion. */
export function lastGameRecap(history: History): Recap | null {
  const game = history.games.find(isRealGame);
  if (!game) return null;
  const others = isRiftGame(game) ? history.games.filter((g) => g !== game && g.championId === game.championId && isRiftGame(g)) : [];
  return { game, ...rates([game]), usual: others.length ? rates(others) : null, usualGames: others.length };
}

/** "just now", "25 min ago", "3 h ago", "2 days ago". */
export function timeAgo(ms: number, now: number): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
