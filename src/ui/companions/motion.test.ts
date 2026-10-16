import { describe, expect, it } from "vitest";

import { GAITS, Motion, smoothDamp } from "./motion";

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
  it("accelerates and brakes smoothly (no constant-speed slide, no snap) and arrives exactly", () => {
    const m = new Motion(20);
    m.go(120, "run", 230, 0.2);
    const speeds: number[] = [];
    let last = 0;
    let maxJump = 0;
    run(m, 3, () => {
      speeds.push(Math.abs(m.vx));
      maxJump = Math.max(maxJump, Math.abs(m.x - last));
      last = m.x;
      expect(m.x).toBeLessThanOrEqual(120.0001);
    });
    expect(m.x).toBe(120);
    expect(m.moving).toBe(false);
    const peak = Math.max(...speeds);
    expect(speeds[0]!).toBeLessThan(peak * 0.5);
    for (let i = 1; i < 12; i++) expect(speeds[i]! - speeds[i - 1]!).toBeGreaterThanOrEqual(-0.5); // monotone ramp
    expect(speeds[speeds.length - 30]!).toBeLessThan(peak * 0.5); // brakes into the stop
    expect(peak).toBeLessThanOrEqual(230 * 1.05);
    expect(maxJump).toBeLessThanOrEqual(230 * DT * 1.2);
  });

  it("the gait follows the speed: bounce and footfalls while moving, none at rest", () => {
    const m = new Motion(30);
    m.go(160, "run", 220, 0.2);
    const lifts: number[] = [];
    let footfalls = 0;
    const end = run(m, 0.9, () => {
      lifts.push(m.raw.lift);
      footfalls += m.raw.footfall;
    });
    expect(Math.max(...lifts)).toBeGreaterThan(GAITS.run.bob * 0.5);
    expect(Math.min(...lifts.slice(10))).toBeLessThan(1.5);
    expect(footfalls).toBeGreaterThanOrEqual(2);
    run(m, 3, undefined, end);
    expect(m.raw.lift).toBeCloseTo(0, 1);
    expect(m.raw.amp).toBeLessThan(0.05);
  });

  it("leans into the direction of travel, and turns smoothly (no pop) when it changes direction", () => {
    const mean = (dir: number) => {
      const m = new Motion();
      m.go(dir * 140, "run", 230, 0.2);
      let sum = 0;
      let n = 0;
      run(m, 0.5, () => {
        sum += m.raw.lean;
        n++;
      });
      return sum / n;
    };
    expect(mean(1)).toBeGreaterThan(2);
    expect(mean(-1)).toBeLessThan(-2);
    // The art faces left: going right mirrors it, through a smooth squeeze.
    const m = new Motion(20, -1);
    m.go(100, "walk", 80, 0.3);
    let prev = m.raw.facing;
    let biggest = 0;
    run(m, 1, () => {
      biggest = Math.max(biggest, Math.abs(m.raw.facing - prev));
      prev = m.raw.facing;
    });
    expect(m.raw.facing).toBeLessThan(-0.95);
    expect(biggest).toBeLessThan(0.4);
  });

  it("the body lags behind acceleration (secondary motion)", () => {
    const m = new Motion();
    m.go(150, "run", 230, 0.2);
    let maxLag = 0;
    run(m, 0.5, () => (maxLag = Math.max(maxLag, m.raw.lag)));
    expect(maxLag).toBeGreaterThan(20);
  });

  it("warp: a character that left one side can re-enter from the other at speed and arrive home", () => {
    const m = new Motion(20);
    m.go(-600, "run", 230, 0.2);
    let now = run(m, 1.2);
    expect(m.x).toBeLessThan(-250);
    m.warp(420, -200);
    m.go(0, "run", 230, 0.2);
    let entrySpeed = 0;
    now = run(
      m,
      0.1,
      () => {
        entrySpeed = Math.max(entrySpeed, m.raw.speed);
      },
      now,
    );
    expect(entrySpeed).toBeGreaterThan(150); // still running on entry, no restart from rest
    run(m, 5, undefined, now);
    expect(m.x).toBe(0);
    expect(m.settled).toBe(true);
  });
});

describe("Motion: poses and hops", () => {
  it("a pose eases in, holds, and eases back out by itself", () => {
    const m = new Motion();
    let now = run(m, 0.05);
    m.pose("lean", 8, 500, now);
    const samples: number[] = [];
    now = run(m, 0.3, () => samples.push(m.raw.lean), now);
    expect(Math.max(...samples)).toBeGreaterThan(5);
    for (let i = 1; i < samples.length; i++) expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThan(2.5);
    now = run(m, 2, undefined, now);
    expect(Math.abs(m.raw.lean)).toBeLessThan(0.1);
    expect(m.settled).toBe(true);
  });

  it("anticipation: a windup squashes down and leans back before the launch", () => {
    const m = new Motion();
    const now = run(m, 0.05);
    m.pose("windup", -6, 400, now);
    let maxCrouch = 0;
    let minLean = 0;
    run(
      m,
      0.4,
      () => {
        maxCrouch = Math.max(maxCrouch, m.raw.crouch);
        minLean = Math.min(minLean, m.raw.lean);
      },
      now,
    );
    expect(maxCrouch).toBeGreaterThan(0.5);
    expect(minLean).toBeLessThan(-3);
  });

  it("a hop is ballistic, lands once with a squash, and is clamped to the headroom", () => {
    const m = new Motion(20);
    m.hop(200);
    let peak = 0;
    let landings = 0;
    run(m, 1, () => {
      peak = Math.max(peak, m.raw.hop);
      if (m.raw.landed) landings++;
    });
    expect(peak).toBeLessThanOrEqual(18.6);
    expect(peak).toBeGreaterThan(10);
    expect(landings).toBe(1);
    expect(m.raw.hop).toBeCloseTo(0, 1);
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
    expect(jump).toBeLessThan(5);
  });
});
