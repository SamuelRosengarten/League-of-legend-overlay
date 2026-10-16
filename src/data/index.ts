// Curated data bundled into the app, validated once at startup. A file that fails validation
// is treated as missing (the UI then shows a "missing data" state instead of wrong advice).
import tagsJson from "../../data/champions/tags.json";
import gwenJson from "../../data/matchups/gwen.json";
import amumuJson from "../../data/matchups/amumu.json";
import fiddlesticksJson from "../../data/matchups/fiddlesticks.json";
import itemsJson from "../../data/items/counters.json";
import pathsJson from "../../data/jungle/amumu-paths.json";
import type { ChampionTagsFile, ItemCountersFile, JunglePathsFile, MatchupFile } from "./types";
import { type Issue, validateAll } from "./validate";

export interface CuratedData {
  tags: ChampionTagsFile | null;
  matchups: Record<string, MatchupFile>;
  items: ItemCountersFile | null;
  paths: JunglePathsFile | null;
  issues: Issue[];
}

const FILES = {
  tags: { file: "data/champions/tags.json", data: tagsJson as unknown },
  matchups: [
    { file: "data/matchups/gwen.json", data: gwenJson as unknown },
    { file: "data/matchups/amumu.json", data: amumuJson as unknown },
    { file: "data/matchups/fiddlesticks.json", data: fiddlesticksJson as unknown },
  ],
  items: { file: "data/items/counters.json", data: itemsJson as unknown },
  paths: { file: "data/jungle/amumu-paths.json", data: pathsJson as unknown },
};

export function loadCurated(): CuratedData {
  const issues = validateAll(FILES);
  const broken = new Set(issues.filter((i) => i.severity === "error").map((i) => i.file));
  for (const i of issues) console[i.severity === "error" ? "error" : "warn"](`[data] ${i.file} ${i.path}: ${i.message}`);
  const ok = <T>(entry: { file: string; data: unknown }): T | null => (broken.has(entry.file) ? null : (entry.data as T));

  const matchups: Record<string, MatchupFile> = {};
  for (const m of FILES.matchups) {
    const file = ok<MatchupFile>(m);
    if (file) matchups[file.champion] = file;
  }
  return {
    tags: ok<ChampionTagsFile>(FILES.tags),
    matchups,
    items: ok<ItemCountersFile>(FILES.items),
    paths: ok<JunglePathsFile>(FILES.paths),
    issues,
  };
}

let cached: CuratedData | null = null;
export function curated(): CuratedData {
  return (cached ??= loadCurated());
}
