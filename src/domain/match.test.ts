import { describe, expect, it } from "vitest";

import type { ChampSelectPlayer, ChampSelectSession, LiveGame, LivePlayer } from "../types";
import { ChampionIndex } from "./champions";
import { formatGameTime, fromChampSelect, fromLive, supportedRole, toRole } from "./match";

const champs = new ChampionIndex({
  version: "test",
  offline: true,
  champions: [
    { id: "Gwen", key: 887, name: "Gwen", tags: [] },
    { id: "Fiora", key: 114, name: "Fiora", tags: [] },
    { id: "Amumu", key: 32, name: "Amumu", tags: [] },
    { id: "LeeSin", key: 64, name: "Lee Sin", tags: [] },
    { id: "MonkeyKing", key: 62, name: "Wukong", tags: [] },
  ],
});

const player = (cellId: number, team: number, over: Partial<ChampSelectPlayer> = {}): ChampSelectPlayer => ({
  cellId,
  team,
  championId: 0,
  championPickIntent: 0,
  assignedPosition: "",
  spell1Id: 0,
  spell2Id: 0,
  gameName: "",
  tagLine: "",
  ...over,
});

const session = (over: Partial<ChampSelectSession>): ChampSelectSession => ({
  localPlayerCellId: 0,
  myTeam: [],
  theirTeam: [],
  actions: [],
  timer: { phase: "BAN_PICK" },
  isSpectating: false,
  ...over,
});

describe("fromChampSelect", () => {
  it("maps keys to ids, side from my team, and my slot", () => {
    const v = fromChampSelect(
      session({
        localPlayerCellId: 6,
        myTeam: [player(5, 2, { championId: 32, assignedPosition: "JUNGLE", spell1Id: 11, spell2Id: 4 }), player(6, 2, { championId: 887, assignedPosition: "top" })],
        theirTeam: [player(0, 1, { championId: 114 })],
      }),
      champs,
    );
    expect(v.side).toBe("red");
    expect(v.me).toMatchObject({ championId: "Gwen", position: "top", isMe: true, hovering: false });
    expect(v.allies[0]).toMatchObject({ championId: "Amumu", position: "jungle", hasSmite: true });
    expect(v.enemies[0]).toMatchObject({ championId: "Fiora", position: null });
  });

  it("uses completed pick actions when theirTeam is not updated yet", () => {
    const v = fromChampSelect(
      session({
        theirTeam: [player(7, 2), player(8, 2)],
        actions: [[{ actorCellId: 7, championId: 64, completed: true, isAllyAction: false, type: "pick" }, { actorCellId: 8, championId: 62, completed: false, isAllyAction: false, type: "pick" }]],
      }),
      champs,
    );
    expect(v.enemies.map((e) => e.championId)).toEqual(["LeeSin", null]);
  });

  it("shows ally hovers as hovering, never enemy hovers", () => {
    const v = fromChampSelect(
      session({ myTeam: [player(0, 1, { championPickIntent: 887 })], theirTeam: [player(5, 2, { championPickIntent: 114 })] }),
      champs,
    );
    expect(v.me).toMatchObject({ championId: "Gwen", hovering: true });
    expect(supportedRole(v.me)).toBeNull();
    expect(v.enemies[0]!.championId).toBeNull();
  });

  it("leaves enemy Smite unknown when spells are hidden", () => {
    const v = fromChampSelect(session({ myTeam: [player(0, 1)], theirTeam: [player(5, 2, { championId: 64 })] }), champs);
    expect(v.enemies[0]!.hasSmite).toBeNull();
    expect(v.allies[0]!.hasSmite).toBe(false);
  });
});

const live = (name: string, riotId: string, team: string, over: Partial<LivePlayer> = {}): LivePlayer => ({
  championName: name,
  rawChampionName: `game_character_displayname_${name.replace(/\W/g, "")}`,
  riotId,
  summonerName: "",
  team,
  position: "",
  level: 1,
  isBot: false,
  isDead: false,
  items: [],
  summonerSpells: { summonerSpellOne: { displayName: "Flash", rawDisplayName: "SummonerFlash" }, summonerSpellTwo: { displayName: "Smite", rawDisplayName: "SummonerSmite" } },
  ...over,
});

const game = (me: string, players: LivePlayer[]): LiveGame => ({
  activePlayer: { riotId: me, summonerName: "", level: 1 },
  allPlayers: players,
  gameData: { gameMode: "CLASSIC", gameTime: 61.7, mapNumber: 11 },
});

describe("fromLive", () => {
  it("splits teams around the local player and maps CHAOS to red", () => {
    const v = fromLive(game("me#EUW", [live("Lee Sin", "them#EUW", "ORDER", { position: "JUNGLE" }), live("Amumu", "me#EUW", "CHAOS")]), champs)!;
    expect(v.side).toBe("red");
    expect(v.me).toMatchObject({ championId: "Amumu", isMe: true, hasSmite: true });
    expect(v.enemies[0]).toMatchObject({ championId: "LeeSin", position: "jungle" });
    expect(v.gameTime).toBe(61.7);
  });

  it("returns null for spectators / replays", () => {
    expect(fromLive(game("spectator#1", [live("Gwen", "a#1", "ORDER")]), champs)).toBeNull();
  });

  it("falls back to the display name when rawChampionName is missing", () => {
    const v = fromLive(game("me#1", [live("Wukong", "me#1", "ORDER", { rawChampionName: "" })]), champs)!;
    expect(v.me!.championId).toBe("MonkeyKing");
  });
});

describe("helpers", () => {
  it("supports only Gwen top and Amumu jungle", () => {
    const slot = { championId: "Gwen", hovering: false, position: null, hasSmite: null, isMe: true, level: null, items: [] };
    expect(supportedRole(slot)).toBe("top");
    expect(supportedRole({ ...slot, championId: "Fiora" })).toBeNull();
    expect(supportedRole(null)).toBeNull();
  });

  it("parses roles and formats game time", () => {
    expect(toRole("UTILITY")).toBe("utility");
    expect(toRole("")).toBeNull();
    expect(formatGameTime(0)).toBe("0:00");
    expect(formatGameTime(605.9)).toBe("10:05");
    expect(formatGameTime(-3)).toBe("0:00");
  });
});
