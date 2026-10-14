// TypeScript view of data/*.json. The JSON Schemas in data/schema are the source of truth;
// keep these in sync when a schema changes.

export type Role = "top" | "jungle" | "middle" | "bottom" | "utility";
export type Confidence = "high" | "medium" | "low";
export type DamageType = "physical" | "magic" | "mixed";
export type CcType =
  | "stun" | "root" | "knockup" | "knockback" | "pull" | "slow" | "charm" | "fear"
  | "taunt" | "suppression" | "silence" | "sleep" | "polymorph" | "blind" | "ground";

export const TAGS = [
  "true-damage", "percent-hp-damage", "burst", "sustained-dps", "ranged-poke", "kite", "lane-bully",
  "early-game", "scaling", "point-click-cc", "aoe-cc", "hard-engage", "anti-engage", "cleanse",
  "spell-shield", "untargetable", "high-mobility", "invisibility", "tank", "healing", "shields-allies",
  "grievous-wounds", "split-push", "dive", "gank-setup", "early-invader", "global",
] as const;
export type Tag = (typeof TAGS)[number];

export interface Text {
  text: string;
  confidence?: Confidence;
}

export interface ChampionProfile {
  damage: DamageType;
  range: "melee" | "ranged";
  mobility: "low" | "medium" | "high";
  typicalRoles: Role[];
  cc: CcType[];
  traits: Tag[];
  earlyGame: 1 | 2 | 3;
  confidence?: Confidence;
}

export interface ChampionTagsFile {
  champions: Record<string, ChampionProfile>;
}

export type Phase = "me" | "them" | "even";

export interface PowerSpike {
  kind: "level" | "item" | "other";
  level?: number;
  item?: number;
  note: string;
  confidence?: Confidence;
}

export interface MatchupEntry {
  difficulty: 1 | 2 | 3 | 4 | 5;
  threat: 1 | 2 | 3 | 4 | 5;
  phaseAdvantage: { early: Phase; mid: Phase; late: Phase };
  powerSpikes: PowerSpike[];
  dangerAbilities: { key: "P" | "Q" | "W" | "E" | "R"; name: string; note: string; confidence?: Confidence }[];
  tips: Text[];
  itemAdjustments: { item?: number; name: string; note: string; confidence?: Confidence }[];
  runeAdjustments: { rune: string; note: string; confidence?: Confidence }[];
  threatTags: Tag[];
  jungle?: { invadeRisk: "low" | "medium" | "high"; strongLevels: number[]; note: string };
  lastReviewedPatch: string;
  confidence: Confidence;
  reviewNotes?: string;
}

export interface MatchupFile {
  champion: string;
  role: Role;
  threatWeights: Partial<Record<Tag, number>>;
  genericAdvice: Partial<Record<Tag, Text>>;
  matchups: Record<string, MatchupEntry>;
}

export interface CounterItem {
  name: string;
  effects: Tag[];
  relevantTo: string[];
  note: string;
  confidence: Confidence;
}

export interface ItemCountersFile {
  items: Record<string, CounterItem>;
}

export type Camp =
  | "blue" | "gromp" | "wolves" | "raptors" | "red" | "krugs"
  | "scuttle-blue-buff-side" | "scuttle-red-buff-side";
export type BuffSide = "blue-buff-side" | "red-buff-side";
export type PathCondition =
  | "end-lane-priority" | "end-lane-losing" | "end-lane-not-priority" | "end-lane-gank-setup" | "end-lane-enemy-immobile"
  | "start-lane-priority" | "mid-priority" | "enemy-jungler-invader" | "enemy-jungler-passive"
  | "enemy-jungler-strong-early";

export interface PathRule {
  condition: PathCondition;
  weight: number;
  reason: string;
}

export interface JunglePath {
  id: string;
  name: string;
  clear: Camp[];
  endsOn: BuffSide;
  approxFinish: string;
  firstGank: "end-side-lane" | "mid" | "none";
  baseScore: number;
  favors: PathRule[];
  avoid: PathRule[];
  notes: Text[];
  confidence: Confidence;
}

export interface JunglePathsFile {
  paths: JunglePath[];
}
