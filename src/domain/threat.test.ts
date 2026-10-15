import { describe, expect, it } from "vitest";

import { loadCurated } from "../data";
import type { ChampionProfile, ItemCountersFile, MatchupFile } from "../data/types";
import { ChampionIndex } from "./champions";
import { profileLookup } from "./profiles";
import { LANE_OPPONENT_BONUS, type Threat, UNCURATED_BASE, headlineReason, rankThreats } from "./threat";
import { teamWarnings } from "./warnings";

const data = loadCurated();
const champs = new ChampionIndex(null);
const profileOf = profileLookup(data.tags, champs);

// Small hand-built matchup file so the arithmetic is easy to follow.
const profile = (traits: ChampionProfile["traits"]): ChampionProfile => ({
  damage: "physical", range: "melee", mobility: "low", typicalRoles: ["top"], cc: [], traits, earlyGame: 2,
});
const tinyMatchups: MatchupFile = {
  champion: "Gwen",
  role: "top",
  threatWeights: { "true-damage": 2, "ranged-poke": 1, "grievous-wounds": 1.5 },
  genericAdvice: {},
  matchups: {
    Fiora: { ...data.matchups.Gwen!.matchups.Fiora!, threat: 4, threatTags: ["true-damage"] },
  },
};
const tinyProfiles = (id: string | null) =>
  id === "Fiora" ? { profile: profile(["true-damage", "healing"]), source: "tags" as const }
  : id === "Teemo" ? { profile: profile(["ranged-poke"]), source: "tags" as const }
  : null;
const counters: ItemCountersFile = {
  items: { "3123": { name: "Executioner's Calling", effects: ["grievous-wounds"], relevantTo: ["Gwen"], note: "anti-heal", confidence: "high" } },
};

describe("rankThreats", () => {
  it("scores base + tag weights + lane bonus, and explains every point", () => {
    const { ranked } = rankThreats(
      [{ championId: "Fiora", role: "top", items: [] }],
      { me: "Gwen", myRole: "top", matchups: tinyMatchups, items: null, profileOf: tinyProfiles },
    );
    const fiora = ranked[0]!;
    // 4 (curated) + 1.5 (lane) + 2 (true-damage, counted once even though two sources list it)
    expect(fiora.score).toBe(4 + LANE_OPPONENT_BONUS + 2);
    expect(fiora.reasons.map((r) => r.label)).toEqual(["Curated threat 4/5", "Lane opponent", "true-damage"]);
    expect(fiora.reasons[2]!.via).toEqual([{ source: "champion" }, { source: "matchup" }]);
    expect(fiora.score).toBe(fiora.reasons.reduce((s, r) => s + r.points, 0));
  });

  it("uses the generic base for uncurated enemies and ignores unweighted tags", () => {
    const { ranked } = rankThreats(
      [{ championId: "Teemo", role: "top", items: [] }, { championId: "Zed", role: "middle", items: [] }],
      { me: "Gwen", myRole: "top", matchups: tinyMatchups, items: null, profileOf: tinyProfiles },
    );
    expect(ranked.map((t) => [t.championId, t.score])).toEqual([
      ["Teemo", UNCURATED_BASE + LANE_OPPONENT_BONUS + 1],
      ["Zed", UNCURATED_BASE],
    ]);
    expect(ranked[0]!.curated).toBeNull();
  });

  it("re-ranks when an enemy buys a counter item, citing the item", () => {
    const enemies = [
      { championId: "Teemo", role: "middle" as const, items: [] as number[] },
      { championId: "Zed", role: "bottom" as const, items: [] as number[] },
    ];
    const ctx = { me: "Gwen", myRole: "top" as const, matchups: tinyMatchups, items: counters, profileOf: tinyProfiles };
    expect(rankThreats(enemies, ctx).ranked[0]!.championId).toBe("Teemo");
    enemies[1]!.items = [3123];
    const after = rankThreats(enemies, ctx).ranked;
    expect(after[0]!.championId).toBe("Zed");
    expect(after[0]!.reasons.at(-1)).toMatchObject({ label: "grievous-wounds", via: [{ source: "item", detail: "Executioner's Calling" }] });
  });

  it("ignores counter items that are not relevant to my champion", () => {
    const amumuOnly: ItemCountersFile = { items: { "3140": { ...counters.items["3123"]!, effects: ["cleanse"], relevantTo: ["Amumu"] } } };
    const { ranked } = rankThreats(
      [{ championId: "Zed", role: "middle", items: [3140] }],
      { me: "Gwen", myRole: "top", matchups: { ...tinyMatchups, threatWeights: { cleanse: 3 } }, items: amumuOnly, profileOf: tinyProfiles },
    );
    expect(ranked[0]!.score).toBe(UNCURATED_BASE);
  });

  it("counts hidden enemies separately", () => {
    const res = rankThreats(
      [{ championId: null, role: "top", items: [] }, { championId: "Fiora", role: null, items: [] }],
      { me: "Gwen", myRole: "top", matchups: tinyMatchups, items: null, profileOf: tinyProfiles },
    );
    expect(res.hidden).toBe(1);
    expect(res.ranked).toHaveLength(1);
    expect(res.ranked[0]!.reasons.some((r) => r.kind === "lane")).toBe(false);
  });

  it("with real data, ranks Fiora as Gwen's top threat in the gwen-vs-fiora comp", () => {
    const { ranked } = rankThreats(
      [
        { championId: "Fiora", role: "top", items: [] },
        { championId: "Viego", role: "jungle", items: [] },
        { championId: "Ahri", role: "middle", items: [] },
        { championId: "Jinx", role: "bottom", items: [] },
        { championId: "Thresh", role: "utility", items: [] },
      ],
      { me: "Gwen", myRole: "top", matchups: data.matchups.Gwen!, items: data.items, profileOf },
    );
    expect(ranked[0]!.championId).toBe("Fiora");
  });
});

describe("teamWarnings", () => {
  const name = (id: string) => id;
  it("warns Amumu about anti-engage + heavy CC comps (Morgana E)", () => {
    const w = teamWarnings(
      "Amumu",
      ["Darius", "LeeSin", "Syndra", "Ezreal", "Morgana"].map((championId) => ({ championId, items: [] })),
      { profileOf, items: data.items, name },
    );
    const engage = w.find((x) => x.id === "bad-engage")!;
    expect(engage.champions).toEqual(expect.arrayContaining(["Morgana", "LeeSin", "Syndra"]));
    expect(engage.text).toMatch(/flanks/);
  });

  it("adds counter items bought in game (QSS) to the anti-engage count", () => {
    const comp = ["Garen", "Zed", "Ezreal"].map((championId) => ({ championId, items: [] as number[] }));
    expect(teamWarnings("Amumu", comp, { profileOf, items: data.items, name }).some((x) => x.id === "bad-engage")).toBe(false);
    comp[1]!.items = [3140];
    comp[2]!.items = [3139];
    expect(teamWarnings("Amumu", comp, { profileOf, items: data.items, name }).find((x) => x.id === "bad-engage")?.champions).toEqual(["Zed", "Ezreal"]);
  });

  it("detects magic-heavy comps", () => {
    const w = teamWarnings("Gwen", ["Ahri", "Syndra", "Malphite", "Lux"].map((championId) => ({ championId, items: [] })), { profileOf, items: data.items, name });
    expect(w.map((x) => x.id)).toContain("magic-heavy");
  });

  it("stays quiet with fewer than 3 known enemies", () => {
    expect(teamWarnings("Gwen", [{ championId: "Ahri", items: [] }, { championId: null, items: [] }], { profileOf, items: data.items, name })).toEqual([]);
  });
});

describe("headlineReason", () => {
  const base = { kind: "base" as const, label: "Uncurated matchup (generic score)", points: UNCURATED_BASE };
  const lane = { kind: "lane" as const, label: "Lane opponent", points: LANE_OPPONENT_BONUS };
  const kite = { kind: "tag" as const, label: "kite", tag: "kite" as const, points: 1.5, via: [{ source: "champion" as const }] };
  const cc = { kind: "tag" as const, label: "point-click-cc", tag: "point-click-cc" as const, points: 1, via: [{ source: "champion" as const }] };
  const threat = (reasons: Threat["reasons"], curated: Threat["curated"] = null): Threat =>
    ({ index: 0, championId: "Poppy", role: "top", score: 0, curated, reasons });

  it("prefers item-driven, then the strongest trait, never the generic base", () => {
    const anti = { ...cc, label: "grievous-wounds", via: [{ source: "item" as const, detail: "Executioner's Calling" }] };
    expect(headlineReason(threat([base, lane, cc, anti]))).toBe(anti);
    expect(headlineReason(threat([base, lane, cc, kite]))).toBe(kite);
    expect(headlineReason(threat([base, lane]))).toBe(lane);
    expect(headlineReason(threat([base]))).toBeNull();
  });
});
