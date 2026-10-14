import { describe, expect, it } from "vitest";

import { loadCurated } from "../data";
import type { Role } from "./match";
import { inferRoles, rolePreference } from "./roles";

const tags = loadCurated().tags!;
const profileOf = (id: string | null) => (id ? (tags.champions[id] ?? null) : null);
const slot = (championId: string | null, position: Role | null = null, hasSmite: boolean | null = null) => ({ championId, position, hasSmite });

describe("inferRoles", () => {
  it("trusts positions from the API", () => {
    const roles = inferRoles([slot("Fiora", "jungle"), slot("LeeSin", "top")], profileOf);
    expect(roles).toEqual([
      { role: "jungle", source: "api" },
      { role: "top", source: "api" },
    ]);
  });

  it("infers a shuffled blind-pick team from typicalRoles", () => {
    const roles = inferRoles([slot("Thresh"), slot("Jinx"), slot("Fiora"), slot("Ahri"), slot("Viego")], profileOf);
    expect(roles.map((r) => r.role)).toEqual(["utility", "bottom", "top", "middle", "jungle"]);
    expect(roles.every((r) => r.source === "inferred")).toBe(true);
  });

  it("uses Smite to resolve flex picks", () => {
    // Gwen is tagged top first, but with Smite she is the jungler.
    const roles = inferRoles([slot("Gwen", null, true), slot("Darius", null, false)], profileOf);
    expect(roles.map((r) => r.role)).toEqual(["jungle", "top"]);
    expect(rolePreference(tags.champions.Gwen!, "jungle", true)).toBeGreaterThan(rolePreference(tags.champions.Gwen!, "top", true));
  });

  it("gives known champions first pick and leaves the rest to hidden slots", () => {
    // Partially-hidden fixture: Darius + Lee Sin known, three hidden.
    const roles = inferRoles([slot(null), slot("Darius"), slot(null), slot("LeeSin"), slot(null)], profileOf);
    expect(roles[1]).toEqual({ role: "top", source: "inferred" });
    expect(roles[3]).toEqual({ role: "jungle", source: "inferred" });
    expect(new Set(roles.map((r) => r.role)).size).toBe(5);
  });

  it("does not hand an API-assigned role to a second champion", () => {
    const roles = inferRoles([slot("Garen", "top"), slot("Darius")], profileOf);
    expect(roles[0]!.role).toBe("top");
    expect(roles[1]!.role).not.toBe("top");
  });

  it("handles unknown champions and an empty team", () => {
    expect(inferRoles([], profileOf)).toEqual([]);
    const roles = inferRoles([slot("NotAChampion"), slot("Jinx")], profileOf);
    expect(roles[1]!.role).toBe("bottom");
  });
});
