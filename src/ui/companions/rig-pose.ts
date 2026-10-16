// How a character's motion state (motion.ts `Raw`) becomes bone poses: the actual animation.
//
// Each function is a small procedural animator: a gait cycle (legs, arms, hips) driven by the gait
// phase, secondary motion (hair, ribbons, tail, skirt, cloak) that trails behind acceleration and
// swings a beat behind the body, and the pose channels (crouch, stretch, lean, tilt, arm, shake).
// Angles are degrees, clockwise on screen. `k` is texture px per CSS px (to turn lift into bone offsets).
// Everything is mirrored through `m` so a flipped character swings the right way.
import type { BonePose } from "./mesh-core";
import type { Raw } from "./motion";
import { AMUMU_RIG, GWEN_RIG } from "./rigs";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sin = (x: number) => Math.sin(x);

/** Gentle always-on sway (Hz, degrees, phase offset) so nothing is ever perfectly still. */
const idle = (t: number, hz: number, deg: number, ph = 0) => Math.sin((t / 1000) * hz * Math.PI * 2 + ph) * deg;

function byName(def: { bones: { name: string }[] }, poses: Record<string, BonePose>): BonePose[] {
  return def.bones.map((b) => poses[b.name] ?? {});
}

/** Keeps the feet planted while the body squashes or stretches about the hips. */
const planted = (sy: number, pivotY: number, groundY: number) => (1 - sy) * (groundY - pivotY);

export function poseGwen(r: Raw, k: number): BonePose[] {
  const m = r.facing >= 0 ? 1 : -1;
  const s = sin(r.phase * Math.PI);
  const c = Math.cos(r.phase * Math.PI);
  const a = r.amp;
  const lag = clamp(r.lag * 0.05, -16, 16) * m;
  const sy = 1 - 0.14 * r.crouch + r.stretch;
  const sx = 1 + 0.07 * r.crouch - r.stretch * 0.4;
  const airborne = clamp(r.hop / 6, 0, 1);
  const lean = r.lean * m;
  const tilt = r.tilt * m;
  const trem = r.shake * m;
  const swing = (ph: number, deg: number) => a * deg * sin(r.phase * Math.PI + ph);
  return byName(GWEN_RIG, {
    root: { ty: -r.lift * k + planted(sy, 400, 474), sy, sx },
    torso: { rot: lean * 0.8 + a * 3 * s - r.crouch * 3 + trem * 0.6 + idle(r.t, 0.3, 0.5) },
    head: {
      rot: tilt - lean * 0.35 + a * 2.2 * c + trem * 0.5 + idle(r.t, 0.22, 1.2, 1),
      ty: r.crouch * 5 - a * 2 * Math.abs(s),
    },
    hairL: { rot: lag * 0.9 + swing(0.8, 7) + idle(r.t, 0.45, 1.8) + airborne * 5 - lean * 0.2 },
    hairR: { rot: lag * 0.8 + swing(1.1, 6) + idle(r.t, 0.4, 1.6, 2) + airborne * 5 - lean * 0.2 },
    ribbonL: { rot: lag * 1.4 + swing(1.4, 11) + idle(r.t, 0.55, 3.2, 0.5) },
    ribbonR: { rot: lag * 1.4 + swing(1.9, 13) + idle(r.t, 0.5, 3.4, 1.7) },
    skirt: { rot: -lag * 0.3 + swing(0, 4.5), sx: 1 + 0.07 * r.crouch + a * 0.05 * Math.abs(s) + airborne * 0.05, sy: 1 - 0.06 * r.crouch },
    legL: { rot: 32 * a * s + airborne * -14, ty: -Math.max(0, s) * 11 * a - airborne * 8 },
    legR: { rot: -32 * a * s + airborne * 14, ty: -Math.max(0, -s) * 11 * a - airborne * 8 },
    // The scissors arm: swings against the stride, lifts when she reaches or flinches.
    scissors: { rot: (r.arm * 0.9 - a * 13 * s) * m - lag * 0.35 + idle(r.t, 0.35, 1.2, 0.4) },
  });
}

export function poseAmumu(r: Raw, k: number): BonePose[] {
  const m = r.facing >= 0 ? 1 : -1;
  const s = sin(r.phase * Math.PI);
  const c = Math.cos(r.phase * Math.PI);
  const a = r.amp;
  const lag = clamp(r.lag * 0.05, -16, 16) * m;
  const sy = 1 - 0.16 * r.crouch + r.stretch;
  const sx = 1 + 0.09 * r.crouch - r.stretch * 0.4;
  const airborne = clamp(r.hop / 6, 0, 1);
  const lean = r.lean * m;
  const tilt = r.tilt * m;
  const trem = r.shake * m;
  const swing = (ph: number, deg: number) => a * deg * sin(r.phase * Math.PI + ph);
  return byName(AMUMU_RIG, {
    root: { ty: -r.lift * k + planted(sy, 405, 414), sy, sx },
    body: { rot: lean * 0.6 + a * 7 * s + trem * 0.7 },
    head: { rot: tilt - lean * 0.3 + a * 4 * c + trem * 0.9 + idle(r.t, 0.25, 0.9, 0.6), ty: r.crouch * 6 },
    // His loose bandages: a stiff tail that whips behind him, and strips that trail.
    tail: { rot: -lag * 1.3 + swing(0.6, 10) + idle(r.t, 0.7, 3.4) + airborne * 9 + trem * 1.5 },
    stripR: { rot: lag * 1.3 + swing(1.2, 9) + idle(r.t, 0.55, 2.8, 1) - airborne * 6 },
    floorStrip: { rot: lag * 0.9 + swing(1.7, 8) + idle(r.t, 0.6, 3, 2) },
    legL: { rot: 24 * a * s + airborne * -12, ty: -Math.max(0, s) * 11 * a - airborne * 10 },
    legR: { rot: -24 * a * s + airborne * 12, ty: -Math.max(0, -s) * 11 * a - airborne * 10 },
    footBack: { rot: 20 * a * s * 0.9 + airborne * -10, ty: -Math.max(0, s) * 9 * a - airborne * 8 },
  });
}

/** Fiddlesticks: CSS variables (deg / px) for his layers plus the whole-body transform. */
export interface FiddleVars {
  head: number;
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  /** Lift of each foot (px) as it swings through. */
  legLy: number;
  legRy: number;
  /** Cloak flutter (skew, deg). */
  body: number;
  /** Whole-body transform. */
  lift: number;
  rot: number;
  sx: number;
  sy: number;
}

export function poseFiddle(r: Raw): FiddleVars {
  const m = r.facing >= 0 ? 1 : -1;
  const s = sin(r.phase * Math.PI);
  const c = Math.cos(r.phase * Math.PI);
  const a = r.amp;
  const lag = clamp(r.lag * 0.05, -14, 14) * m;
  const lean = r.lean * m;
  const airborne = clamp(r.hop / 6, 0, 1);
  return {
    head: r.tilt * m - lean * 0.4 + a * 3 * c + r.shake * m * 0.5 + idle(r.t, 0.18, 1.1, 0.3),
    armL: (-a * 40 * s + lag * 1.1 + r.arm * 1.1) * 1,
    armR: (a * 26 * s + lag * 0.8 - r.arm * 0.9) * 1,
    legL: 28 * a * s + airborne * -10,
    legR: -28 * a * s + airborne * 10,
    legLy: -Math.max(0, s) * 4 * a - airborne * 3,
    legRy: -Math.max(0, -s) * 4 * a - airborne * 3,
    body: clamp(lag * 0.7, -9, 9) + a * 2 * s,
    lift: r.lift,
    rot: lean * 0.8 + r.shake * m,
    sx: 1 + 0.08 * r.crouch - r.stretch * 0.4,
    sy: 1 - 0.16 * r.crouch + r.stretch,
  };
}
