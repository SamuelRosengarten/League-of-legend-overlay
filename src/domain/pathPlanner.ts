// Amumu pre-game jungle path planner. Rule-based and explainable:
//
//   1. Lane states from curated champion profiles (earlyGame 1-3, ranged vs melee in lane):
//      my laners vs theirs → "priority" / "even" / "losing" / "unknown" (hidden picks).
//   2. Every path condition (data/jungle/amumu-paths.json) is evaluated to true / false / unknown
//      with a human-readable reason.
//   3. path score = baseScore + Σ favors(true) − Σ avoid(true); highest score is recommended.
//
// Paths name camps by buff side; on blue side the blue buff is top side, on red side it is bot side.
import type { BuffSide, JunglePath, JunglePathsFile, MatchupEntry, PathCondition, PathRule, Role } from "../data/types";
import type { Side } from "./match";
import type { ProfileLookup } from "./profiles";

export type MapLane = "top" | "mid" | "bot";
export type LaneStatus = "priority" | "even" | "losing" | "unknown";

export interface LaneState {
  lane: MapLane;
  status: LaneStatus;
  mine: string[];
  theirs: string[];
  /** Why: the numbers behind the status. */
  reason: string;
  /** My laners have hard CC / gank setup. */
  gankSetup: boolean;
  /** Every enemy laner has low mobility. */
  enemyImmobile: boolean;
}

export interface Condition {
  value: boolean | null;
  reason: string;
}

export interface PathOption {
  path: JunglePath;
  score: number;
  startLane: MapLane;
  endLane: MapLane;
  firstGank: MapLane | null;
  applied: { rule: PathRule; kind: "favor" | "avoid" }[];
  conditions: Record<PathCondition, Condition>;
}

export interface EnemyJungler {
  championId: string | null;
  invadeRisk: "low" | "medium" | "high" | "unknown";
  strongLevels: number[];
  note: string | null;
  curated: boolean;
}

export interface JunglePlan {
  side: Side;
  lanes: Record<MapLane, LaneState>;
  enemyJungler: EnemyJungler;
  options: PathOption[];
  recommended: PathOption;
  invadeWarning: string | null;
}

export interface PlanPlayer {
  championId: string | null;
  role: Role | null;
}

const HARD_CC = new Set(["stun", "root", "knockup", "knockback", "pull", "charm", "fear", "taunt", "suppression", "sleep", "polymorph"]);
const PRIORITY_MARGIN = 0.75;

export function laneForBuffSide(buffSide: BuffSide, side: Side): MapLane {
  const blueBuffTop = side === "blue";
  return (buffSide === "blue-buff-side") === blueBuffTop ? "top" : "bot";
}

const LANE_ROLES: Record<MapLane, Role[]> = { top: ["top"], mid: ["middle"], bot: ["bottom", "utility"] };

function laneState(lane: MapLane, allies: PlanPlayer[], enemies: PlanPlayer[], profileOf: ProfileLookup, name: (id: string) => string): LaneState {
  const pick = (team: PlanPlayer[]) => team.filter((p) => p.role && LANE_ROLES[lane].includes(p.role));
  const mine = pick(allies);
  const theirs = pick(enemies);
  const ids = (ps: PlanPlayer[]) => ps.map((p) => p.championId).filter((x): x is string => !!x);
  const base = { lane, mine: ids(mine), theirs: ids(theirs) };
  const expected = LANE_ROLES[lane].length;
  const complete = (ps: PlanPlayer[]) => ps.length === expected && ps.every((p) => p.championId && profileOf(p.championId));
  const mineProfiles = mine.map((p) => profileOf(p.championId)?.profile).filter((p) => !!p);
  const gankSetup = mineProfiles.some((p) => p.cc.some((c) => HARD_CC.has(c)) || p.traits.includes("gank-setup"));

  if (!complete(mine) || !complete(theirs)) {
    return { ...base, status: "unknown", reason: `${lane}: not all picks known yet`, gankSetup, enemyImmobile: false };
  }
  // Lane strength: average earlyGame, +0.5 for a ranged laner into a melee one (top/mid only).
  const strength = (ps: PlanPlayer[], vs: PlanPlayer[]) => {
    const prof = ps.map((p) => profileOf(p.championId)!.profile);
    const vsProf = vs.map((p) => profileOf(p.championId)!.profile);
    let s = prof.reduce((sum, p) => sum + p.earlyGame, 0) / prof.length;
    if (lane !== "bot" && prof[0]!.range === "ranged" && vsProf[0]!.range === "melee") s += 0.5;
    return s;
  };
  const a = strength(mine, theirs);
  const b = strength(theirs, mine);
  const diff = a - b;
  const status: LaneStatus = diff >= PRIORITY_MARGIN ? "priority" : diff <= -PRIORITY_MARGIN ? "losing" : "even";
  const names = (ps: PlanPlayer[]) => ps.map((p) => name(p.championId!)).join(" + ");
  const enemyImmobile = theirs.every((p) => profileOf(p.championId)!.profile.mobility === "low");
  return {
    ...base,
    status,
    reason: `${lane}: ${names(mine)} (early ${a.toFixed(1)}) vs ${names(theirs)} (early ${b.toFixed(1)})`,
    gankSetup,
    enemyImmobile,
  };
}

function enemyJungler(enemies: PlanPlayer[], entryOf: (id: string) => MatchupEntry | null, profileOf: ProfileLookup): EnemyJungler {
  const jg = enemies.find((p) => p.role === "jungle");
  if (!jg?.championId) return { championId: null, invadeRisk: "unknown", strongLevels: [], note: null, curated: false };
  const j = entryOf(jg.championId)?.jungle;
  if (j) return { championId: jg.championId, invadeRisk: j.invadeRisk, strongLevels: j.strongLevels, note: j.note, curated: true };
  // Uncurated: derive from generic tags.
  const p = profileOf(jg.championId)?.profile;
  const invadeRisk = !p ? "unknown" : p.traits.includes("early-invader") ? "high" : p.earlyGame === 3 ? "medium" : "low";
  return { championId: jg.championId, invadeRisk, strongLevels: [], note: null, curated: false };
}

function evaluate(
  path: JunglePath,
  side: Side,
  lanes: Record<MapLane, LaneState>,
  jungler: EnemyJungler,
  name: (id: string) => string,
): Record<PathCondition, Condition> {
  const endLane = laneForBuffSide(path.endsOn, side);
  const startLane: MapLane = endLane === "top" ? "bot" : "top";
  const end = lanes[endLane];
  const start = lanes[startLane];
  const known = (l: LaneState, v: boolean, reason: string): Condition =>
    l.status === "unknown" ? { value: null, reason: l.reason } : { value: v, reason };
  const jgName = jungler.championId ? name(jungler.championId) : "enemy jungler";
  const jgKnown = jungler.invadeRisk !== "unknown";
  const jg = (v: boolean, reason: string): Condition => (jgKnown ? { value: v, reason } : { value: null, reason: "enemy jungler not revealed yet" });

  return {
    "end-lane-priority": known(end, end.status === "priority", end.reason),
    "end-lane-losing": known(end, end.status === "losing", end.reason),
    "end-lane-not-priority": known(end, end.status !== "priority", end.reason),
    "end-lane-gank-setup": { value: end.mine.length ? end.gankSetup : null, reason: `${endLane}: ${end.gankSetup ? "has" : "no"} follow-up CC` },
    "end-lane-enemy-immobile": known(end, end.enemyImmobile, `${endLane}: enemy ${end.enemyImmobile ? "has low" : "has some"} mobility`),
    "start-lane-priority": known(start, start.status === "priority", start.reason),
    "mid-priority": known(lanes.mid, lanes.mid.status === "priority", lanes.mid.reason),
    "enemy-jungler-invader": jg(jungler.invadeRisk === "high", `${jgName}: invade risk ${jungler.invadeRisk}`),
    "enemy-jungler-passive": jg(jungler.invadeRisk === "low", `${jgName}: invade risk ${jungler.invadeRisk}`),
    "enemy-jungler-strong-early": jg(
      jungler.invadeRisk !== "low" && (jungler.strongLevels.some((l) => l <= 3) || jungler.invadeRisk === "high"),
      jungler.strongLevels.length ? `${jgName}: strong at level ${jungler.strongLevels.join("–")}` : `${jgName}: invade risk ${jungler.invadeRisk}`,
    ),
  };
}

export function planJungle(input: {
  side: Side;
  allies: PlanPlayer[];
  enemies: PlanPlayer[];
  paths: JunglePathsFile;
  entryOf: (id: string) => MatchupEntry | null;
  profileOf: ProfileLookup;
  name: (id: string) => string;
}): JunglePlan {
  const { side, allies, enemies, profileOf, name } = input;
  const lanes = {
    top: laneState("top", allies, enemies, profileOf, name),
    mid: laneState("mid", allies, enemies, profileOf, name),
    bot: laneState("bot", allies, enemies, profileOf, name),
  };
  const jungler = enemyJungler(enemies, input.entryOf, profileOf);

  const options = input.paths.paths.map((path, order): PathOption & { order: number } => {
    const conditions = evaluate(path, side, lanes, jungler, name);
    const applied = [
      ...path.favors.filter((r) => conditions[r.condition].value === true).map((rule) => ({ rule, kind: "favor" as const })),
      ...path.avoid.filter((r) => conditions[r.condition].value === true).map((rule) => ({ rule, kind: "avoid" as const })),
    ];
    const score = path.baseScore + applied.reduce((s, a) => s + (a.kind === "favor" ? a.rule.weight : -a.rule.weight), 0);
    const endLane = laneForBuffSide(path.endsOn, side);
    return {
      path,
      score: Math.round(score * 10) / 10,
      startLane: laneForBuffSide(path.endsOn === "blue-buff-side" ? "red-buff-side" : "blue-buff-side", side),
      endLane,
      firstGank: path.firstGank === "mid" ? "mid" : path.firstGank === "none" ? null : endLane,
      applied,
      conditions,
      order,
    };
  });
  // Highest score first; ties keep the curated file order (safer paths are listed first).
  options.sort((a, b) => b.score - a.score || a.order - b.order);

  let invadeWarning: string | null = null;
  if (jungler.championId && (jungler.invadeRisk === "high" || jungler.invadeRisk === "medium")) {
    invadeWarning = jungler.note ?? `${name(jungler.championId)} can contest your jungle early — ward your buff entrances and avoid isolated fights before level 6.`;
  }

  return { side, lanes, enemyJungler: jungler, options, recommended: options[0]!, invadeWarning };
}

const CAMP_LABEL: Record<string, string> = {
  blue: "Blue buff",
  gromp: "Gromp",
  wolves: "Wolves",
  raptors: "Raptors",
  red: "Red buff",
  krugs: "Krugs",
};

/** "Red buff (bot)", "Scuttle (top river)". */
export function campLabel(camp: string, side: Side): string {
  if (camp.startsWith("scuttle-")) {
    return `Scuttle (${laneForBuffSide(camp.slice("scuttle-".length) as BuffSide, side)} river)`;
  }
  const buffSide: BuffSide = ["blue", "gromp", "wolves"].includes(camp) ? "blue-buff-side" : "red-buff-side";
  return `${CAMP_LABEL[camp] ?? camp} (${laneForBuffSide(buffSide, side)})`;
}
