// The motion model behind every scene (pure maths, no DOM): where a companion is, how fast it moves,
// which foot is down, and which pose it is holding. Rigs (rig-pose.ts) turn this into bone angles.
//
//  - Position follows a smooth-damped target with a speed limit (natural acceleration and braking,
//    no overshoot). A gait phase advances with the speed, so footfalls match the movement.
//  - Hops are ballistic; landings kick a squash that springs back.
//  - Poses are eased envelopes (anticipation, hold, release) on a few spring channels.
//  - `facing` turns smoothly through a flat squeeze, never a pop.
import type { Gait, Pose } from "./scenes";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Critically damped follow with a speed limit (no overshoot). Returns [position, velocity]. */
export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, maxSpeed: number, dt: number): [number, number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * st;
  const change = clamp(cur - target, -maxChange, maxChange);
  const goal = cur - change;
  const temp = (vel + omega * change) * dt;
  let v = (vel - omega * temp) * e;
  let out = goal + (change + temp) * e;
  if (target - cur > 0 === out > target) {
    out = target;
    v = (out - target) / dt;
  }
  return [out, v];
}

export interface GaitSpec {
  /** Steps per second at the reference speed. */
  cadence: number;
  /** Reference speed (px/s) the gait is designed for. */
  ref: number;
  /** Bounce per step (px), forward lean at the reference speed (deg). */
  bob: number;
  lean: number;
}
export const GAITS: Record<Gait, GaitSpec> = {
  run: { cadence: 4.4, ref: 200, bob: 7, lean: 9 },
  waddle: { cadence: 3.0, ref: 100, bob: 3, lean: 3 },
  stride: { cadence: 2.2, ref: 150, bob: 4, lean: 8 },
  walk: { cadence: 2.2, ref: 60, bob: 1.6, lean: 2 },
  creep: { cadence: 1.2, ref: 45, bob: 1, lean: 4 },
};

const GRAVITY = 2000; // px/s²

interface Chan {
  x: number;
  v: number;
  t: number;
  /** Time (ms) when the pose lets go and the channel eases back to 0. */
  until: number;
}
const chan = (): Chan => ({ x: 0, v: 0, t: 0, until: 0 });
const ATTACK = 0.11;
const RELEASE = 0.3;

/** Everything a rig needs to pose a character this frame. */
export interface Raw {
  /** Scene clock (ms). */
  t: number;
  /** Gait phase in steps (one step = one foot fall); sin(phase·π) alternates feet. */
  phase: number;
  /** 0–1: how strongly the gait is showing (follows the speed). */
  amp: number;
  vx: number;
  /** Body lag behind acceleration (px/s): positive while speeding up in +x. */
  lag: number;
  /** Total lift (hop + bounce) in px, and the hop part alone. */
  lift: number;
  hop: number;
  /** Pose channels: squash (−0.3…1), stretch up (0…0.2), lean (deg), head tilt (deg), tremble amp (deg), arm raise (deg). */
  crouch: number;
  stretch: number;
  lean: number;
  tilt: number;
  shake: number;
  shakeHz: number;
  arm: number;
  speed: number;
  /** −1 / +1: the way it last travelled. */
  dir: number;
  /** −1…1: smoothed facing relative to the art's natural facing (+1 natural, −1 mirrored). */
  facing: number;
  moving: boolean;
  /** A foot just hit the ground (1) this frame, 0 otherwise; `landed` after a hop. */
  footfall: 0 | 1;
  landed: boolean;
}

export class Motion {
  x = 0;
  vx = 0;
  private tx = 0;
  private smooth = 0.4;
  private max = 100;
  private gait: Gait | null = null;
  /** True from `go()` until arrival. */
  moving = false;
  private phase = 0;
  private amp = 0;
  private y = 0;
  private vy = 0;
  private drag = 0;
  private dragV = 0;
  private lean = chan();
  private crouch = chan();
  private stretch = chan();
  private tilt = chan();
  private shake = chan();
  private arm = chan();
  private shakeHz = 22;
  private snipFrom = 0;
  private snipUntil = 0;
  private dir = 1;
  private faceTarget = 1;
  private face = 1;
  private faceV = 0;
  private lastStep = 0;
  raw: Raw = {
    t: 0, phase: 0, amp: 0, vx: 0, lag: 0, lift: 0, hop: 0, crouch: 0, stretch: 0, lean: 0, tilt: 0, shake: 0, shakeHz: 22, arm: 0,
    speed: 0, dir: 1, facing: 1, moving: false, footfall: 0, landed: false,
  };

  /**
   * `room` = free pixels above the sprite (a hop is clamped to it). `natural` = the way the art
   * faces on screen (−1 left, +1 right); travelling the other way mirrors it.
   */
  constructor(
    readonly room = 20,
    readonly natural: 1 | -1 = -1,
  ) {}

  go(to: number, gait: Gait | null, max: number, smooth: number) {
    this.tx = to;
    this.gait = gait;
    this.max = max;
    this.smooth = smooth;
    this.moving = Math.abs(to - this.x) > 0.5;
    if (Math.abs(to - this.x) > 4) this.faceTarget = (to > this.x ? 1 : -1) === this.natural ? 1 : -1;
  }

  /** Jumps to `x` (px offset) carrying `vx`: used when a character is fully out of sight (re-entering from the other side). */
  warp(x: number, vx: number) {
    this.x = x;
    this.vx = vx;
    this.drag = vx;
    this.dragV = 0;
  }

  /** Looks toward screen direction `dir` (−1 left, +1 right); 0 = the layout's own facing. */
  face_(dir: -1 | 0 | 1) {
    this.faceTarget = dir === 0 || dir === this.natural ? 1 : -1;
  }

  hop(height: number) {
    const h = clamp(height, 0, Math.max(0, this.room - 2));
    if (h > 0 && this.y <= 0.01) this.vy = Math.sqrt(2 * GRAVITY * h);
  }

  pose(pose: Pose, amt: number | undefined, dur: number, now: number) {
    const hold = (c: Chan, v: number) => {
      c.t = v;
      c.until = now + dur;
    };
    switch (pose) {
      case "crouch":
        hold(this.crouch, 0.8);
        break;
      case "windup":
        hold(this.crouch, 0.7);
        hold(this.lean, amt ?? -6);
        hold(this.arm, -18);
        break;
      case "lean":
        hold(this.lean, amt ?? 6);
        break;
      case "reach":
        hold(this.lean, amt ?? 7);
        hold(this.stretch, 0.05);
        hold(this.arm, Math.sign(amt ?? 1) * 30);
        break;
      case "tilt":
        hold(this.tilt, amt ?? 12);
        break;
      case "loom":
        hold(this.tilt, amt ?? 12);
        hold(this.stretch, 0.05);
        hold(this.arm, 12);
        break;
      case "recoil":
        hold(this.lean, (amt ?? 8) * 1.4);
        hold(this.stretch, 0.08);
        hold(this.arm, 28);
        break;
      case "boo":
        hold(this.stretch, 0.13);
        hold(this.lean, amt ?? 8);
        hold(this.tilt, (amt ?? 8) * 0.6);
        hold(this.arm, 60);
        break;
      case "snip":
        hold(this.lean, amt ?? 7);
        hold(this.arm, Math.sign(amt ?? 1) * 24);
        this.snipFrom = now;
        this.snipUntil = now + dur;
        break;
      case "shiver":
        hold(this.shake, amt ?? 2);
        this.shakeHz = 24;
        break;
      case "sob":
        hold(this.shake, amt ?? 1.4);
        this.shakeHz = 9;
        hold(this.tilt, 8);
        break;
    }
  }

  /** Drops every pose and sends the companion home (used when a scene is cut short). */
  release() {
    for (const c of [this.lean, this.crouch, this.stretch, this.tilt, this.shake, this.arm]) c.until = 0;
    this.go(0, "walk", 140, 0.25);
    this.faceTarget = 1;
  }

  /** Back to the layout's own facing. */
  resetFacing() {
    this.faceTarget = 1;
  }

  /** At rest at home: no movement, no pose left (what "back to idle" means). */
  get settled(): boolean {
    const quiet = (c: Chan) => Math.abs(c.x) < 0.02 && Math.abs(c.v) < 0.05;
    return (
      Math.abs(this.x) < 0.4 && Math.abs(this.vx) < 4 && this.y <= 0.01 && !this.moving && Math.abs(this.face - this.faceTarget) < 0.02 &&
      [this.lean, this.crouch, this.stretch, this.tilt, this.shake, this.arm].every(quiet)
    );
  }

  update(dt: number, now: number) {
    // Position: smooth, speed-limited, no overshoot.
    [this.x, this.vx] = smoothDamp(this.x, this.tx, this.vx, this.smooth, this.max, dt);
    if (this.moving && Math.abs(this.x - this.tx) < 1 && Math.abs(this.vx) < 12) {
      // Arrived: land softly (a little squash that springs back), no abrupt stop.
      this.x = this.tx;
      this.vx = 0;
      this.moving = false;
      this.gait = null;
      this.crouch.x += 0.22;
    }
    const speed = Math.abs(this.vx);
    if (speed > 6) this.dir = Math.sign(this.vx);
    const g = GAITS[this.gait ?? "walk"];
    const ratio = this.gait ? clamp(speed / g.ref, 0, 1.3) : 0;
    this.amp += (Math.min(1, ratio) - this.amp) * (1 - Math.exp(-dt / 0.09));
    this.phase += dt * g.cadence * ratio;
    const stepNow = Math.floor(this.phase);
    const footfall = stepNow !== this.lastStep && this.amp > 0.35 ? 1 : 0;
    this.lastStep = stepNow;
    const bob = Math.abs(Math.sin(this.phase * Math.PI));

    // Hop: ballistic. Landing kicks the squash channel.
    let landed = false;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        if (this.vy < -120) {
          this.crouch.x += 0.25;
          landed = true;
        }
        this.vy = 0;
      }
    }

    // Pose envelopes (attack while held, release afterwards).
    for (const c of [this.lean, this.crouch, this.stretch, this.tilt, this.shake, this.arm]) {
      const target = now < c.until ? c.t : 0;
      [c.x, c.v] = smoothDamp(c.x, target, c.v, now < c.until ? ATTACK : RELEASE, Infinity, dt);
    }

    // Secondary motion: the body lags behind acceleration (hair, dress, bandages, straw trail).
    [this.drag, this.dragV] = smoothDamp(this.drag, this.vx, this.dragV, 0.14, Infinity, dt);
    // Turning around: a smooth squeeze through the middle, not a pop.
    [this.face, this.faceV] = smoothDamp(this.face, this.faceTarget, this.faceV, 0.12, Infinity, dt);

    this.raw = {
      t: now,
      phase: this.phase,
      amp: this.amp,
      vx: this.vx,
      lag: this.vx - this.drag + this.lean.v * 2.2,
      lift: this.y + g.bob * this.amp * bob,
      hop: this.y,
      crouch: this.crouch.x,
      stretch: this.stretch.x,
      lean: this.lean.x + clamp(this.vx / g.ref, -1, 1) * g.lean,
      tilt: this.tilt.x,
      shake: this.shake.x * Math.sin(now * 0.001 * this.shakeHz * Math.PI * 2),
      shakeHz: this.shakeHz,
      arm: this.arm.x + (now < this.snipUntil ? Math.sin(((now - this.snipFrom) / 1000) * 14 * Math.PI) * 11 : 0),
      speed,
      dir: this.dir,
      facing: this.face,
      moving: this.moving,
      footfall,
      landed,
    };
  }
}
