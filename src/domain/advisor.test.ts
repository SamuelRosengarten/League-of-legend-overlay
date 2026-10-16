// End-to-end over the mock fixtures: raw API payload → MatchView → Advice.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadCurated } from "../data";
import type { ChampSelectSession, LiveGame } from "../types";
import { buildAdvice } from "./advisor";
import { ChampionIndex } from "./champions";
import { type MatchView, type Slot, fromChampSelect, fromLive } from "./match";

const data = loadCurated();
// Minimal Data Dragon stand-in: keys used by the fixtures.
const champs = new ChampionIndex({
  version: "test",
  offline: true,
  champions: Object.entries({
    Gwen: 887, Fiora: 114, Amumu: 32, LeeSin: 64, Yasuo: 157, Darius: 122, Jinx: 222, Thresh: 412, Lux: 99,
    Ezreal: 81, Vi: 254, Viego: 234, Kaisa: 145, Nautilus: 111, Morgana: 25, Ahri: 103, Orianna: 61,
    Renekton: 58, Syndra: 134, Teemo: 17, Graves: 104, Caitlyn: 51, Leona: 89, Sejuani: 113, Malphite: 54,
    Senna: 235, Zed: 238, Ashe: 22, Fiddlesticks: 9,
  }).map(([id, key]) => ({ id, key, name: id, tags: [] })),
});

interface Step { label: string; champSelect?: ChampSelectSession | null; liveGame?: LiveGame | null }
const scenario = (id: string): Step[] =>
  JSON.parse(readFileSync(new URL(`../../fixtures/scenarios/${id}.json`, import.meta.url), "utf8")).steps;
const lastWith = <K extends "champSelect" | "liveGame">(steps: Step[], key: K) =>
  [...steps].reverse().find((s) => s[key])![key]!;

describe("advisor over fixtures", () => {
  it("gwen-vs-fiora: Fiora is the lane opponent and top threat; hidden picks are counted", () => {
    const steps = scenario("gwen-vs-fiora");
    const partial = buildAdvice(fromChampSelect(steps[3]!.champSelect!, champs), champs, data);
    expect(partial.status).toBe("ok");
    if (partial.status !== "ok") return;
    expect(partial.threats.hidden).toBe(1);
    expect(partial.laneOpponent?.championId).toBeNull();

    const full = buildAdvice(fromChampSelect(lastWith(steps, "champSelect"), champs), champs, data);
    if (full.status !== "ok") throw new Error(full.status);
    expect(full.laneOpponent?.championId).toBe("Fiora");
    expect(full.laneOpponent?.entry?.difficulty).toBe(4);
    expect(full.threats.ranked[0]!.championId).toBe("Fiora");
  });

  it("amumu-vs-leesin-red: red side, Lee Sin inferred as enemy jungler, bad-engage warning", () => {
    const steps = scenario("amumu-vs-leesin-red");
    const match = fromChampSelect(lastWith(steps, "champSelect"), champs);
    expect(match.side).toBe("red");
    const advice = buildAdvice(match, champs, data);
    if (advice.status !== "ok") throw new Error(advice.status);
    expect(advice.laneOpponent).toMatchObject({ championId: "LeeSin", assignment: { role: "jungle", source: "inferred" } });
    expect(advice.laneOpponent?.entry?.jungle?.invadeRisk).toBe("high");
    expect(advice.warnings.map((w) => w.id)).toContain("bad-engage");
  });

  it("amumu in game: QSS bought by Ezreal shows up as an item-sourced reason", () => {
    const game = lastWith(scenario("amumu-vs-leesin-red"), "liveGame");
    const advice = buildAdvice(fromLive(game, champs)!, champs, data);
    if (advice.status !== "ok") throw new Error(advice.status);
    const ezreal = advice.threats.ranked.find((t) => t.championId === "Ezreal")!;
    expect(ezreal.reasons.find((r) => r.tag === "cleanse")?.via).toEqual([{ source: "item", detail: "Quicksilver Sash" }]);
  });

  it("unsupported-champion: Yasuo is reported as unsupported in champ select and in game", () => {
    const steps = scenario("unsupported-champion");
    expect(buildAdvice(fromChampSelect(lastWith(steps, "champSelect"), champs), champs, data)).toEqual({ status: "unsupported", championId: "Yasuo" });
    expect(buildAdvice(fromLive(lastWith(steps, "liveGame"), champs)!, champs, data)).toEqual({ status: "unsupported", championId: "Yasuo" });
  });

  it("partially-hidden-enemies: no positions anywhere, roles inferred for both teams", () => {
    const advice = buildAdvice(fromChampSelect(lastWith(scenario("partially-hidden-enemies"), "champSelect"), champs), champs, data);
    if (advice.status !== "ok") throw new Error(advice.status);
    expect(advice.laneOpponent?.championId).toBe("Darius");
    expect(advice.threats.hidden).toBe(1);
    expect(advice.allyRoles.map((r) => r.role)).toEqual(["top", "jungle", "middle", "bottom", "utility"]);
  });

  it("reports missing data instead of guessing", () => {
    const match = fromChampSelect(lastWith(scenario("gwen-vs-fiora"), "champSelect"), champs);
    expect(buildAdvice(match, champs, { ...data, matchups: {} })).toEqual({ status: "missing-data", championId: "Gwen", role: "top" });
  });

  it("waits while my champion is only hovered", () => {
    const first = scenario("gwen-vs-fiora")[1]!.champSelect!;
    expect(buildAdvice(fromChampSelect(first, champs), champs, data)).toEqual({ status: "no-champion" });
  });
});

describe("Fiddlesticks as a support", () => {
  const slot = (championId: string | null, position: Slot["position"], isMe = false): Slot => ({
    championId, hovering: false, position, hasSmite: false, isMe, level: null, items: [],
  });
  const match: MatchView = {
    source: "champ-select",
    side: "blue",
    me: slot("Fiddlesticks", "utility", true),
    allies: [slot("Fiddlesticks", "utility", true)],
    enemies: [slot("Jinx", "bottom"), slot("Morgana", "utility"), slot("Leona", "top"), slot("Lux", "middle")],
    gameTime: null,
  };

  it("is supported in the utility role, with the enemy support as lane opponent", () => {
    const advice = buildAdvice(match, champs, data);
    if (advice.status !== "ok") throw new Error(advice.status);
    expect(advice.role).toBe("utility");
    expect(advice.laneOpponent).toMatchObject({ championId: "Morgana", assignment: { role: "utility", source: "api" } });
    expect(advice.laneOpponent?.entry?.dangerAbilities[0]!.name).toBe("Black Shield");
    expect(advice.plan).toBeNull();
  });

  it("warns about shields / cleanses and engage-heavy comps", () => {
    const advice = buildAdvice(match, champs, data);
    if (advice.status !== "ok") throw new Error(advice.status);
    expect(advice.warnings.map((w) => w.id)).toContain("engage-heavy");
  });
});
