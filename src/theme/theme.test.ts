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
    const a = normalizeAppearance({
      theme: "mithril",
      motion: "wild",
      companions: { gwen: true, amumu: false, fiddlesticks: true, scenes: false, placement: "??", size: 9, inGame: false },
      scale: 3,
      snapToEdge: true,
      dockToClient: false,
    });
    expect(a).toEqual({
      theme: "auto",
      motion: "full",
      companions: { gwen: true, amumu: false, fiddlesticks: true, scenes: false, placement: "corners", size: 1.4, inGame: false },
      scale: 1.5,
      snapToEdge: true,
      dockToClient: false,
    });
    expect(normalizeAppearance({ scale: Number.NaN }).scale).toBe(1);
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
    expect(corners.placed.map((p) => [p.who, p.spot.pose])).toEqual([["gwen", "perch"], ["fiddlesticks", "perch"], ["amumu", "hang"]]);
    expect(corners.gutterTop).toBeGreaterThan(0);
    expect(corners.gutterBottom).toBeGreaterThan(0);

    const top = layoutCompanions({ ...settings, placement: "top" }, 460, { compact: false });
    expect(top.gutterBottom).toBe(0);
    const none = layoutCompanions({ ...settings, gwen: false, amumu: false, fiddlesticks: false }, 460, { compact: false });
    expect(none).toEqual({ placed: [], gutterTop: 0, gutterBottom: 0, gutterRight: 0, gutterLeft: 0 });
  });

  it("docked: all stand in a right gutter, inside the window, nothing above or below", () => {
    const d = layoutCompanions(settings, 410, { compact: false, docked: true });
    expect(d.placed.map((p) => [p.who, p.spot.pose])).toEqual([["gwen", "side"], ["fiddlesticks", "side"], ["amumu", "side"]]);
    expect([d.gutterTop, d.gutterBottom]).toEqual([0, 0]);
    expect(d.gutterRight).toBeGreaterThan(0);
    for (const p of d.placed) {
      // Clinging: part of the sprite leans over the panel's border, the rest is in the gutter.
      expect(p.overlap).toBeGreaterThan(0);
      expect(p.left + p.overlap).toBe(410 - d.gutterRight);
      expect(p.left + p.width).toBeLessThanOrEqual(410);
    }
    expect(layoutCompanions({ ...settings, gwen: false, amumu: false, fiddlesticks: false }, 410, { compact: false, docked: true }).gutterRight).toBe(0);

    // Docked on the client's left: mirrored onto the panel's outer (left) border.
    const l = layoutCompanions(settings, 410, { compact: false, docked: true, dockedLeft: true });
    expect([l.gutterLeft, l.gutterRight]).toEqual([d.gutterRight, 0]);
    for (const p of l.placed) {
      expect(p.spot.flip).toBe(true);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width - p.overlap).toBe(l.gutterLeft);
    }
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

describe("companions sharing a border", () => {
  it("keep a clear gap between neighbours, even on a narrow panel", () => {
    for (const placement of ["corners", "top", "left", "right", "peek", "minimal"]) {
      for (const width of [300, 320, 380, 460]) {
        const { placed } = layoutCompanions({ ...DEFAULT_APPEARANCE.companions, placement }, width, { compact: true });
        const row = placed.filter((p) => p.spot.pose !== "hang").sort((a, b) => a.left - b.left);
        for (let i = 1; i < row.length; i++) {
          const overlap = row[i - 1]!.left + row[i - 1]!.width - row[i]!.left;
          expect(overlap, `${placement} @${width}`).toBeLessThanOrEqual(-5);
        }
        for (const p of placed) {
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.left + p.width).toBeLessThanOrEqual(width + 0.001);
        }
      }
    }
  });
});

describe("docked companions on a narrow window", () => {
  it("shrink so the gutter stays at most a fifth of the window", () => {
    const narrow = layoutCompanions(DEFAULT_APPEARANCE.companions, 300, { compact: false, docked: true });
    expect(narrow.gutterRight).toBeLessThanOrEqual(60);
    const wide = layoutCompanions(DEFAULT_APPEARANCE.companions, 410, { compact: false, docked: true });
    expect(wide.placed[0]!.spriteHeight).toBeGreaterThanOrEqual(narrow.placed[0]!.spriteHeight);
  });
});
