// The animation director: ONE controller owns every movement of the companions.
//
// Every companion has a `Motion` (motion.ts: position, gait phase, pose channels). The director
// advances them all in a single requestAnimationFrame loop, fires a scene's beats on the shared clock,
// and hands each companion's state to its own `apply()` (rig-pose.ts turns it into bone angles for the
// skinned painting, or into layer rotations for Fiddlesticks). Nothing else moves companions, so
// nothing competes for a transform.
//
//  - The loop runs only while the overlay is lively (visible, motion "full"). It idles at ~30 fps
//    (hair, ribbons, tail and cloak keep swaying a little) and runs at full rate during a scene.
//  - Everything ends at rest at home: after the scene's last beat the director waits for all motion to
//    settle; an interrupted scene either resets instantly (overlay hidden, layout rebuilt) or glides
//    home (animations switched off while visible).
import { Motion, type Raw } from "./motion";
import type { Scene, Step } from "./scenes";
import type { CompanionId, Expression } from "./sprites";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The DOM / GL handles the director drives for one companion. */
export interface PuppetNodes {
  /** `.companion`: horizontal travel. */
  root: HTMLElement;
  /** Free pixels above the sprite (a hop is clamped to it). */
  room: number;
  /** The way the art faces on screen (−1 left, +1 right). */
  natural: 1 | -1;
  /** Poses the character for this frame. */
  apply(raw: Raw): void;
  /** The loop started (true) or stopped (false): show / hide the animated drawing. */
  activate(on: boolean): void;
}

export interface DirectorHost {
  /** False while hidden / paused / not in full motion. */
  lively(): boolean;
  express(who: CompanionId, expr: Expression, dur: number): void;
  say(who: CompanionId, text: string, dur: number): void;
  fx(who: CompanionId, kind: "snip" | "dust"): void;
  /** Called every frame after the poses are applied (bubbles follow here). */
  frame(): void;
  /** Called once when a scene has ended and everyone is back to idle. */
  ended(): void;
}

const MAX_SETTLE_MS = 4500;
/** Idle redraw interval (ms): ~30 fps is plenty for a gentle sway. */
const IDLE_FRAME_MS = 33;

export class Director {
  private nodes = new Map<CompanionId, PuppetNodes>();
  private motions = new Map<CompanionId, Motion>();
  private scene: Scene | null = null;
  private steps: Step[] = [];
  private next = 0;
  private clock = 0;
  private sceneStart = 0;
  private last = 0;
  private lastDraw = 0;
  private raf = 0;
  private active = false;
  private winding = false;
  private windStart = 0;

  constructor(private host: DirectorHost) {}

  get running(): boolean {
    return this.scene !== null;
  }

  /** Current horizontal offset of a companion (px), for things that follow it (bubbles). */
  offsetOf(who: CompanionId): number {
    return this.motions.get(who)?.x ?? 0;
  }

  /** Current horizontal velocity (px/s). */
  velocityOf(who: CompanionId): number {
    return this.motions.get(who)?.vx ?? 0;
  }

  /** The layer was rebuilt: forget the old DOM (call before registering the new nodes). */
  clear() {
    this.abort("reset");
    this.stopLoop();
    this.nodes.clear();
    this.motions.clear();
  }

  register(who: CompanionId, n: PuppetNodes) {
    this.nodes.set(who, n);
    this.motions.set(who, new Motion(n.room, n.natural));
  }

  /** Called whenever the overlay's state may have changed (visible, motion level …). */
  sync(lively: boolean) {
    if (lively && !this.active && this.nodes.size) this.startLoop();
    else if (!lively && this.active) {
      if (this.scene) this.finish(); // hidden / quiet: back to idle at once
      this.stopLoop();
    }
  }

  private startLoop() {
    this.active = true;
    for (const n of this.nodes.values()) n.activate(true);
    this.last = performance.now();
    this.lastDraw = 0;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private stopLoop() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    for (const n of this.nodes.values()) n.activate(false);
  }

  play(scene: Scene): boolean {
    if (this.scene || !this.active || !this.host.lively()) return false;
    this.scene = scene;
    this.steps = [...scene.steps].sort((a, b) => a.at - b.at);
    this.next = 0;
    this.sceneStart = this.clock;
    this.winding = false;
    for (const w of scene.raise) this.nodes.get(w)?.root.style.setProperty("z-index", "2");
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
    this.windStart = this.clock;
  }

  private tick(nowAbs: number) {
    if (!this.active) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
    const elapsed = nowAbs - this.last;
    // Idle: ~30 fps. Scenes: every frame.
    if (!this.scene && nowAbs - this.lastDraw < IDLE_FRAME_MS) return;
    const dt = clamp(elapsed / 1000, 0.001, 0.05);
    this.last = nowAbs;
    this.lastDraw = nowAbs;
    this.clock += dt * 1000;

    if (this.scene) {
      const t = this.clock - this.sceneStart;
      while (this.next < this.steps.length && this.steps[this.next]!.at <= t) this.apply(this.steps[this.next++]!);
      // After the last beat, send everyone home once and wait for them to settle.
      if (!this.winding && t >= this.scene.duration) {
        this.winding = true;
        this.windStart = this.clock;
        for (const m of this.motions.values()) {
          m.resetFacing();
          if (Math.abs(m.x) > 0.4) m.go(0, "walk", 80, 0.4);
        }
      }
    }

    let allSettled = true;
    for (const [who, m] of this.motions) {
      m.update(dt, this.clock);
      const n = this.nodes.get(who);
      if (n) {
        n.root.style.transform = `translate3d(${m.x.toFixed(2)}px,0,0)`;
        n.root.style.setProperty("--lift", `${m.raw.lift.toFixed(1)}`);
        n.apply(m.raw);
      }
      if (m.raw.footfall && m.raw.speed > 90) this.host.fx(who, "dust");
      if (m.raw.landed) this.host.fx(who, "dust");
      if (!m.settled) allSettled = false;
    }
    this.host.frame();
    if (this.scene && this.winding && (allSettled || this.clock - this.windStart > MAX_SETTLE_MS)) this.finish();
  }

  private apply(step: Step) {
    const m = this.motions.get(step.who);
    if (!m) return;
    if ("expr" in step) this.host.express(step.who, step.expr, step.dur);
    else if ("say" in step) this.host.say(step.who, step.say, step.dur);
    else if ("warp" in step) m.warp(step.warp, step.vx);
    else if ("to" in step) m.go(step.to, step.gait, step.max, step.smooth);
    else if ("pose" in step) m.pose(step.pose, step.amt, step.dur, this.clock);
    else if ("hop" in step) m.hop(step.hop);
    else if ("face" in step) m.face_(step.face);
    else if ("fx" in step) this.host.fx(step.who, step.fx);
  }

  /** Back to idle: the scene is over (everyone is home, or invisible and about to be). */
  private finish() {
    const had = this.scene;
    this.scene = null;
    this.winding = false;
    for (const n of this.nodes.values()) {
      n.root.style.removeProperty("z-index");
      if (!this.active) n.root.style.removeProperty("transform");
    }
    for (const [who, m] of this.motions) {
      // Invisible or interrupted: reset to a clean idle motion at home.
      const n = this.nodes.get(who);
      if (n) this.motions.set(who, new Motion(n.room, n.natural));
      n?.root.style.setProperty("transform", "translate3d(0px,0,0)");
      void m;
    }
    if (had) this.host.ended();
  }
}
