// Scenes: short choreographed interactions between the companions on the top border.
//
// This file is pure planning (no DOM): given where each companion stands (`left` / `width`, CSS px)
// and how wide the border is, it returns a script of beats. director.ts plays the script with a
// motion model (motion.ts) and the characters' rigs (rig-pose.ts) turn that into real animation:
// gait cycles with stepping legs, swinging arms and scissors, trailing hair, ribbons, tail and cloak.
// A `go` only names a destination, a speed limit and a gait; poses are timed envelopes with
// anticipation built in (crouch before a launch, wind-up before a scare).
//
// The border is narrow (the three nearly fill it), so nobody ever passes through anybody: the chase
// runs off one side and back in from the other, and the other scenes happen in place.
// Every scene ends with everyone sent home, and the director waits for them to settle.
import type { CompanionId, Expression } from "./sprites";

export type SceneId = "chase" | "snip" | "scare";

/** How a companion travels; picks the cadence and stride (see motion.ts / rig-pose.ts). */
export type Gait = "run" | "waddle" | "stride" | "walk" | "creep";

/**
 * Timed body poses. `amt` is a signed lean in degrees (+ = clockwise on screen) unless stated.
 * Each pose eases in, holds for `dur`, and eases back out on its own: nothing needs switching off.
 */
export type Pose =
  | "crouch" // anticipation: squash down
  | "windup" // crouch + lean back, arms back (before a lunge / jump / scare)
  | "lean" // lean toward something
  | "reach" // lean + stretch toward something, arm out
  | "snip" // reach with the scissors snapping
  | "tilt" // head tilt (Fiddlesticks) / head-over lean (others)
  | "loom" // slow rise + tilt, menacing
  | "recoil" // startled flinch away, arms up
  | "boo" // sudden stretch-up scare, arms flying up
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
  /** Re-enter from the other side: jump to `warp` (px offset, fully out of sight) carrying `vx` (px/s). */
  | { at: number; who: CompanionId; warp: number; vx: number }
  | { at: number; who: CompanionId; pose: Pose; amt?: number; dur: number }
  /** A hop `hop` px high (clamped to the headroom). */
  | { at: number; who: CompanionId; hop: number }
  /** Which way it looks on screen (−1 left, +1 right; 0 = back to its layout's own facing). It turns through a smooth squeeze. */
  | { at: number; who: CompanionId; face: -1 | 0 | 1 }
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

/** Scene targets stay this far from the window edge, so leaning / hopping sprites are never clipped. */
const WALL_PAD = 6;
/** Visible gap kept between two companions at the closest point of a scene. */
const FACE_GAP = 8;

export function planScene(id: SceneId, cast: Cast[], width: number): Scene | null {
  if (!eligibleScenes(cast).includes(id)) return null;
  const by = new Map(cast.map((c) => [c.who, c]));
  if (id === "chase") return chase(by, width);
  if (id === "snip") return snip(by);
  return scare(by, width);
}

type CastMap = Map<CompanionId, Cast>;
const dirTo = (from: Cast, to: Cast) => (from.left + from.width / 2 <= to.left + to.width / 2 ? 1 : -1);

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

/** Rough travel time (ms) at top speed `max` with ease `smooth`: used to schedule re-entries. */
const travelMs = (dist: number, max: number, smooth: number) => (Math.abs(dist) / max + 2.2 * smooth) * 1000;

// Travel presets: top speed (px/s) and ease time (s).
const RUN = { max: 240, smooth: 0.2 };
const WADDLE = { max: 175, smooth: 0.28 };
// Slower than the slowest runner ahead of him, so he stays on their heels and never runs them over.
const STRIDE = { max: 165, smooth: 0.32 };
const WALK = { max: 80, smooth: 0.45 };

function chase(by: CastMap, width: number): Scene {
  const f = by.get("fiddlesticks")!;
  const prey = (["gwen", "amumu"] as const).flatMap((w) => (by.has(w) ? [by.get(w)!] : []));
  // They flee toward the side that is farther from him, off the edge of the window, and come back in
  // from the other side (a classic cartoon chase on a narrow stage); he thunders after them.
  // The chase runs from him toward them (they are all on one side of him), so nobody has to pass him.
  const preyMid = prey.reduce((s, c) => s + c.left + c.width / 2, 0) / prey.length;
  const dir = preyMid < f.left + f.width / 2 ? -1 : 1; // direction of the chase (−1 = leftward)
  const off = (c: Cast) => (dir < 0 ? -(c.left + c.width) - 140 : width - c.left + 140); // fully out of sight
  const inn = (c: Cast) => (dir < 0 ? width - c.left + 8 : -(c.left + c.width) - 8); // just outside the entry side
  const enterV = (max: number) => dir * max * 0.9;
  // Prey nearest the exit side leave first.
  const order = [...prey].sort((a, b) => (dir < 0 ? a.left - b.left : b.left - a.left));
  const steps: Step[] = [
    // 1. The scarecrow slowly turns his head toward them; his eyes brighten.
    { at: 0, who: "fiddlesticks", pose: "tilt", amt: dir * 14, dur: 1500 },
    { at: 0, who: "fiddlesticks", expr: "stare", dur: 2600 },
    // 2. He crouches, arms drawn back (anticipation).
    { at: 900, who: "fiddlesticks", pose: "windup", amt: -dir * 8, dur: 950 },
  ];
  // 3. They notice: Gwen first, Amumu a moment later.
  if (by.has("gwen")) {
    steps.push({ at: 1000, who: "gwen", expr: "scared", dur: 1500 });
    steps.push({ at: 1050, who: "gwen", say: "!", dur: 1100 });
    steps.push({ at: 1100, who: "gwen", pose: "recoil", amt: -dir * 8, dur: 380 });
    steps.push({ at: 1100, who: "gwen", hop: 9 });
  }
  if (by.has("amumu")) {
    steps.push({ at: 1500, who: "amumu", expr: "worried", dur: 800 });
    steps.push({ at: 1550, who: "amumu", say: "!?", dur: 1000 });
    steps.push({ at: 1650, who: "amumu", expr: "scared", dur: 1500 });
    steps.push({ at: 1700, who: "amumu", pose: "shiver", amt: 2.5, dur: 600 });
  }
  // 4. The launch: crouch, then Gwen sprints and Amumu waddles out of the strip; he lunges after them.
  let start = 1950;
  let preyOut = 0;
  const reenter: { c: Cast; max: number; gait: "run" | "waddle" }[] = [];
  for (const p of order) {
    const gwen = p.who === "gwen";
    const sp = gwen ? RUN : WADDLE;
    steps.push({ at: start, who: p.who, pose: "windup", amt: dir * 6, dur: 280 });
    steps.push({ at: start + 240, who: p.who, to: off(p), gait: gwen ? "run" : "waddle", ...sp });
    preyOut = Math.max(preyOut, start + 240 + travelMs(off(p), sp.max, sp.smooth));
    reenter.push({ c: p, max: sp.max, gait: gwen ? "run" : "waddle" });
    start += 320;
  }
  steps.push({ at: 2500, who: "fiddlesticks", pose: "windup", amt: -dir * 10, dur: 420 });
  steps.push({ at: 2900, who: "fiddlesticks", to: off(f), gait: "stride", ...STRIDE });
  const fOut = 2900 + travelMs(off(f), STRIDE.max, STRIDE.smooth);
  // 5. After a short empty beat the others burst back in from the far side and run home while he is
  //    still thundering off the other end; he follows them in a moment later.
  let t = preyOut + 250;
  for (const e of reenter) {
    steps.push({ at: t, who: e.c.who, warp: inn(e.c), vx: enterV(e.max) });
    steps.push({ at: t, who: e.c.who, to: 0, gait: e.gait, ...(e.gait === "run" ? RUN : WADDLE) });
    steps.push({ at: t + 60, who: e.c.who, expr: "scared", dur: 1300 });
    // The next one comes in only once this one has cleared the entry point (width + a gap at its speed).
    t += ((e.c.width + 14) / (e.max * 0.9)) * 1000 + 150;
  }
  const fIn = Math.max(t + 600, fOut + 150);
  steps.push({ at: fIn, who: "fiddlesticks", warp: inn(f), vx: enterV(STRIDE.max) });
  steps.push({ at: fIn, who: "fiddlesticks", to: 0, gait: "stride", ...STRIDE });
  steps.push({ at: fIn, who: "fiddlesticks", expr: "stare", dur: 1600 });
  const home = fIn + travelMs(inn(f), STRIDE.max, STRIDE.smooth) + 200;
  // 6. They pant; he looms, eyes flaring, then settles.
  for (const e of reenter) steps.push({ at: home - 300, who: e.c.who, pose: "shiver", amt: 1.8, dur: 1500 });
  steps.push({ at: home, who: "fiddlesticks", pose: "loom", amt: -dir * 8, dur: 1400 });
  if (by.has("gwen")) steps.push({ at: home + 200, who: "gwen", say: "!!", dur: 900 });
  return { id: "chase", duration: home + 1700, raise: [], steps };
}

function snip(by: CastMap): Scene {
  const g = by.get("gwen")!;
  const a = by.get("amumu")!;
  const dir = dirTo(g, a); // + = Amumu is to her right
  // Gwen turns to face him (so the scissors lead), and steps closer if there is ground to cover.
  const gap = dir > 0 ? a.left - (g.left + g.width) : g.left - (a.left + a.width);
  const step = Math.max(0, gap - FACE_GAP);
  const steps: Step[] = [
    // 1. Gwen spots the loose bandage and turns toward it.
    { at: 0, who: "gwen", expr: "curious", dur: 1700 },
    { at: 100, who: "gwen", say: "?", dur: 1300 },
    { at: 200, who: "gwen", face: dir },
    { at: 500, who: "gwen", pose: "tilt", amt: dir * 6, dur: 900 },
    // 3. Amumu notices: confused, then nervous.
    { at: 1700, who: "amumu", expr: "curious", dur: 900 },
    { at: 1750, who: "amumu", say: "?", dur: 800 },
    { at: 1800, who: "amumu", pose: "tilt", amt: -dir * 8, dur: 900 },
    { at: 2700, who: "amumu", expr: "worried", dur: 1500 },
    { at: 2750, who: "amumu", say: "…", dur: 1100 },
    { at: 2800, who: "amumu", pose: "shiver", amt: 1.2, dur: 1000 },
    // 4. She reaches out slowly with the scissors... and snips (twice, carefully).
    { at: 2600, who: "gwen", pose: "reach", amt: dir * 6, dur: 700 },
    { at: 3300, who: "gwen", pose: "snip", amt: dir * 8, dur: 1200 },
    { at: 3350, who: "gwen", expr: "snip", dur: 1100 },
    { at: 3400, who: "gwen", say: "snip", dur: 800 },
    { at: 3500, who: "amumu", fx: "snip" },
    { at: 4200, who: "amumu", fx: "snip" },
    // 5. Amumu recoils; Gwen is surprised, then playfully disappointed.
    { at: 4500, who: "amumu", pose: "recoil", amt: dir * 9, dur: 500 },
    { at: 4500, who: "amumu", hop: 14 },
    { at: 4500, who: "amumu", expr: "surprised", dur: 1000 },
    { at: 4520, who: "amumu", say: "!", dur: 800 },
    { at: 4600, who: "gwen", pose: "recoil", amt: -dir * 6, dur: 450 },
    { at: 4600, who: "gwen", expr: "surprised", dur: 800 },
    { at: 5600, who: "gwen", expr: "pout", dur: 1500 },
    { at: 5600, who: "gwen", say: "hmph", dur: 1300 },
    { at: 5700, who: "gwen", pose: "tilt", amt: -dir * 8, dur: 1100 },
    // 6. Amumu checks his bandages and settles.
    { at: 6000, who: "amumu", pose: "tilt", amt: -dir * 8, dur: 1200 },
    { at: 6000, who: "amumu", expr: "curious", dur: 1200 },
    { at: 7400, who: "amumu", expr: "sleepy", dur: 1000 },
  ];
  // The walk over (and back) only if there is ground to cover; otherwise she just leans in.
  if (step >= 4) {
    steps.push({ at: 700, who: "gwen", to: dir * step, gait: "walk", ...WALK });
    steps.push({ at: 6900, who: "gwen", to: 0, gait: "walk", ...WALK });
  }
  steps.push({ at: 6800, who: "gwen", face: 0 });
  return { id: "snip", duration: 8600, raise: ["gwen"], steps };
}

function scare(by: CastMap, width: number): Scene {
  const f = by.get("fiddlesticks")!;
  const a = by.get("amumu")!;
  const g = by.get("gwen");
  const dir = dirTo(f, a); // + = Amumu is to his right
  // He jumps away from Fiddlesticks, but never closer than a visible gap to whoever is on that side.
  const shove = dir * Math.min(12, Math.max(0, roomBeside(by, a, dir, width) - 10));
  const steps: Step[] = [
    // 1. Slowly, unnaturally, he leans toward Amumu: head tilts, arms rise, eyes brighten.
    { at: 0, who: "fiddlesticks", expr: "stare", dur: 2800 },
    { at: 500, who: "fiddlesticks", pose: "tilt", amt: dir * 9, dur: 2000 },
    { at: 1700, who: "fiddlesticks", pose: "loom", amt: dir * 11, dur: 1300 },
    // 2. Amumu notices and gets more and more nervous.
    { at: 1700, who: "amumu", expr: "worried", dur: 1300 },
    { at: 1750, who: "amumu", say: "…", dur: 1000 },
    { at: 2900, who: "amumu", expr: "scared", dur: 1100 },
    { at: 2950, who: "amumu", pose: "shiver", amt: 1.6, dur: 1200 },
    // 3. The scare: a crouch with the arms drawn back, a held beat, then a sudden stretch-up, arms flying.
    { at: 3200, who: "fiddlesticks", pose: "windup", amt: -dir * 6, dur: 800 },
    { at: 4100, who: "fiddlesticks", pose: "boo", amt: dir * 5, dur: 800 },
    { at: 4100, who: "fiddlesticks", expr: "boo", dur: 1100 },
    { at: 4130, who: "fiddlesticks", say: "BOO!", dur: 950 },
    // 4. Amumu jumps (away from him, never into Gwen) and cries cartoon tears.
    { at: 4200, who: "amumu", pose: "recoil", amt: dir * 10, dur: 500 },
    { at: 4200, who: "amumu", hop: 20 },
    { at: 4250, who: "amumu", to: shove, gait: null, max: 200, smooth: 0.1 },
    { at: 4250, who: "amumu", expr: "surprised", dur: 500 },
    { at: 4800, who: "amumu", expr: "cry", dur: 4300 },
    { at: 4850, who: "amumu", pose: "sob", amt: 1.4, dur: 4200 },
    // 5. He holds a creepy, satisfied pose.
    { at: 5100, who: "fiddlesticks", pose: "tilt", amt: dir * 11, dur: 2400 },
    { at: 5100, who: "fiddlesticks", expr: "twist", dur: 1700 },
  ];
  let end = 9800;
  if (g) {
    // 6. Gwen turns toward him and comforts him (a step closer if there is ground to cover).
    const gDir = dirTo(g, a);
    // Where Amumu actually is by now (he was shoved away from Fiddlesticks).
    const aLeft = a.left + shove;
    const gap = gDir > 0 ? aLeft - (g.left + g.width) : g.left - (aLeft + a.width);
    steps.push(
      { at: 5600, who: "gwen", expr: "worried", dur: 1000 },
      { at: 5650, who: "gwen", say: "…", dur: 900 },
      { at: 5800, who: "gwen", face: gDir },
      { at: 7300, who: "gwen", expr: "comfort", dur: 2000 },
      { at: 7350, who: "gwen", say: "♥", dur: 1700 },
      { at: 7300, who: "gwen", pose: "reach", amt: gDir * 4, dur: 1800 },
      { at: 8100, who: "fiddlesticks", pose: "tilt", amt: -dir * 8, dur: 1400 },
      { at: 9700, who: "gwen", face: 0 },
    );
    if (gap - FACE_GAP >= 4) {
      steps.push({ at: 6000, who: "gwen", to: gDir * (gap - FACE_GAP), gait: "walk", ...WALK }, { at: 9900, who: "gwen", to: 0, gait: "walk", ...WALK });
    }
    end = 11800;
  }
  steps.push({ at: g ? 9200 : 8300, who: "amumu", to: 0, gait: "waddle", max: 70, smooth: 0.4 });
  steps.push({ at: g ? 9400 : 8500, who: "amumu", expr: "sleepy", dur: 1200 });
  return { id: "scare", duration: end, raise: ["fiddlesticks"], steps };
}
