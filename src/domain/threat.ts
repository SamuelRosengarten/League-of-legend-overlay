// Threat ranking: a transparent additive score per enemy, against MY champion.
//
//   score = base + Σ weight(tag) + lane bonus
//   base  = curated matchup `threat` (1-5), or UNCURATED_BASE for uncurated enemies
//   tags  = champion traits (tags.json) ∪ matchup threatTags ∪ effects of counter items they own
//   weight comes from the matchup file's `threatWeights` (tags without a weight score 0)
//
// Every term is returned as a reason so the UI can show exactly why an enemy ranks where it does.
import type { ItemCountersFile, MatchupEntry, MatchupFile, Role, Tag } from "../data/types";
import type { ProfileLookup } from "./profiles";

export const UNCURATED_BASE = 2;
export const LANE_OPPONENT_BONUS = 1.5;

export interface EnemyInput {
  championId: string | null;
  role: Role | null;
  /** Item ids currently owned (live game only). */
  items: number[];
}

export type TagSource = "champion" | "matchup" | "item";

export interface ThreatReason {
  kind: "base" | "lane" | "tag";
  label: string;
  points: number;
  tag?: Tag;
  /** Where a tag came from; for items, the item name. */
  via?: { source: TagSource; detail?: string }[];
}

export interface Threat {
  index: number;
  championId: string;
  role: Role | null;
  score: number;
  curated: MatchupEntry | null;
  reasons: ThreatReason[];
}

export interface ThreatRanking {
  ranked: Threat[];
  /** Enemy slots not picked / not revealed yet. */
  hidden: number;
}

export function rankThreats(
  enemies: EnemyInput[],
  ctx: { me: string; myRole: Role; matchups: MatchupFile; items: ItemCountersFile | null; profileOf: ProfileLookup },
): ThreatRanking {
  const ranked: Threat[] = [];
  enemies.forEach((enemy, index) => {
    if (!enemy.championId) return;
    const entry = ctx.matchups.matchups[enemy.championId] ?? null;
    const reasons: ThreatReason[] = [
      entry
        ? { kind: "base", label: `Curated threat ${entry.threat}/5`, points: entry.threat }
        : { kind: "base", label: "Uncurated matchup (generic score)", points: UNCURATED_BASE },
    ];
    if (enemy.role && enemy.role === ctx.myRole) {
      reasons.push({ kind: "lane", label: ctx.myRole === "jungle" ? "Enemy jungler" : "Lane opponent", points: LANE_OPPONENT_BONUS });
    }
    for (const [tag, via] of collectTags(enemy, entry, ctx)) {
      const weight = ctx.matchups.threatWeights[tag] ?? 0;
      if (weight > 0) reasons.push({ kind: "tag", label: tag, tag, points: weight, via });
    }
    const score = Math.round(reasons.reduce((s, r) => s + r.points, 0) * 10) / 10;
    ranked.push({ index, championId: enemy.championId, role: enemy.role, score, curated: entry, reasons });
  });
  ranked.sort((a, b) => b.score - a.score || a.championId.localeCompare(b.championId));
  return { ranked, hidden: enemies.filter((e) => !e.championId).length };
}

function collectTags(
  enemy: EnemyInput,
  entry: MatchupEntry | null,
  ctx: { me: string; items: ItemCountersFile | null; profileOf: ProfileLookup },
): Map<Tag, { source: TagSource; detail?: string }[]> {
  const tags = new Map<Tag, { source: TagSource; detail?: string }[]>();
  const add = (tag: Tag, source: TagSource, detail?: string) => {
    const list = tags.get(tag) ?? [];
    list.push(detail ? { source, detail } : { source });
    tags.set(tag, list);
  };
  for (const t of ctx.profileOf(enemy.championId)?.profile.traits ?? []) add(t, "champion");
  for (const t of entry?.threatTags ?? []) add(t, "matchup");
  for (const id of enemy.items) {
    const item = ctx.items?.items[String(id)];
    if (item?.relevantTo.includes(ctx.me)) for (const t of item.effects) add(t, "item", item.name);
  }
  return tags;
}

/** Item ids among `items` that add counter tags against `me` (for "re-ranked" notes). */
export function counterItemsOwned(items: number[], me: string, counters: ItemCountersFile | null): number[] {
  return items.filter((id) => counters?.items[String(id)]?.relevantTo.includes(me));
}

/**
 * The one reason worth a glance in game: what they bought, then their strongest trait. The
 * generic uncurated base score says nothing about this enemy, so it is never the headline.
 */
export function headlineReason(t: Threat): ThreatReason | null {
  const informative = t.reasons.filter((r) => !(r.kind === "base" && !t.curated));
  const rank = (r: ThreatReason) => (r.via?.some((v) => v.source === "item") ? 0 : r.kind === "tag" ? 1 : r.kind === "lane" ? 2 : 3);
  return [...informative].sort((a, b) => rank(a) - rank(b) || b.points - a.points)[0] ?? null;
}
