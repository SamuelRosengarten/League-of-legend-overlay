// Role inference for one team. Positions reported by the API are trusted; the remaining
// champions are matched to the remaining roles by maximizing a transparent preference score
// (curated typicalRoles order + Smite). Hidden picks take whatever roles are left over.
import type { ChampionProfile } from "../data/types";
import type { Role, Slot } from "./match";

export const ROLE_ORDER: Role[] = ["top", "jungle", "middle", "bottom", "utility"];

export interface RoleAssignment {
  role: Role | null;
  /** api = champ-select assignedPosition / live position; inferred = this module; none = no role left. */
  source: "api" | "inferred" | "none";
}

const RANK_POINTS = [6, 3, 2, 1, 1];

/** How well `role` fits a champion. Exported for tests / the UI explanation. */
export function rolePreference(profile: ChampionProfile | null, role: Role, hasSmite: boolean | null): number {
  let score = 0;
  if (profile) {
    const idx = profile.typicalRoles.indexOf(role);
    score += idx < 0 ? 0 : (RANK_POINTS[idx] ?? 1);
  }
  if (hasSmite === true) score += role === "jungle" ? 10 : -4;
  if (hasSmite === false && role === "jungle") score -= 10;
  return score;
}

export function inferRoles(
  slots: Pick<Slot, "championId" | "position" | "hasSmite">[],
  profileOf: (championId: string | null) => ChampionProfile | null,
): RoleAssignment[] {
  const result: RoleAssignment[] = slots.map(() => ({ role: null, source: "none" }));
  const taken = new Set<Role>();
  slots.forEach((s, i) => {
    if (s.position && !taken.has(s.position)) {
      result[i] = { role: s.position, source: "api" };
      taken.add(s.position);
    }
  });

  const freeRoles = ROLE_ORDER.filter((r) => !taken.has(r));
  // Known champions first so they get first pick of roles; hidden ones fill the rest.
  const open = slots
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => result[i]!.source === "none")
    .sort((a, b) => Number(!a.s.championId) - Number(!b.s.championId));

  let best: Role[] = [];
  let bestScore = -Infinity;
  const pick: Role[] = [];
  const used = new Set<Role>();
  const search = (k: number, score: number) => {
    if (k === open.length || used.size === freeRoles.length) {
      if (score > bestScore) {
        bestScore = score;
        best = [...pick];
      }
      return;
    }
    const { s } = open[k]!;
    const profile = s.championId ? profileOf(s.championId) : null;
    for (const role of freeRoles) {
      if (used.has(role)) continue;
      used.add(role);
      pick.push(role);
      search(k + 1, score + (s.championId ? rolePreference(profile, role, s.hasSmite) : 0));
      pick.pop();
      used.delete(role);
    }
  };
  search(0, 0);

  best.forEach((role, k) => {
    result[open[k]!.i] = { role, source: "inferred" };
  });
  return result;
}
