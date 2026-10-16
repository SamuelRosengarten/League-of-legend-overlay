import { describe, expect, it } from "vitest";

import tags from "../../data/champions/tags.json";
import gwen from "../../data/matchups/gwen.json";
import amumu from "../../data/matchups/amumu.json";
import fiddlesticks from "../../data/matchups/fiddlesticks.json";
import items from "../../data/items/counters.json";
import paths from "../../data/jungle/amumu-paths.json";
import { loadCurated } from "./index";
import type { ChampionTagsFile } from "./types";
import { type DataFiles, missingFromTags, validateAll, validateSchema } from "./validate";

const clone = <T>(v: T): T => structuredClone(v);

function files(overrides: Partial<Record<"tags" | "gwen" | "amumu" | "fiddlesticks" | "items" | "paths", unknown>> = {}): DataFiles {
  return {
    tags: { file: "tags.json", data: overrides.tags ?? tags },
    matchups: [
      { file: "gwen.json", data: overrides.gwen ?? gwen },
      { file: "amumu.json", data: overrides.amumu ?? amumu },
      { file: "fiddlesticks.json", data: overrides.fiddlesticks ?? fiddlesticks },
    ],
    items: { file: "items.json", data: overrides.items ?? items },
    paths: { file: "paths.json", data: overrides.paths ?? paths },
  };
}

const errors = (f: DataFiles) => validateAll(f).filter((i) => i.severity === "error");

describe("curated data", () => {
  it("ships valid v1 data", () => {
    expect(errors(files())).toEqual([]);
  });

  it("has a curated set of matchups per champion, all marked with patch + confidence", () => {
    for (const file of [gwen, amumu, fiddlesticks]) {
      const entries = Object.values(file.matchups);
      expect(entries.length).toBeGreaterThanOrEqual(file === fiddlesticks ? 15 : 20);
      for (const e of entries) {
        expect(e.lastReviewedPatch).toBeTruthy();
        expect(["high", "medium", "low"]).toContain(e.confidence);
      }
    }
  });

  it("contains no invented numbers in advice text (win rates, damage values)", () => {
    const text = JSON.stringify([gwen.matchups, amumu.matchups, fiddlesticks.matchups]);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(text).not.toMatch(/win ?rate/i);
  });

  it("loads into the app with no broken files", () => {
    const data = loadCurated();
    expect(data.tags).not.toBeNull();
    expect(Object.keys(data.matchups).sort()).toEqual(["Amumu", "Fiddlesticks", "Gwen"]);
    expect(data.items).not.toBeNull();
    expect(data.paths).not.toBeNull();
  });
});

describe("schema validation", () => {
  it("rejects unknown tags with a readable message", () => {
    const bad = clone(tags);
    (bad.champions.Jax.traits as string[]).push("not-a-tag");
    const issues = validateSchema("champion-tags", "tags.json", bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: "/champions/Jax/traits/3", severity: "error" });
    expect(issues[0]!.message).toMatch(/allowed list/);
  });

  it("requires every matchup field", () => {
    const bad = clone(gwen) as { matchups: Record<string, Record<string, unknown>> };
    delete bad.matchups.Fiora!.tips;
    const issues = validateSchema("matchups", "gwen.json", bad);
    expect(issues.some((i) => i.path === "/matchups/Fiora" && /tips/.test(i.message))).toBe(true);
  });

  it("enforces 3-5 tips, difficulty range and patch format", () => {
    const bad = clone(gwen) as { matchups: Record<string, Record<string, unknown>> };
    bad.matchups.Fiora!.tips = [{ text: "only one tip" }];
    bad.matchups.Darius!.difficulty = 9;
    bad.matchups.Garen!.lastReviewedPatch = "latest";
    const paths = validateSchema("matchups", "gwen.json", bad).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["/matchups/Fiora/tips", "/matchups/Darius/difficulty", "/matchups/Garen/lastReviewedPatch"]));
  });

  it("requires a level on level power spikes", () => {
    const bad = clone(gwen) as { matchups: { Fiora: { powerSpikes: object[] } } };
    bad.matchups.Fiora.powerSpikes = [{ kind: "level", note: "missing the level" }];
    expect(validateSchema("matchups", "gwen.json", bad).length).toBeGreaterThan(0);
  });
});

describe("cross-file checks", () => {
  it("flags matchups for champions missing from tags.json", () => {
    const bad = clone(gwen) as { matchups: Record<string, unknown> };
    bad.matchups.Fioraa = clone(gwen.matchups.Fiora);
    expect(errors(files({ gwen: bad }))).toEqual([
      expect.objectContaining({ file: "gwen.json", path: "/matchups/Fioraa" }),
    ]);
  });

  it("requires the jungle block for jungle matchups", () => {
    const bad = clone(amumu) as { matchups: Record<string, { jungle?: unknown }> };
    delete bad.matchups.LeeSin!.jungle;
    expect(errors(files({ amumu: bad }))[0]).toMatchObject({ path: "/matchups/LeeSin/jungle" });
  });

  it("checks that a path ending at scuttle ends on that side", () => {
    const bad = clone(paths);
    bad.paths.find((p) => p.id === "buff-scuttle")!.endsOn = "red-buff-side";
    expect(errors(files({ paths: bad }))[0]!.message).toMatch(/ends at scuttle-blue-buff-side/);
  });

  it("reports champions Data Dragon knows that tags.json lacks", () => {
    expect(missingFromTags(tags as unknown as ChampionTagsFile, ["Gwen", "Amumu", "Locke", "Zaahen"])).toEqual(["Locke", "Zaahen"]);
  });
});
