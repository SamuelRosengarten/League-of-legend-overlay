import { describe, expect, it } from "vitest";

import { layoutCompanions } from "../ui/companions/layout";
import type { RankInfo } from "../types";
import { DEFAULT_APPEARANCE, effectiveMotion, normalizeAppearance } from "./appearance";
import { THEMES, TIER_IDS } from "./ranks";
import { rankLabel, resolveTheme } from "./theme";

const rank = (tier: string, over: Partial<RankInfo> = {}): RankInfo => ({
  tier,
  division: "II",
  leaguePoints: 47,
  wins: 10,
  losses: 8,
  queue: "solo",
  provisionalGamesRemaining: 0,
  source: "client",
  ...over,
});

describe("rank themes", () => {
  it("defines a complete, distinct palette and emblem for all ten tiers", () => {
    expect(TIER_IDS).toHaveLength(10);
    const primaries = new Set<string>();
    for (const id of TIER_IDS) {
      const t = THEMES[id];
      expect(t.emblem, id).toBeTruthy();
      for (const v of Object.values(t.palette)) expect(v, id).toMatch(/^(#[0-9a-f]{6}|rgba\()/i);
      primaries.add(t.palette.primary);
    }
    expect(primaries.size).toBe(10);
    expect(THEMES.challenger.prestige).toBe(2);
    expect(THEMES.unranked.emblem).toBeNull();
  });

  it("auto follows the client rank; manual choice wins; unknown → unranked theme", () => {
    expect(resolveTheme(DEFAULT_APPEARANCE, rank("diamond"))).toMatchObject({ theme: { id: "diamond" }, source: "client" });
    expect(resolveTheme({ ...DEFAULT_APPEARANCE, theme: "gold" }, rank("diamond"))).toMatchObject({ theme: { id: "gold" }, source: "manual" });
    expect(resolveTheme(DEFAULT_APPEARANCE, null)).toMatchObject({ theme: { id: "unranked" }, source: "none" });
    expect(resolveTheme(DEFAULT_APPEARANCE, rank("unranked", { division: null }))).toMatchObject({ theme: { id: "unranked" }, source: "client" });
    expect(resolveTheme(DEFAULT_APPEARANCE, rank("gold", { source: "cached" })).source).toBe("cached");
  });

  it("labels ranks without guessing", () => {
    expect(rankLabel(rank("gold"))).toBe("Gold II");
    expect(rankLabel(rank("challenger", { division: null }))).toBe("Challenger");
    expect(rankLabel(rank("unranked", { division: null, provisionalGamesRemaining: 5 }))).toBe("Unranked · 5 placements left");
    expect(rankLabel(null)).toBe("Rank unknown");
  });
});

describe("appearance settings", () => {
  it("repairs hand-edited or partial settings", () => {
    const a = normalizeAppearance({ theme: "mithril", motion: "wild", companions: { gwen: true, amumu: false, placement: "??", size: 9, inGame: false } });
    expect(a).toEqual({ theme: "auto", motion: "full", companions: { gwen: true, amumu: false, placement: "corners", size: 1.4, inGame: false } });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("caps motion by Windows reduced-motion and by gameplay", () => {
    expect(effectiveMotion("full", { inGame: false, reducedMotion: false })).toBe("full");
    expect(effectiveMotion("full", { inGame: true, reducedMotion: false })).toBe("calm");
    expect(effectiveMotion("full", { inGame: false, reducedMotion: true })).toBe("off");
    expect(effectiveMotion("off", { inGame: false, reducedMotion: false })).toBe("off");
  });
});

describe("companion layout", () => {
  const settings = DEFAULT_APPEARANCE.companions;

  it("reserves space above/below the panel only where companions sit", () => {
    const corners = layoutCompanions(settings, 460, { compact: false });
    expect(corners.placed.map((p) => [p.who, p.spot.edge])).toEqual([["gwen", "top"], ["amumu", "bottom"]]);
    expect(corners.gutterTop).toBeGreaterThan(0);
    expect(corners.gutterBottom).toBeGreaterThan(0);

    const top = layoutCompanions({ ...settings, placement: "top" }, 460, { compact: false });
    expect(top.gutterBottom).toBe(0);
    const none = layoutCompanions({ ...settings, gwen: false, amumu: false }, 460, { compact: false });
    expect(none).toEqual({ placed: [], gutterTop: 0, gutterBottom: 0 });
  });

  it("keeps companions inside the window and scales with size", () => {
    for (const placement of ["corners", "top", "bottom", "left", "right", "peek", "minimal"]) {
      for (const p of layoutCompanions({ ...settings, placement, size: 1.4 }, 320, { compact: true }).placed) {
        expect(p.left, placement).toBeGreaterThanOrEqual(0);
        expect(p.left + p.width, placement).toBeLessThanOrEqual(320.001);
      }
    }
    const small = layoutCompanions({ ...settings, size: 0.7 }, 460, { compact: false });
    const big = layoutCompanions({ ...settings, size: 1.4 }, 460, { compact: false });
    expect(big.gutterTop).toBeGreaterThan(small.gutterTop);
  });
});
