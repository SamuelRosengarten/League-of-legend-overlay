// The animation director: ONE controller owns every scene-driven movement.
//
// Why this exists (what was wrong before): scenes used to flip CSS `data-state` animations on and
// off from independent timers and slide a flat image with fixed-duration tweens. Every state change
// snapped the pose, nothing eased in or out, the "run" bob was unrelated to the speed, and bubbles
// were an afterthought. Here instead:
//
//  - `Motion` is a small physics model (no DOM): position follows a smooth-damped target with a speed
//    limit (natural acceleration / deceleration, no overshoot), a gait phase advances with the speed
//    (so footfalls match the movement), hops are real ballistic jumps, and poses are eased envelopes
//    (anticipation, hold, release) on a few spring channels. A lagging "drag" term skews the body
//    against acceleration, which reads as hair / dress / bandages trailing behind a flat sprite.
//  - `Director` runs a single requestAnimationFrame loop, only while a scene is playing, fires the
//    scene's beats at the right time and writes each Motion's output to the DOM (transforms and CSS
//    variables only). It is the only thing that moves companions during a scene, so nothing competes.
//  - Everything ends at rest at home: after the scene's last beat the director waits for all motion
//    to settle, and an interrupted scene either resets instantly (overlay hidden, layout rebuilt) or
//    glides home (animations switched off while visible).
import type { Gait, Pose, Scene, Step } from "./scenes";
import type { CompanionId } from "./sprites";

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

interface GaitSpec {
  /** Steps per second at the reference speed. */
  cadence: number;
  /** Reference speed (px/s) the gait is designed for. */
  ref: number;
  /** Bounce per step (px), body roll (deg), forward lean at ref speed (deg), landing squash. */
  bob: number;
  roll: number;
  lean: number;
  squash: number;
  /** Fiddlesticks' limbs: arm swing and leg skew (deg). */
  arm: number;
  leg: number;
}
export const GAITS: Record<Gait, GaitSpec> = {
  run: { cadence: 4.6, ref: 200, bob: 9, roll: 2.5, lean: 9, squash: 0.06, arm: 46, leg: 12 },
  waddle: { cadence: 3.2, ref: 100, bob: 4, roll: 8, lean: 3, squash: 0.05, arm: 20, leg: 8 },
  stride: { cadence: 2.1, ref: 150, bob: 5, roll: 3, lean: 8, squash: 0.05, arm: 40, leg: 11 },
  walk: { cadence: 2.3, ref: 60, bob: 2.2, roll: 2, lean: 2, squash: 0.02, arm: 12, leg: 6 },
  creep: { cadence: 1.2, ref: 45, bob: 1.2, roll: 1.5, lean: 4, squash: 0.02, arm: 14, leg: 5 },
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

/** What the DOM needs each frame. */
export interface Output {
  x: number;
  /** Total lift in px (hop + gait bounce). */
  lift: number;
  rot: number;
  skew: number;
  sx: number;
  sy: number;
  /** Fiddlesticks' layers (deg). */
  head: number;
  armL: number;
  armR: number;
  legs: number;
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
  private shakeHz = 22;
  private sob = 0;
  private headLag = 0;
  private headLagV = 0;
  out: Output = { x: 0, lift: 0, rot: 0, skew: 0, sx: 1, sy: 1, head: 0, armL: 0, armR: 0, legs: 0 };

  /** `room` = free pixels above the sprite (a hop is clamped to it). */
  constructor(readonly room = 20) {}

  go(to: number, gait: Gait | null, max: number, smooth: number) {
    this.tx = to;
    this.gait = gait;
    this.max = max;
    this.smooth = smooth;
    this.moving = Math.abs(to - this.x) > 0.5;
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
        break;
      case "lean":
        hold(this.lean, amt ?? 6);
        break;
      case "reach":
        hold(this.lean, amt ?? 7);
        hold(this.stretch, 0.06);
        break;
      case "tilt":
        hold(this.tilt, amt ?? 12);
        break;
      case "loom":
        hold(this.tilt, amt ?? 12);
        hold(this.stretch, 0.05);
        break;
      case "recoil":
        hold(this.lean, (amt ?? 8) * 1.4);
        hold(this.stretch, 0.08);
        break;
      case "boo":
        hold(this.stretch, 0.13);
        hold(this.lean, amt ?? 8);
        hold(this.tilt, (amt ?? 8) * 0.6);
        break;
      case "shiver":
        hold(this.shake, amt ?? 2);
        this.shakeHz = 24;
        break;
      case "sob":
        hold(this.shake, amt ?? 1.4);
        this.shakeHz = 9;
        this.sob = 1;
        break;
    }
  }

  /** Drops every pose and sends the companion home (used when a scene is cut short). */
  release() {
    for (const c of [this.lean, this.crouch, this.stretch, this.tilt, this.shake]) c.until = 0;
    this.sob = 0;
    this.go(0, "walk", 140, 0.25);
  }

  /** At rest at home: no movement, no pose left (what "back to idle" means). */
  get settled(): boolean {
    const quiet = (c: Chan) => Math.abs(c.x) < 0.02 && Math.abs(c.v) < 0.05;
    return (
      Math.abs(this.x) < 0.4 && Math.abs(this.vx) < 4 && this.y <= 0.01 && !this.moving &&
      [this.lean, this.crouch, this.stretch, this.tilt, this.shake].every(quiet)
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
    const g = GAITS[this.gait ?? "walk"];
    const ratio = this.gait ? clamp(speed / g.ref, 0, 1.3) : 0;
    this.amp += (Math.min(1, ratio) - this.amp) * (1 - Math.exp(-dt / 0.09));
    this.phase += dt * g.cadence * ratio;
    const s = Math.sin(this.phase * Math.PI);
    const bob = Math.abs(s);

    // Hop: ballistic. Landing kicks the squash channel.
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        if (this.vy < -120) this.crouch.x += 0.25;
        this.vy = 0;
      }
    }

    // Pose envelopes (attack while held, release afterwards).
    for (const c of [this.lean, this.crouch, this.stretch, this.tilt, this.shake]) {
      const target = now < c.until ? c.t : 0;
      [c.x, c.v] = smoothDamp(c.x, target, c.v, now < c.until ? ATTACK : RELEASE, Infinity, dt);
    }

    // Secondary motion: the body lags behind acceleration (hair, dress, bandages, straw trail).
    [this.drag, this.dragV] = smoothDamp(this.drag, this.vx, this.dragV, 0.14, Infinity, dt);
    const skew = clamp((this.vx - this.drag) * 0.05, -12, 12);

    const fwd = clamp(this.vx / g.ref, -1, 1) * g.lean;
    const shakeOsc = this.shake.x * Math.sin(now * 0.001 * this.shakeHz * Math.PI * 2);
    const sobBob = this.sob && now < this.shake.until ? Math.abs(Math.sin(now * 0.001 * this.shakeHz * Math.PI)) * 1.2 : 0;
    const rot = this.lean.x + fwd + g.roll * this.amp * s + shakeOsc;
    const squash = g.squash * this.amp * (1 - bob);
    const crouch = this.crouch.x;
    const sy = 1 - 0.16 * crouch + this.stretch.x - squash;
    const sx = 1 + 0.08 * crouch - this.stretch.x * 0.4 + squash * 0.5;

    // Fiddlesticks' layers: arms swing against the stride and trail the body, the head lags the
    // body and carries the tilt, the legs scissor.
    [this.headLag, this.headLagV] = smoothDamp(this.headLag, -rot * 0.4, this.headLagV, 0.18, Infinity, dt);
    const swing = g.arm * this.amp * s;
    this.out = {
      x: this.x,
      lift: this.y + g.bob * this.amp * bob + sobBob,
      rot,
      skew,
      sx,
      sy,
      head: this.tilt.x + this.headLag + 2.2 * this.amp * Math.sin(this.phase * Math.PI + 1),
      armL: -swing + skew * 0.9 + this.stretch.x * 380,
      armR: swing * 0.6 + skew * 0.9 - this.stretch.x * 300,
      legs: g.leg * this.amp * s,
    };
  }
}

/** The DOM handles the director moves for one companion. */
export interface PuppetNodes {
  /** `.companion`: horizontal travel. */
  root: HTMLElement;
  /** Wraps the sprite: lift, lean, squash, skew. */
  puppet: HTMLElement;
  /** `.sprite`: carries the --p-* variables for Fiddlesticks' layers. */
  sprite: HTMLElement;
  layered: boolean;
  /** Free pixels above the sprite. */
  room: number;
}

export interface DirectorHost {
  /** False while hidden / paused / not in full motion. */
  lively(): boolean;
  express(who: CompanionId, expr: import("./sprites").Expression, dur: number): void;
  say(who: CompanionId, text: string, dur: number): void;
  fx(who: CompanionId, kind: "snip"): void;
  /** Called every frame after the transforms are written (bubbles follow here). */
  frame(): void;
  /** Called once when a scene has ended and everyone is back to idle. */
  ended(): void;
}

const MAX_SETTLE_MS = 4500;

export class Director {
  private nodes = new Map<CompanionId, PuppetNodes>();
  private motions = new Map<CompanionId, Motion>();
  private scene: Scene | null = null;
  private steps: Step[] = [];
  private next = 0;
  private t = 0;
  private last = 0;
  private raf = 0;
  private winding = false;

  constructor(private host: DirectorHost) {}

  get running(): boolean {
    return this.scene !== null;
  }

  /** Current horizontal offset of a companion (px), for things that follow it (bubbles). */
  offsetOf(who: CompanionId): number {
    return this.motions.get(who)?.x ?? 0;
  }

  /** The layer was rebuilt: forget the old DOM (call before registering the new nodes). */
  clear() {
    this.abort("reset");
    this.nodes.clear();
    this.motions.clear();
  }

  register(who: CompanionId, n: PuppetNodes) {
    this.nodes.set(who, n);
  }

  play(scene: Scene): boolean {
    if (this.scene || !this.host.lively()) return false;
    this.motions.clear();
    for (const [who, n] of this.nodes) this.motions.set(who, new Motion(n.room));
    this.scene = scene;
    this.steps = [...scene.steps].sort((a, b) => a.at - b.at);
    this.next = 0;
    this.t = 0;
    this.winding = false;
    this.last = performance.now();
    for (const w of scene.raise) this.nodes.get(w)?.root.style.setProperty("z-index", "2");
    this.raf = requestAnimationFrame((now) => this.tick(now));
    return true;
  }

  /**
   * Stops the scene. "reset": everything is back to idle at once (used while nobody can see it, or
   * when the DOM is being rebuilt). "glide": everyone eases home first (animations switched off
   * while the overlay is visible).
   */
  abort(mode: "reset" | "glide") {
    if (!this.scene) return;
    if (mode === "reset") return this.finish();
    if (this.winding) return;
    this.winding = true;
    this.next = this.steps.length;
    for (const m of this.motions.values()) m.release();
    this.t = Math.max(this.t, this.scene.duration);
    this.windStart = this.t;
  }
  private windStart = 0;

  private tick(nowAbs: number) {
    if (!this.scene) return;
    const dt = clamp((nowAbs - this.last) / 1000, 0.001, 0.05);
    this.last = nowAbs;
    if (!this.host.lively() && !this.winding) return this.finish(); // hidden / quiet: back to idle now
    this.t += dt * 1000;

    while (this.next < this.steps.length && this.steps[this.next]!.at <= this.t) this.apply(this.steps[this.next++]!);

    // After the last beat, send everyone home once and wait for them to settle.
    if (!this.winding && this.t >= this.scene.duration) {
      this.winding = true;
      this.windStart = this.t;
      for (const m of this.motions.values()) if (Math.abs(m.x) > 0.4) m.go(0, "walk", 80, 0.4);
    }

    let allSettled = true;
    for (const [who, m] of this.motions) {
      m.update(dt, this.t);
      this.write(who, m);
      if (!m.settled) allSettled = false;
    }
    this.host.frame();
    if (this.winding && (allSettled || this.t - this.windStart > MAX_SETTLE_MS)) return this.finish();
    this.raf = requestAnimationFrame((n) => this.tick(n));
  }

  private apply(step: Step) {
    const m = this.motions.get(step.who);
    if (!m) return;
    if ("expr" in step) this.host.express(step.who, step.expr, step.dur);
    else if ("say" in step) this.host.say(step.who, step.say, step.dur);
    else if ("to" in step) m.go(step.to, step.gait, step.max, step.smooth);
    else if ("pose" in step) m.pose(step.pose, step.amt, step.dur, this.t);
    else if ("hop" in step) m.hop(step.hop);
    else if ("fx" in step) this.host.fx(step.who, step.fx);
  }

  private write(who: CompanionId, m: Motion) {
    const n = this.nodes.get(who);
    if (!n) return;
    const o = m.out;
    n.root.style.transform = `translate3d(${o.x.toFixed(2)}px,0,0)`;
    n.puppet.style.transform = `translateY(${(-o.lift).toFixed(2)}px) rotate(${o.rot.toFixed(2)}deg) skewX(${o.skew.toFixed(2)}deg) scale(${o.sx.toFixed(3)},${o.sy.toFixed(3)})`;
    if (n.layered) {
      const s = n.sprite.style;
      s.setProperty("--p-head", `${o.head.toFixed(2)}deg`);
      s.setProperty("--p-armL", `${o.armL.toFixed(2)}deg`);
      s.setProperty("--p-armR", `${o.armR.toFixed(2)}deg`);
      s.setProperty("--p-legs", `${o.legs.toFixed(2)}deg`);
    }
  }

  /** Back to idle: transforms cleared (everyone is at, or invisible and sent to, their home spot). */
  private finish() {
    cancelAnimationFrame(this.raf);
    const had = this.scene;
    this.scene = null;
    this.winding = false;
    for (const n of this.nodes.values()) {
      n.root.style.removeProperty("transform");
      n.root.style.removeProperty("z-index");
      n.puppet.style.removeProperty("transform");
      for (const v of ["--p-head", "--p-armL", "--p-armR", "--p-legs"]) n.sprite.style.removeProperty(v);
    }
    this.motions.clear();
    if (had) this.host.ended();
  }
}
