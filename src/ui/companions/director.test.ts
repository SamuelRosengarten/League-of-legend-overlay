import { describe, expect, it } from "vitest";

import { GAITS, Motion, smoothDamp } from "./director";

const DT = 1 / 60;

/** Runs a Motion for `seconds`, calling `each` every frame. Returns the final time (ms). */
function run(m: Motion, seconds: number, each?: (now: number) => void, from = 0): number {
  let now = from;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    now += DT * 1000;
    m.update(DT, now);
    each?.(now);
  }
  return now;
}

describe("smoothDamp", () => {
  it("approaches the target without overshooting and respects the speed limit", () => {
    let x = 0;
    let v = 0;
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      [x, v] = smoothDamp(x, 100, v, 0.3, 80, DT);
      expect(x).toBeLessThanOrEqual(100.0001);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(x).toBeCloseTo(100, 1);
    expect(peak).toBeLessThanOrEqual(80 * 1.05);
  });
});

describe("Motion: travel", () => {
  it("accelerates and decelerates smoothly (no constant-speed slide, no snap) and arrives exactly", () => {
    const m = new Motion(20);
    m.go(120, "run", 230, 0.2);
    const speeds: number[] = [];
    let last = 0;
    let maxJump = 0;
    run(m, 3, () => {
      speeds.push(Math.abs(m.vx));
      maxJump = Math.max(maxJump, Math.abs(m.x - last));
      last = m.x;
      expect(m.x).toBeLessThanOrEqual(120.0001); // never past the target
    });
    expect(m.x).toBe(120);
    expect(m.moving).toBe(false);
    // Starts from rest, ramps up without a jump, reaches speed, and slows again before arriving.
    const peak = Math.max(...speeds);
    expect(speeds[0]!).toBeLessThan(peak * 0.5);
    for (let i = 1; i < 12; i++) expect(speeds[i]! - speeds[i - 1]!).toBeGreaterThanOrEqual(-0.5); // monotone ramp
    expect(speeds[speeds.length - 30]!).toBeLessThan(peak * 0.5); // decelerates into the stop
    expect(peak).toBeLessThanOrEqual(230 * 1.05);
    // No frame moves more than top speed allows (no teleporting).
    expect(maxJump).toBeLessThanOrEqual(230 * DT * 1.2);
  });

  it("the gait follows the speed: bounce while moving, none at rest", () => {
    const m = new Motion(30);
    m.go(150, "run", 220, 0.2);
    const lifts: number[] = [];
    run(m, 0.9, () => lifts.push(m.out.lift));
    expect(Math.max(...lifts)).toBeGreaterThan(GAITS.run.bob * 0.5); // clearly bouncing
    expect(Math.min(...lifts.slice(10))).toBeLessThan(1.5); // feet come back down each step
    run(m, 3, undefined, 900);
    expect(m.out.lift).toBeCloseTo(0, 1);
    expect(m.out.rot).toBeCloseTo(0, 0);
  });

  it("leans into the direction of travel", () => {
    const mean = (dir: number) => {
      const m = new Motion();
      m.go(dir * 140, "run", 230, 0.2);
      let sum = 0;
      let n = 0;
      run(m, 0.5, () => {
        sum += m.out.rot;
        n++;
      });
      return sum / n;
    };
    expect(mean(1)).toBeGreaterThan(2);
    expect(mean(-1)).toBeLessThan(-2);
  });

  it("trailing secondary motion: the body skews against acceleration", () => {
    const m = new Motion();
    m.go(150, "run", 230, 0.2);
    let maxSkew = 0;
    run(m, 0.5, () => (maxSkew = Math.max(maxSkew, m.out.skew)));
    expect(maxSkew).toBeGreaterThan(1);
  });

  it("Fiddlesticks' arms swing against each other while he strides", () => {
    const m = new Motion();
    m.go(150, "stride", 165, 0.32);
    let armL = 0;
    let armR = 0;
    run(m, 1.6, () => {
      armL = Math.max(armL, Math.abs(m.out.armL));
      armR = Math.max(armR, Math.abs(m.out.armR));
    });
    expect(armL).toBeGreaterThan(10);
    expect(armR).toBeGreaterThan(5);
  });
});

describe("Motion: poses and hops", () => {
  it("a pose eases in, holds, and eases back out by itself", () => {
    const m = new Motion();
    let now = run(m, 0.05);
    m.pose("lean", 8, 500, now);
    const samples: number[] = [];
    now = run(m, 0.3, () => samples.push(m.out.rot), now);
    expect(Math.max(...samples)).toBeGreaterThan(5);
    // Eases in: no jump between consecutive frames.
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThan(2.5);
    now = run(m, 2, undefined, now);
    expect(Math.abs(m.out.rot)).toBeLessThan(0.1);
    expect(m.settled).toBe(true);
  });

  it("anticipation: a windup squashes down before the launch", () => {
    const m = new Motion();
    const now = run(m, 0.05);
    m.pose("windup", -6, 400, now);
    let minSy = 1;
    run(m, 0.4, () => (minSy = Math.min(minSy, m.out.sy)), now);
    expect(minSy).toBeLessThan(0.93);
  });

  it("a hop is ballistic, lands, and is clamped to the headroom above the sprite", () => {
    const m = new Motion(20);
    m.hop(200); // way more than the room
    let peak = 0;
    run(m, 1, () => (peak = Math.max(peak, m.out.lift)));
    expect(peak).toBeLessThanOrEqual(18.6);
    expect(peak).toBeGreaterThan(10);
    expect(m.out.lift).toBeCloseTo(0, 1);
  });

  it("release() sends everything home and the motion settles (no snap): the scene-abort glide", () => {
    const m = new Motion(20);
    let now = 0;
    m.go(100, "run", 230, 0.2);
    now = run(m, 0.5, undefined, now);
    m.pose("shiver", 2, 3000, now);
    m.release();
    let jump = 0;
    let last = m.x;
    now = run(
      m,
      6,
      () => {
        jump = Math.max(jump, Math.abs(m.x - last));
        last = m.x;
      },
      now,
    );
    expect(m.x).toBe(0);
    expect(m.settled).toBe(true);
    expect(jump).toBeLessThan(5); // glided, never teleported
  });
});
