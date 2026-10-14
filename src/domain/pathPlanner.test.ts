import { describe, expect, it } from "vitest";

import { loadCurated } from "../data";
import type { JunglePathsFile, MatchupEntry } from "../data/types";
import { ChampionIndex } from "./champions";
import { type PlanPlayer, campLabel, laneForBuffSide, planJungle } from "./pathPlanner";
import { profileLookup } from "./profiles";

const data = loadCurated();
const profileOf = profileLookup(data.tags, new ChampionIndex(null));
const amumu = data.matchups.Amumu!;
const entryOf = (id: string): MatchupEntry | null => amumu.matchups[id] ?? null;
const name = (id: string) => id;

const team = (top: string | null, jg: string | null, mid: string | null, adc: string | null, sup: string | null): PlanPlayer[] => [
  { championId: top, role: "top" },
  { championId: jg, role: "jungle" },
  { championId: mid, role: "middle" },
  { championId: adc, role: "bottom" },
  { championId: sup, role: "utility" },
];

const plan = (side: "blue" | "red", allies: PlanPlayer[], enemies: PlanPlayer[], paths: JunglePathsFile = data.paths!) =>
  planJungle({ side, allies, enemies, paths, entryOf, profileOf, name });

describe("map geometry", () => {
  it("maps buff sides to lanes per side", () => {
    expect(laneForBuffSide("blue-buff-side", "blue")).toBe("top");
    expect(laneForBuffSide("red-buff-side", "blue")).toBe("bot");
    expect(laneForBuffSide("blue-buff-side", "red")).toBe("bot");
    expect(laneForBuffSide("red-buff-side", "red")).toBe("top");
    expect(campLabel("red", "red")).toBe("Red buff (top)");
    expect(campLabel("scuttle-blue-buff-side", "blue")).toBe("Scuttle (top river)");
  });
});

describe("planJungle", () => {
  it("amumu-vs-leesin-red: even lanes + early invader → safe full clear, with Lee Sin invade warning", () => {
    const p = plan("red", team("Renekton", "Amumu", "Orianna", "Kaisa", "Nautilus"), team("Darius", "LeeSin", "Syndra", "Ezreal", "Morgana"));
    expect(p.enemyJungler).toMatchObject({ championId: "LeeSin", invadeRisk: "high", curated: true });
    expect(p.invadeWarning).toMatch(/Lee Sin is strong level 2–3/);
    expect(p.recommended.path.id).toMatch(/^full-clear/);
    expect(p.recommended.applied.find((a) => a.kind === "avoid")?.rule.condition).toBe("enemy-jungler-invader");
    // Risky paths are scored below the full clears because Lee is strong early.
    const scuttle = p.options.find((o) => o.path.id === "buff-scuttle")!;
    expect(scuttle.score).toBeLessThan(p.recommended.score);
  });

  it("plays toward the lane with priority and gank setup", () => {
    // Blue side: blue buff is top. Strong top (Renekton) vs weak top (Kayle), weak bot.
    const p = plan("blue", team("Renekton", "Amumu", "Orianna", "Jinx", "Sona"), team("Kayle", "Kayn", "Orianna", "Caitlyn", "Lux"));
    expect(p.lanes.top.status).toBe("priority");
    expect(p.lanes.bot.status).toBe("losing");
    expect(p.recommended.endLane).toBe("top");
    expect(p.recommended.firstGank).toBe("top");
    expect(p.recommended.applied.map((a) => a.rule.condition)).toEqual(expect.arrayContaining(["end-lane-priority", "end-lane-gank-setup", "enemy-jungler-passive"]));
  });

  it("the same draft on red side flips start and end camps", () => {
    const blue = plan("blue", team("Renekton", "Amumu", "Orianna", "Jinx", "Sona"), team("Kayle", "Kayn", "Orianna", "Caitlyn", "Lux"));
    const red = plan("red", team("Renekton", "Amumu", "Orianna", "Jinx", "Sona"), team("Kayle", "Kayn", "Orianna", "Caitlyn", "Lux"));
    expect(red.recommended.endLane).toBe("top");
    expect(red.recommended.path.endsOn).not.toBe(blue.recommended.path.endsOn);
  });

  it("treats hidden picks as unknown instead of guessing", () => {
    const p = plan("blue", team("Renekton", "Amumu", "Orianna", "Jinx", "Sona"), team(null, null, "Orianna", "Caitlyn", null));
    expect(p.lanes.top.status).toBe("unknown");
    expect(p.enemyJungler.invadeRisk).toBe("unknown");
    expect(p.invadeWarning).toBeNull();
    expect(p.recommended.conditions["enemy-jungler-invader"]).toEqual({ value: null, reason: "enemy jungler not revealed yet" });
    // Nothing known → base scores decide: a full clear.
    expect(p.recommended.path.id).toMatch(/^full-clear/);
  });

  it("derives invade risk for uncurated junglers from their tags", () => {
    const p = plan("blue", team("Renekton", "Amumu", "Orianna", "Jinx", "Sona"), team("Kayle", "RekSai", "Orianna", "Caitlyn", "Lux"));
    expect(p.enemyJungler).toMatchObject({ championId: "RekSai", invadeRisk: "high", curated: false });
    expect(p.invadeWarning).toMatch(/RekSai can contest your jungle early/);
  });

  it("score = baseScore + favors − avoids, for every option", () => {
    const p = plan("red", team("Renekton", "Amumu", "Orianna", "Kaisa", "Nautilus"), team("Darius", "LeeSin", "Syndra", "Ezreal", "Morgana"));
    for (const o of p.options) {
      const expected = o.path.baseScore + o.applied.reduce((s, a) => s + (a.kind === "favor" ? 1 : -1) * a.rule.weight, 0);
      expect(o.score).toBeCloseTo(expected);
    }
  });
});
