// Champion profile lookup: curated data/champions/tags.json first, then a coarse profile derived
// from the Data Dragon class (Fighter/Mage/...) for champions newer than the curated file.
import type { ChampionProfile, ChampionTagsFile } from "../data/types";
import type { ChampionIndex } from "./champions";

export interface ResolvedProfile {
  profile: ChampionProfile;
  source: "tags" | "class-fallback";
}

const CLASS_FALLBACK: Record<string, ChampionProfile> = {
  Marksman: { damage: "physical", range: "ranged", mobility: "low", typicalRoles: ["bottom"], cc: [], traits: ["sustained-dps", "scaling"], earlyGame: 2 },
  Support: { damage: "magic", range: "ranged", mobility: "low", typicalRoles: ["utility"], cc: [], traits: ["shields-allies"], earlyGame: 2 },
  Mage: { damage: "magic", range: "ranged", mobility: "low", typicalRoles: ["middle"], cc: [], traits: ["burst", "ranged-poke"], earlyGame: 2 },
  Assassin: { damage: "physical", range: "melee", mobility: "high", typicalRoles: ["middle", "jungle"], cc: [], traits: ["burst", "high-mobility"], earlyGame: 2 },
  Tank: { damage: "magic", range: "melee", mobility: "low", typicalRoles: ["top", "utility"], cc: [], traits: ["tank", "hard-engage"], earlyGame: 2 },
  Fighter: { damage: "physical", range: "melee", mobility: "medium", typicalRoles: ["top", "jungle"], cc: [], traits: ["sustained-dps"], earlyGame: 2 },
};

export type ProfileLookup = (championId: string | null) => ResolvedProfile | null;

export function profileLookup(tags: ChampionTagsFile | null, champs: ChampionIndex): ProfileLookup {
  return (id) => {
    if (!id) return null;
    const curated = tags?.champions[id];
    if (curated) return { profile: curated, source: "tags" };
    const cls = champs.classTags(id).find((t) => CLASS_FALLBACK[t]);
    return cls ? { profile: { ...CLASS_FALLBACK[cls]!, confidence: "low" }, source: "class-fallback" } : null;
  };
}
