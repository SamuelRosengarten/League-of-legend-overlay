import { describe, expect, it } from "vitest";

import type { History, RecentGame } from "../types";
import { AMUMU_KEY, GWEN_KEY, champStats, isRealGame, kdaRatio, lastGameRecap, queueName, timeAgo } from "./stats";

let id = 0;
const game = (patch: Partial<RecentGame>): RecentGame => ({
  gameId: ++id,
  championId: GWEN_KEY,
  queueId: 420,
  gameMode: "CLASSIC",
  gameType: "MATCHED_GAME",
  created: 1_000_000 - id,
  durationSecs: 1800,
  win: true,
  kills: 6,
  deaths: 3,
  assists: 6,
  cs: 240,
  damageToChampions: 24_000,
  gold: 12_000,
  ...patch,
});

describe("match history stats", () => {
  it("leaves out Practice Tool, custom games and remakes", () => {
    expect(isRealGame(game({}))).toBe(true);
    expect(isRealGame(game({ gameMode: "PRACTICETOOL", gameType: "CUSTOM_GAME" }))).toBe(false);
    expect(isRealGame(game({ durationSecs: 200 }))).toBe(false);
  });

  it("aggregates Summoner's Rift games per champion", () => {
    const history: History = {
      games: [
        game({ win: true, kills: 9, deaths: 3, assists: 6 }),
        game({ win: false, kills: 3, deaths: 6, assists: 3 }),
        game({ gameMode: "ARAM", queueId: 450, kills: 20 }), // other mode: ignored
        game({ gameMode: "PRACTICETOOL", gameType: "CUSTOM_GAME" }), // ignored
        game({ championId: AMUMU_KEY }),
      ],
      mastery: [{ championId: GWEN_KEY, level: 7, points: 61_000 }],
    };
    const s = champStats(history, GWEN_KEY)!;
    expect(s.games).toBe(2);
    expect(s.winRate).toBe(0.5);
    expect(s.kills).toBe(6);
    expect(s.kda).toBeCloseTo((12 + 9) / 9);
    expect(s.csPerMin).toBeCloseTo(480 / 60);
    expect(s.form).toEqual([true, false]);
    expect(s.mastery).toEqual({ level: 7, points: 61_000 });
    expect(champStats({ games: [], mastery: [] }, GWEN_KEY)).toBeNull();
    // Mastery but no recent games: still a card, with zero games.
    expect(champStats({ games: [], mastery: [{ championId: AMUMU_KEY, level: 4, points: 1 }] }, AMUMU_KEY)?.games).toBe(0);
  });

  it("recaps the newest real game against the usual numbers on that champion", () => {
    const last = game({ kills: 10, deaths: 2, assists: 4, cs: 270, durationSecs: 1800 });
    const history: History = {
      games: [game({ gameMode: "PRACTICETOOL", gameType: "CUSTOM_GAME" }), last, game({ kills: 2, deaths: 4, assists: 2 }), game({ championId: AMUMU_KEY })],
      mastery: [],
    };
    const r = lastGameRecap(history)!;
    expect(r.game).toBe(last);
    expect(r.kda).toBe(7);
    expect(r.csPerMin).toBe(9);
    expect(r.usualGames).toBe(1);
    expect(r.usual?.kda).toBe(1);
    expect(lastGameRecap({ games: [], mastery: [] })).toBeNull();
  });

  it("formats helpers", () => {
    expect(kdaRatio(5, 0, 5)).toBe(10);
    expect(queueName(game({ queueId: 420 }))).toBe("Ranked Solo/Duo");
    expect(queueName(game({ queueId: 9999, gameMode: "URF" }))).toBe("Urf");
    const now = 10 * 86_400_000;
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 25 * 60_000, now)).toBe("25 min ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe("yesterday");
  });
});
