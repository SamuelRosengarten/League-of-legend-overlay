// npm run validate:data [-- --ddragon] [-- --strict]
// Exits 1 on any error (and on warnings with --strict). --ddragon also fetches the latest
// Data Dragon champion list and reports champions missing from champions/tags.json.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { formatIssue, missingFromTags, validateAll, type DataFiles } from "../src/data/validate";
import type { ChampionTagsFile } from "../src/data/types";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(root, "data");
const args = new Set(process.argv.slice(2));

function load(path: string): { file: string; data: unknown } {
  const file = relative(root, path).replaceAll("\\", "/");
  try {
    return { file, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    console.error(`ERROR ${file}: not valid JSON — ${(e as Error).message}`);
    process.exit(1);
  }
}

const files: DataFiles = {
  tags: load(join(dataDir, "champions/tags.json")),
  matchups: readdirSync(join(dataDir, "matchups"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => load(join(dataDir, "matchups", f))),
  items: load(join(dataDir, "items/counters.json")),
  paths: load(join(dataDir, "jungle/amumu-paths.json")),
};

const issues = validateAll(files);

if (args.has("--ddragon") && !issues.some((i) => i.severity === "error")) {
  const versions = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json()) as string[];
  const champs = (await (
    await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`)
  ).json()) as { data: Record<string, unknown> };
  const ids = Object.keys(champs.data);
  const tags = files.tags.data as ChampionTagsFile;
  for (const id of missingFromTags(tags, ids)) {
    issues.push({ file: files.tags.file, path: `/champions/${id}`, message: `missing (Data Dragon ${versions[0]}) — uses class-based fallback`, severity: "warning" });
  }
  for (const id of Object.keys(tags.champions).filter((id) => !ids.includes(id))) {
    issues.push({ file: files.tags.file, path: `/champions/${id}`, message: `not a Data Dragon champion id in ${versions[0]}`, severity: "error" });
  }

  // Fact-check curated guides against Riot's own data: ability names per key, item ids/names.
  const cdn = `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US`;
  const items = ((await (await fetch(`${cdn}/item.json`)).json()) as { data: Record<string, { name: string }> }).data;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const checkItem = (file: string, path: string, id: number | string | undefined, name?: string) => {
    if (id === undefined) return;
    const dd = items[String(id)];
    if (!dd) issues.push({ file, path, message: `item ${id} does not exist in Data Dragon ${versions[0]}`, severity: "error" });
    else if (name && norm(dd.name) !== norm(name)) issues.push({ file, path, message: `item ${id} is "${dd.name}" in Data Dragon, data says "${name}"`, severity: "warning" });
  };
  type Entry = { dangerAbilities: { key: string; name: string }[]; powerSpikes: { kind: string; item?: number }[]; itemAdjustments: { item?: number; name: string }[] };
  for (const m of files.matchups) {
    const entries = (m.data as { matchups: Record<string, Entry> }).matchups;
    for (const [champ, e] of Object.entries(entries)) {
      const detail = (await (await fetch(`${cdn}/champion/${champ}.json`)).json()) as { data: Record<string, { passive: { name: string }; spells: { name: string }[] }> };
      const c = detail.data[champ]!;
      const names: Record<string, string> = { P: c.passive.name, Q: c.spells[0]!.name, W: c.spells[1]!.name, E: c.spells[2]!.name, R: c.spells[3]!.name };
      // "Sonic Wave / Resonating Strike": either form's name is fine; a leading "The" is optional.
      const forms = (full: string) => [full, ...full.split(" / ")].map((n) => norm(n.replace(/^the /i, "")));
      e.dangerAbilities.forEach((a, i) => {
        if (!forms(names[a.key] ?? "").includes(norm(a.name.replace(/^the /i, "")))) {
          issues.push({ file: m.file, path: `/matchups/${champ}/dangerAbilities/${i}`, message: `${a.key} is "${names[a.key]}" in Data Dragon, data says "${a.name}"`, severity: "error" });
        }
      });
      e.powerSpikes.forEach((s, i) => s.kind === "item" && checkItem(m.file, `/matchups/${champ}/powerSpikes/${i}`, s.item));
      e.itemAdjustments.forEach((it, i) => checkItem(m.file, `/matchups/${champ}/itemAdjustments/${i}`, it.item, it.name));
    }
  }
  for (const [id, it] of Object.entries((files.items.data as { items: Record<string, { name: string }> }).items)) {
    checkItem(files.items.file, `/items/${id}`, id, it.name);
  }
}

for (const issue of issues) console.log(formatIssue(issue));

const errors = issues.filter((i) => i.severity === "error").length;
const warnings = issues.length - errors;
const matchupCount = files.matchups.reduce((n, m) => n + Object.keys((m.data as { matchups?: object }).matchups ?? {}).length, 0);
console.log(`\n${errors} error(s), ${warnings} warning(s) — ${files.matchups.length} matchup files, ${matchupCount} curated matchups.`);
process.exit(errors > 0 || (args.has("--strict") && warnings > 0) ? 1 : 0);
