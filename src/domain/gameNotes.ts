// In-game notes derived from Live Client snapshots: an enemy finishing an item listed as a power
// spike in the curated matchup, buying a counter item, or the lane opponent hitting a level spike.
// Reference information only — never "go here now" instructions.
import type { ItemCountersFile, MatchupFile } from "../data/types";

export interface EnemySnapshot {
  championId: string;
  level: number | null;
  items: { id: number; name: string }[];
}

export interface GameNote {
  /** Stable id; the same event is only noted once per game. */
  key: string;
  time: number;
  championId: string;
  kind: "item-spike" | "counter-item" | "level-spike";
  text: string;
}

export function diffNotes(
  prev: EnemySnapshot[] | null,
  cur: EnemySnapshot[],
  ctx: {
    me: string;
    matchups: MatchupFile | null;
    counters: ItemCountersFile | null;
    laneOpponent: string | null;
    time: number;
    name: (id: string) => string;
  },
): GameNote[] {
  const notes: GameNote[] = [];
  for (const enemy of cur) {
    const before = prev?.find((p) => p.championId === enemy.championId);
    const owned = new Set(before?.items.map((i) => i.id) ?? []);
    const entry = ctx.matchups?.matchups[enemy.championId];
    const who = ctx.name(enemy.championId);

    for (const item of enemy.items) {
      if (owned.has(item.id)) continue;
      const spike = entry?.powerSpikes.find((s) => s.kind === "item" && s.item === item.id);
      const counter = ctx.counters?.items[String(item.id)];
      if (spike) {
        notes.push({ key: `${enemy.championId}:item:${item.id}`, time: ctx.time, championId: enemy.championId, kind: "item-spike", text: `${who} finished ${item.name} — ${spike.note}` });
      } else if (counter?.relevantTo.includes(ctx.me)) {
        notes.push({ key: `${enemy.championId}:item:${item.id}`, time: ctx.time, championId: enemy.championId, kind: "counter-item", text: `${who} bought ${counter.name} — ${counter.note}` });
      }
    }

    // Level spikes only for the lane opponent, and only on a transition we actually saw.
    if (enemy.championId === ctx.laneOpponent && before?.level != null && enemy.level != null) {
      for (const spike of entry?.powerSpikes ?? []) {
        if (spike.kind === "level" && spike.level! > before.level && spike.level! <= enemy.level) {
          notes.push({ key: `${enemy.championId}:level:${spike.level}`, time: ctx.time, championId: enemy.championId, kind: "level-spike", text: `${who} hit level ${spike.level} — ${spike.note}` });
        }
      }
    }
  }
  return notes;
}
