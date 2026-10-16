import type { DdChampion, DdragonData } from "../types";

/** Lookup over Data Dragon champions. Data Dragon `id` (e.g. "MonkeyKing") is the canonical key. */
export class ChampionIndex {
  private byKey = new Map<number, DdChampion>();
  private byId = new Map<string, DdChampion>();
  private byName = new Map<string, DdChampion>();

  constructor(readonly data: DdragonData | null) {
    for (const c of data?.champions ?? []) {
      this.byKey.set(c.key, c);
      this.byId.set(c.id, c);
      this.byName.set(normalize(c.name), c);
    }
  }

  get loaded(): boolean {
    return this.byId.size > 0;
  }

  /** LCU numeric championId → Data Dragon id (null for 0 / unknown). */
  idForKey(key: number): string | null {
    if (key <= 0) return null;
    return this.byKey.get(key)?.id ?? FALLBACK_KEYS[key] ?? null;
  }

  /** Live Client player → Data Dragon id, from `rawChampionName` or the display name. */
  idForLive(rawChampionName: string, championName: string): string | null {
    const raw = rawChampionName.match(/^game_character_displayname_(\w+)$/)?.[1];
    if (raw) return raw;
    return this.byName.get(normalize(championName))?.id ?? (championName.replace(/[^A-Za-z]/g, "") || null);
  }

  /** Data Dragon class tags ("Fighter", "Mage", ...), used for the generic fallback profile. */
  classTags(id: string): string[] {
    return this.byId.get(id)?.tags ?? [];
  }

  name(id: string | null): string {
    if (!id) return "Unknown";
    return this.byId.get(id)?.name ?? id;
  }
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

// Keeps the overlay usable for the supported champions if Data Dragon has never been reachable.
const FALLBACK_KEYS: Record<number, string> = { 887: "Gwen", 32: "Amumu", 9: "Fiddlesticks" };
