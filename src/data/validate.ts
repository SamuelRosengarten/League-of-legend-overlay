// Validates the curated data: JSON Schema per file + cross-file consistency checks.
// Pure (no fs / network) so it runs both in the app at load time and in scripts/validate-data.ts.
// Uses @cfworker/json-schema because it interprets schemas without eval (the app's CSP forbids it).
import { Validator } from "@cfworker/json-schema";

import commonSchema from "../../data/schema/common.schema.json";
import tagsSchema from "../../data/schema/champion-tags.schema.json";
import matchupsSchema from "../../data/schema/matchups.schema.json";
import itemsSchema from "../../data/schema/item-counters.schema.json";
import pathsSchema from "../../data/schema/amumu-paths.schema.json";
import type { ChampionTagsFile, ItemCountersFile, JunglePathsFile, MatchupFile } from "./types";

export type SchemaKind = "champion-tags" | "matchups" | "item-counters" | "amumu-paths";

const SCHEMAS: Record<SchemaKind, object> = {
  "champion-tags": tagsSchema,
  matchups: matchupsSchema,
  "item-counters": itemsSchema,
  "amumu-paths": pathsSchema,
};

export interface Issue {
  file: string;
  /** JSON pointer inside the file ("" = whole file). */
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface DataFiles {
  tags: { file: string; data: unknown };
  matchups: { file: string; data: unknown }[];
  items: { file: string; data: unknown };
  paths: { file: string; data: unknown };
}

// Wrapper keywords whose errors only say "a child failed" — the child error is reported too.
const WRAPPER_KEYWORDS = new Set(["false", "properties", "additionalProperties", "$ref", "allOf", "items", "propertyNames", "patternProperties", "if", "then"]);

export function validateSchema(kind: SchemaKind, file: string, data: unknown): Issue[] {
  const validator = new Validator(SCHEMAS[kind] as never, "2020-12", false);
  validator.addSchema(commonSchema as never);
  const result = validator.validate(data);
  if (result.valid) return [];
  const leaves = result.errors.filter((e) => !WRAPPER_KEYWORDS.has(e.keyword));
  const errors = leaves.length ? leaves : result.errors;
  const seen = new Set<string>();
  return errors
    .map((e) => ({
      file,
      path: e.instanceLocation.replace(/^#/, ""),
      message: e.error.replace(/^Instance does not match any of \[.*\]\.$/,"value is not in the allowed list (see the enum in data/schema)"),
      severity: "error" as const,
    }))
    .filter((i) => {
      const key = `${i.path}|${i.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Checks that need more than one file, run only when every file passed its schema. */
export function crossCheck(files: {
  tags: { file: string; data: ChampionTagsFile };
  matchups: { file: string; data: MatchupFile }[];
  items: { file: string; data: ItemCountersFile };
  paths: { file: string; data: JunglePathsFile };
}): Issue[] {
  const issues: Issue[] = [];
  const err = (file: string, path: string, message: string) => issues.push({ file, path, message, severity: "error" });
  const warn = (file: string, path: string, message: string) => issues.push({ file, path, message, severity: "warning" });
  const champions = files.tags.data.champions;
  const itemIds = new Set(Object.keys(files.items.data.items));

  for (const { file, data } of files.matchups) {
    if (!champions[data.champion]) err(file, "/champion", `"${data.champion}" is not in champions/tags.json`);
    for (const [enemy, entry] of Object.entries(data.matchups)) {
      const at = `/matchups/${enemy}`;
      if (!champions[enemy]) err(file, at, `"${enemy}" is not in champions/tags.json (typo or wrong Data Dragon id?)`);
      if (enemy === data.champion) warn(file, at, "mirror matchup");
      if (data.role === "jungle" && !entry.jungle) err(file, `${at}/jungle`, "jungle matchups need a `jungle` block for the path planner");
      if (data.role !== "jungle" && entry.jungle) warn(file, `${at}/jungle`, "`jungle` block is only used for junglers");
      const role = champions[enemy]?.typicalRoles;
      if (role && !role.includes(data.role)) warn(file, at, `${enemy} is not tagged as a typical ${data.role} in tags.json`);
      entry.powerSpikes.forEach((s, i) => {
        if (s.kind === "item" && s.item !== undefined && !itemIds.has(String(s.item))) {
          warn(file, `${at}/powerSpikes/${i}/item`, `item ${s.item} is not in items/counters.json (in-game spike notes need it there)`);
        }
      });
    }
  }

  for (const [id, item] of Object.entries(files.items.data.items)) {
    for (const champ of item.relevantTo) {
      if (!files.matchups.some((m) => m.data.champion === champ)) {
        err(files.items.file, `/items/${id}/relevantTo`, `"${champ}" has no matchup file`);
      }
    }
  }

  const ids = new Set<string>();
  files.paths.data.paths.forEach((p, i) => {
    const at = `/paths/${i}`;
    if (ids.has(p.id)) err(files.paths.file, `${at}/id`, `duplicate path id "${p.id}"`);
    ids.add(p.id);
    const last = p.clear[p.clear.length - 1]!;
    const scuttleSide = last.startsWith("scuttle-") ? last.slice("scuttle-".length) : null;
    if (scuttleSide && scuttleSide !== p.endsOn) {
      err(files.paths.file, `${at}/endsOn`, `path ends at ${last} but endsOn is "${p.endsOn}"`);
    }
    const firstQuadrant = quadrant(p.clear[0]!);
    if (p.clear.length <= 4 && p.clear.some((c) => quadrant(c) !== firstQuadrant && !c.startsWith("scuttle-"))) {
      warn(files.paths.file, `${at}/clear`, "short path crosses mid lane between jungle quadrants");
    }
  });

  return issues;
}

function quadrant(camp: string): "blue" | "red" {
  return ["blue", "gromp", "wolves", "scuttle-blue-buff-side"].includes(camp) ? "blue" : "red";
}

export function validateAll(files: DataFiles): Issue[] {
  const issues = [
    ...validateSchema("champion-tags", files.tags.file, files.tags.data),
    ...files.matchups.flatMap((m) => validateSchema("matchups", m.file, m.data)),
    ...validateSchema("item-counters", files.items.file, files.items.data),
    ...validateSchema("amumu-paths", files.paths.file, files.paths.data),
  ];
  if (issues.length) return issues;
  return crossCheck(files as Parameters<typeof crossCheck>[0]);
}

/** Champions Data Dragon knows that tags.json is missing (they get a class-based fallback). */
export function missingFromTags(tags: ChampionTagsFile, ddragonIds: string[]): string[] {
  return ddragonIds.filter((id) => !tags.champions[id]).sort();
}

export function formatIssue(i: Issue): string {
  return `${i.severity === "error" ? "ERROR" : "warn "} ${i.file}${i.path ? ` ${i.path}` : ""}: ${i.message}`;
}
