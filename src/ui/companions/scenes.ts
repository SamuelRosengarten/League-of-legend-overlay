// Scenes: short choreographed interactions between the companions on the top border.
//
// This file is pure planning (no DOM): given where each companion stands (`left` / `width`, CSS px)
// and how wide the border is, it returns a script of beats. director.ts plays the script with
// physics (smooth acceleration / deceleration, anticipation, settling) so nothing teleports and
// nothing is a fixed-speed slide: a `go` only names a destination, a speed limit and a gait.
//
// Every scene ends with everyone sent home (`go 0`), and the director then waits for them to
// settle, so a scene always finishes back in the idle layout.
import type { CompanionId, Expression } from "./sprites";

export type SceneId = "chase" | "snip" | "scare";

/** How a companion travels; picks the cadence, bounce and limb swing (see director.ts). */
export type Gait = "run" | "waddle" | "stride" | "walk" | "creep";

/**
 * Timed body poses. `amt` is a signed lean in degrees (+ = clockwise) unless the pose says otherwise.
 * Each pose eases in, holds for `dur`, and eases back out on its own: nothing needs switching off.
 */
export type Pose =
  | "crouch" // anticipation: squash down
  | "windup" // crouch + lean back (before a lunge / jump)
  | "lean" // lean toward something
  | "reach" // lean + stretch toward something small (Gwen's scissors)
  | "tilt" // head tilt (Fiddlesticks) / head-over lean (others)
  | "loom" // slow rise + tilt, menacing
  | "recoil" // startled flinch away
  | "boo" // sudden stretch-up scare
  | "shiver" // nervous trembling (`amt` = degrees of tremble)
  | "sob"; // crying shudder

export interface Cast {
  who: CompanionId;
  /** Home position and size (CSS px). */
  left: number;
  width: number;
}

export type Step =
  | { at: number; who: CompanionId; expr: Expression; dur: number }
  /** A short speech bubble anchored to the companion; it pops in and out smoothly. */
  | { at: number; who: CompanionId; say: string; dur: number }
  /** Go to `to` px away from home. `max` = top speed (px/s), `smooth` = ease time (s). */
  | { at: number; who: CompanionId; to: number; gait: Gait | null; max: number; smooth: number }
  | { at: number; who: CompanionId; pose: Pose; amt?: number; dur: number }
  /** A hop `height` px high (clamped to the headroom). */
  | { at: number; who: CompanionId; hop: number }
  | { at: number; who: CompanionId; fx: "snip" };

export interface Scene {
  id: SceneId;
  /** Earliest end (ms); the director waits for everyone to settle after this. */
  duration: number;
  /** Companions drawn above the others while the scene runs. */
  raise: CompanionId[];
  steps: Step[];
}

export const SCENE_IDS: SceneId[] = ["chase", "snip", "scare"];
/** Who has to be on the border for a scene to make sense. */
const REQUIRES: Record<SceneId, CompanionId[][]> = {
  chase: [["fiddlesticks"], ["gwen", "amumu"]], // Fiddlesticks + at least one of the others
  snip: [["gwen"], ["amumu"]],
  scare: [["fiddlesticks"], ["amumu"]],
};

export function eligibleScenes(cast: Cast[]): SceneId[] {
  const has = new Set(cast.map((c) => c.who));
  return SCENE_IDS.filter((id) => REQUIRES[id].every((anyOf) => anyOf.some((w) => has.has(w))));
}

const GAP = 4;
/** Clear space kept between two faces at the closest point of a scene. */
const FACE_GAP = 12;
/** Scene targets stay this far from the window edge, so leaning / hopping sprites are never clipped. */
const WALL_PAD = 6;

export function planScene(id: SceneId, cast: Cast[], width: number): Scene | null {
  if (!eligibleScenes(cast).includes(id)) return null;
  const by = new Map(cast.map((c) => [c.who, c]));
  const clampOff = (c: Cast, left: number) => Math.min(Math.max(left, WALL_PAD), Math.max(WALL_PAD, width - c.width - WALL_PAD)) - c.left;
  if (id === "chase") return chase(by, width, clampOff);
  if (id === "snip") return snip(by, clampOff, width);
  return scare(by, clampOff, width);
}

type ClampOff = (c: Cast, left: number) => number;
/** A walk toward a partner is only worth showing when it covers real ground (else they just lean in). */
const MIN_WALK = 4;
const closer = (off: number, dir: number) => off * dir >= MIN_WALK;
/** Walking `mover` by `off` toward `partner` still leaves them a visible gap. */
const leavesGap = (mover: Cast, off: number, partner: Cast) => {
  const l = mover.left + off;
  return Math.max(l - (partner.left + partner.width), partner.left - (l + mover.width)) >= 5;
};
type CastMap = Map<CompanionId, Cast>;
const dirTo = (from: Cast, to: Cast) => (from.left + from.width / 2 <= to.left + to.width / 2 ? 1 : -1);

/** True if `f` stands between `g` and `a` on the border (it is in the way when they meet). */
function between(f: Cast | undefined, g: Cast, a: Cast): f is Cast {
  if (!f) return false;
  const c = f.left + f.width / 2;
  const [lo, hi] = [g.left + g.width / 2, a.left + a.width / 2].sort((x, y) => x - y) as [number, number];
  return c > lo && c < hi;
}

/** Where Gwen stands next to Amumu, and where a bystander slides to (her old spot) so they never overlap. */
function meet(g: Cast, a: Cast, f: Cast | undefined) {
  const dir = dirTo(g, a);
  const gLeft = dir > 0 ? a.left - g.width - FACE_GAP : a.left + a.width + FACE_GAP;
  const fLeft = !between(f, g, a) ? null : dir > 0 ? g.left : g.left + g.width - f!.width;
  return { dir, gLeft, fLeft };
}

// Travel presets: top speed (px/s) and ease time (s).
const RUN = { max: 230, smooth: 0.2 };
const WADDLE = { max: 120, smooth: 0.28 };
const WALK = { max: 75, smooth: 0.45 };
const CREEP = { max: 55, smooth: 0.6 };

function chase(by: CastMap, width: number, clampOff: ClampOff): Scene {
  const f = by.get("fiddlesticks")!;
  const prey = (["gwen", "amumu"] as const).flatMap((w) => (by.has(w) ? [by.get(w)!] : []));
  // The border is narrow (the three nearly fill it), so the chase uses its whole length like a
  // cartoon chase: Fiddlesticks charges to the FAR wall, the others dash the opposite way past him
  // (he runs behind them), then he turns, crouches and charges back at them.
  const d = f.left + f.width / 2 >= width / 2 ? -1 : 1; // direction of his first charge
  const farLeft = d < 0 ? WALL_PAD : width - WALL_PAD - f.width;
  // The prey bolt for the wall he started from, packed against it (nearest to that wall first).
  const ordered = [...prey].sort((x, y) => (d < 0 ? y.left - x.left : x.left - y.left));
  let cursor = d < 0 ? width - WALL_PAD : WALL_PAD;
  const target = new Map<CompanionId, number>();
  for (const p of ordered) {
    const left = d < 0 ? cursor - p.width : cursor;
    target.set(p.who, left);
    cursor = d < 0 ? left - GAP : left + p.width + GAP;
  }
  // After turning around he charges back to just behind the huddle.
  const backLeft = d < 0 ? cursor - f.width : cursor;
  const has = (w: CompanionId) => by.has(w);
  const steps: Step[] = [
    // 1. The scarecrow slowly turns his head toward them; his eyes brighten.
    { at: 0, who: "fiddlesticks", pose: "tilt", amt: d * 14, dur: 1400 },
    { at: 0, who: "fiddlesticks", expr: "stare", dur: 2700 },
    // 2. He crouches (anticipation).
    { at: 1000, who: "fiddlesticks", pose: "windup", amt: -d * 8, dur: 900 },
  ];
  // 3. Gwen notices first, Amumu a moment later.
  if (has("gwen")) {
    steps.push({ at: 1000, who: "gwen", expr: "scared", dur: 1500 });
    steps.push({ at: 1050, who: "gwen", say: "!", dur: 1100 });
    steps.push({ at: 1100, who: "gwen", pose: "recoil", amt: -d * 8, dur: 350 });
    steps.push({ at: 1100, who: "gwen", hop: 9 });
  }
  if (has("amumu")) {
    steps.push({ at: 1500, who: "amumu", expr: "worried", dur: 800 });
    steps.push({ at: 1550, who: "amumu", say: "!?", dur: 1000 });
    steps.push({ at: 1650, who: "amumu", expr: "scared", dur: 1500 });
    steps.push({ at: 1700, who: "amumu", pose: "shiver", amt: 2.5, dur: 600 });
  }
  // 4. The launch: he charges across the border, they sprint / waddle the other way past him.
  steps.push({ at: 2250, who: "fiddlesticks", pose: "windup", amt: -d * 10, dur: 380 });
  steps.push({ at: 2550, who: "fiddlesticks", to: clampOff(f, farLeft), gait: "stride", max: 200, smooth: 0.35 });
  let start = 2350;
  for (const p of ordered) {
    const gwen = p.who === "gwen";
    steps.push({ at: start, who: p.who, pose: "windup", amt: d * 6, dur: 260 });
    steps.push({ at: start + 220, who: p.who, to: clampOff(p, target.get(p.who)!), gait: gwen ? "run" : "waddle", ...(gwen ? RUN : WADDLE) });
    start += 240;
  }
  // 5. At the far wall he turns, stares and crouches again.
  steps.push({ at: 4800, who: "fiddlesticks", pose: "tilt", amt: -d * 14, dur: 1100 });
  steps.push({ at: 4800, who: "fiddlesticks", expr: "twist", dur: 1600 });
  steps.push({ at: 5700, who: "fiddlesticks", pose: "windup", amt: d * 9, dur: 800 });
  for (const p of ordered) steps.push({ at: 5000, who: p.who, expr: "scared", dur: 1500 });
  if (has("gwen")) steps.push({ at: 5900, who: "gwen", say: "!!", dur: 1000 });
  // 6. He charges back; they are cornered and cower.
  steps.push({ at: 6500, who: "fiddlesticks", to: clampOff(f, backLeft), gait: "stride", max: 210, smooth: 0.35 });
  for (const p of ordered) steps.push({ at: 6900, who: p.who, pose: "shiver", amt: 2, dur: 1800 });
  // 7. He looms over them, then everyone trudges home (the huddle first, Fiddlesticks last and slowest).
  steps.push({ at: 8300, who: "fiddlesticks", pose: "loom", amt: -d * 10, dur: 1500 });
  steps.push({ at: 8300, who: "fiddlesticks", expr: "stare", dur: 1500 });
  let back = 9900;
  for (const p of ordered) {
    steps.push({ at: back, who: p.who, to: 0, gait: p.who === "gwen" ? "walk" : "waddle", ...(p.who === "gwen" ? WALK : { max: 70, smooth: 0.4 }) });
    back += 150;
  }
  steps.push({ at: 10600, who: "fiddlesticks", to: 0, gait: "creep", ...CREEP });
  return { id: "chase", duration: 12400, raise: prey.map((p) => p.who), steps };
}

/** Free pixels beside `c` in direction `dir` before the next companion (or the wall padding). */
function roomBeside(by: CastMap, c: Cast, dir: number, width: number): number {
  const others = [...by.values()].filter((o) => o !== c);
  if (dir > 0) {
    const right = c.left + c.width;
    const next = others.filter((o) => o.left >= right - 1).map((o) => o.left);
    return Math.max(0, (next.length ? Math.min(...next) : width - WALL_PAD) - right);
  }
  const prev = others.filter((o) => o.left + o.width <= c.left + 1).map((o) => o.left + o.width);
  return Math.max(0, c.left - (prev.length ? Math.max(...prev) : WALL_PAD));
}

function snip(by: CastMap, clampOff: ClampOff, width: number): Scene {
  const g = by.get("gwen")!;
  const a = by.get("amumu")!;
  const f = by.get("fiddlesticks");
  // Stop a little way from him (scissors side first); Fiddlesticks, if in the way, slides into her spot.
  const { dir, gLeft, fLeft } = meet(g, a, f);
  const steps: Step[] = [
    // 1. Gwen spots the loose bandage.
    { at: 0, who: "gwen", expr: "curious", dur: 1600 },
    { at: 100, who: "gwen", say: "?", dur: 1300 },
    { at: 150, who: "gwen", pose: "tilt", amt: dir * 6, dur: 700 },
    // 3. Amumu notices: confused, then nervous.
    { at: 2000, who: "amumu", expr: "curious", dur: 900 },
    { at: 2050, who: "amumu", say: "?", dur: 800 },
    { at: 2900, who: "amumu", expr: "worried", dur: 1400 },
    { at: 2950, who: "amumu", say: "…", dur: 1100 },
    // 4. Careful reaching snips (kept a gap away from him).
    { at: 3300, who: "gwen", pose: "reach", amt: dir * 7, dur: 700 },
    { at: 3350, who: "gwen", expr: "snip", dur: 650 },
    { at: 3400, who: "gwen", say: "snip", dur: 650 },
    { at: 3500, who: "amumu", fx: "snip" },
    { at: 4150, who: "gwen", pose: "reach", amt: dir * 9, dur: 600 },
    { at: 4400, who: "amumu", fx: "snip" },
    // 5. Amumu recoils; Gwen is surprised, then playfully disappointed.
    { at: 4650, who: "amumu", pose: "recoil", amt: dir * 9, dur: 450 },
    { at: 4650, who: "amumu", hop: 14 },
    { at: 4700, who: "amumu", to: dir * Math.min(16, Math.max(0, roomBeside(by, a, dir, width) - 4)), gait: null, max: 220, smooth: 0.1 },
    { at: 4700, who: "amumu", expr: "surprised", dur: 1000 },
    { at: 4720, who: "amumu", say: "!", dur: 800 },
    { at: 4750, who: "gwen", pose: "recoil", amt: -dir * 6, dur: 400 },
    { at: 4750, who: "gwen", expr: "surprised", dur: 800 },
    { at: 5700, who: "gwen", expr: "pout", dur: 1500 },
    { at: 5700, who: "gwen", say: "hmph", dur: 1300 },
    { at: 5800, who: "gwen", pose: "tilt", amt: -dir * 8, dur: 1100 },
    // 6. Amumu checks his bandages and settles.
    { at: 5600, who: "amumu", to: 0, gait: "waddle", max: 70, smooth: 0.4 },
    { at: 6700, who: "amumu", pose: "tilt", amt: dir * -6, dur: 1100 },
    { at: 6700, who: "amumu", expr: "curious", dur: 1100 },
    { at: 8000, who: "amumu", expr: "sleepy", dur: 1000 },
    // 7. Gwen wanders back.
  ];
  if (f && fLeft !== null) {
    steps.push(
      { at: 700, who: "fiddlesticks", to: clampOff(f, fLeft), gait: "creep", ...CREEP },
      { at: 2400, who: "fiddlesticks", expr: "stare", dur: 1500 },
      { at: 7000, who: "fiddlesticks", to: 0, gait: "creep", ...CREEP },
    );
  }
  // 2. She walks over, curious (only if there is ground to cover; otherwise she just leans in), and later wanders back.
  const walkOff = clampOff(g, gLeft);
  if (closer(walkOff, dir) && leavesGap(g, walkOff, a)) {
    steps.push({ at: 700, who: "gwen", to: walkOff, gait: "walk", ...WALK });
    steps.push({ at: 7000, who: "gwen", to: 0, gait: "walk", ...WALK });
  }
  return { id: "snip", duration: 8800, raise: ["gwen"], steps };
}

function scare(by: CastMap, clampOff: ClampOff, width: number): Scene {
  const f = by.get("fiddlesticks")!;
  const a = by.get("amumu")!;
  const g = by.get("gwen");
  const dir = dirTo(f, a); // + = Amumu is to his right
  const steps: Step[] = [
    // 1. Slowly, unnaturally, he leans toward Amumu; head tilts; eyes brighten.
    { at: 0, who: "fiddlesticks", expr: "stare", dur: 2600 },
    { at: 600, who: "fiddlesticks", pose: "tilt", amt: dir * 8, dur: 1800 },
    { at: 1900, who: "fiddlesticks", pose: "loom", amt: dir * 10, dur: 1200 },
    // 2. Amumu notices and gets more and more nervous.
    { at: 1700, who: "amumu", expr: "worried", dur: 1300 },
    { at: 1750, who: "amumu", say: "…", dur: 1000 },
    { at: 2900, who: "amumu", expr: "scared", dur: 1100 },
    { at: 2950, who: "amumu", pose: "shiver", amt: 1.6, dur: 1200 },
    // 3. The scare: crouch, hold, then a sudden stretch-up and "BOO!".
    { at: 3300, who: "fiddlesticks", pose: "windup", amt: -dir * 6, dur: 700 },
    { at: 4000, who: "fiddlesticks", pose: "boo", amt: dir * 5, dur: 750 },
    { at: 4000, who: "fiddlesticks", expr: "boo", dur: 1100 },
    { at: 4030, who: "fiddlesticks", say: "BOO!", dur: 950 },
    // 4. Amumu jumps (away from him, never into Gwen) and cries cartoon tears.
    { at: 4100, who: "amumu", pose: "recoil", amt: dir * 10, dur: 450 },
    { at: 4100, who: "amumu", hop: 18 },
    { at: 4150, who: "amumu", to: dir * Math.min(12, Math.max(0, roomBeside(by, a, dir, width) - 4)), gait: null, max: 200, smooth: 0.1 },
    { at: 4150, who: "amumu", expr: "surprised", dur: 500 },
    { at: 4700, who: "amumu", expr: "cry", dur: 4300 },
    { at: 4750, who: "amumu", pose: "sob", amt: 1.4, dur: 4200 },
    // 5. He holds a creepy, satisfied pose.
    { at: 5000, who: "fiddlesticks", pose: "tilt", amt: dir * 10, dur: 2200 },
    { at: 5000, who: "fiddlesticks", expr: "twist", dur: 1700 },
  ];
  let end = 9600;
  if (g) {
    // 6. Gwen comforts him (a step closer if there is ground to cover); Fiddlesticks stays smug.
    const { dir: gDir, gLeft } = meet(g, a, f);
    const walkOff = clampOff(g, gLeft);
    steps.push(
      { at: 5600, who: "gwen", expr: "worried", dur: 1000 },
      { at: 5650, who: "gwen", say: "…", dur: 900 },
      { at: 7300, who: "gwen", expr: "comfort", dur: 2000 },
      { at: 7350, who: "gwen", say: "♥", dur: 1700 },
      { at: 7300, who: "gwen", pose: "lean", amt: gDir * 6, dur: 1800 },
      { at: 8000, who: "fiddlesticks", pose: "tilt", amt: -dir * 8, dur: 1400 },
    );
    if (closer(walkOff, gDir) && leavesGap(g, walkOff, a)) {
      steps.push({ at: 6000, who: "gwen", to: walkOff, gait: "walk", ...WALK }, { at: 9900, who: "gwen", to: 0, gait: "walk", ...WALK });
    }
    end = 11800;
  }
  steps.push({ at: g ? 9200 : 8300, who: "amumu", to: 0, gait: "waddle", max: 70, smooth: 0.4 });
  steps.push({ at: g ? 9400 : 8500, who: "amumu", expr: "sleepy", dur: 1200 });
  return { id: "scare", duration: end, raise: ["fiddlesticks"], steps };
}
