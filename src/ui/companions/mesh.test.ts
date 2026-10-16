import { describe, expect, it } from "vitest";

import { IDENTITY, buildMesh, compose, regionWeight, skin, worldMatrices } from "./mesh-core";
import type { Raw } from "./motion";
import { poseAmumu, poseFiddle, poseGwen } from "./rig-pose";
import { AMUMU_RIG, GWEN_RIG } from "./rigs";

const raw = (over: Partial<Raw> = {}): Raw => ({
  t: 0, phase: 0, amp: 0, vx: 0, lag: 0, lift: 0, hop: 0, crouch: 0, stretch: 0, lean: 0, tilt: 0, shake: 0, shakeHz: 22, arm: 0,
  speed: 0, dir: -1, facing: 1, moving: false, footfall: 0, landed: false, ...over,
});

describe("mesh skinning", () => {
  it("composes affine matrices in the right order", () => {
    const rotate90: [number, number, number, number, number, number] = [0, 1, -1, 0, 0, 0];
    const shift: [number, number, number, number, number, number] = [1, 0, 0, 1, 10, 0];
    // compose(m, n) = m after n: shift then rotate: (1,0) -> (11,0) -> (0,11)
    const p = compose(rotate90, shift);
    expect([p[0] * 1 + p[2] * 0 + p[4], p[1] * 1 + p[3] * 0 + p[5]]).toEqual([0, 11]);
    expect(compose(IDENTITY, shift)).toEqual(shift);
  });

  for (const [name, rig] of [["gwen", GWEN_RIG], ["amumu", AMUMU_RIG]] as const) {
    describe(name, () => {
      const mesh = buildMesh(rig);
      it("bones are ordered parent-first and the base bone exists", () => {
        rig.bones.forEach((b, i) => expect(b.parent).toBeLessThan(i));
        expect(rig.bones.some((b) => b.name === rig.base)).toBe(true);
      });

      it("every vertex has weights that sum to 1", () => {
        for (let v = 0; v < mesh.rest.length / 2; v++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += mesh.weights[v * 4 + k]!;
          expect(sum).toBeCloseTo(1, 4);
        }
      });

      it("the rest pose reproduces the original painting exactly", () => {
        const world = worldMatrices(rig.bones, rig.bones.map(() => undefined));
        const out = new Float32Array(mesh.rest.length);
        skin(mesh, world, out);
        for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(mesh.rest[i]!, 3);
      });

      it("a bone's rotation moves only the parts it owns", () => {
        const idx = rig.bones.findIndex((b) => b.name === rig.bones[rig.bones.length - 1]!.name);
        const poses = rig.bones.map((_, i) => (i === idx ? { rot: 30 } : undefined));
        const out = new Float32Array(mesh.rest.length);
        skin(mesh, worldMatrices(rig.bones, poses), out);
        let moved = 0;
        let still = 0;
        for (let v = 0; v < out.length / 2; v++) (Math.hypot(out[v * 2]! - mesh.rest[v * 2]!, out[v * 2 + 1]! - mesh.rest[v * 2 + 1]!) > 0.5 ? moved++ : still++);
        expect(moved).toBeGreaterThan(10);
        expect(still).toBeGreaterThan(moved); // the rest of the painting stays put
      });

      it("region weights fade smoothly from 1 in the core to 0 at the edge", () => {
        const r = rig.regions[0]!;
        expect(regionWeight(r, r.cx, r.cy)).toBe(1);
        expect(regionWeight(r, r.cx + r.rx, r.cy)).toBe(0);
        const mid = regionWeight(r, r.cx + r.rx * 0.75, r.cy);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);
      });
    });
  }
});

describe("rig animators", () => {
  const all = (poses: ReturnType<typeof poseGwen>) => poses.flatMap((p) => [p.rot ?? 0, p.sx ?? 1, p.sy ?? 1, p.tx ?? 0, p.ty ?? 0]);

  it("poses are finite and the rest pose is calm (only a gentle idle sway)", () => {
    for (const fn of [poseGwen, poseAmumu]) {
      const rest = fn(raw(), 4.9);
      expect(all(rest).every(Number.isFinite)).toBe(true);
      for (const p of rest) {
        expect(Math.abs(p.rot ?? 0)).toBeLessThan(5);
        expect(Math.abs((p.sx ?? 1) - 1)).toBeLessThan(0.03);
        expect(Math.abs((p.sy ?? 1) - 1)).toBeLessThan(0.03);
      }
    }
  });

  it("running alternates the legs, swings the arm against them and trails the hair", () => {
    const names = GWEN_RIG.bones.map((b) => b.name);
    const at = (phase: number, over: Partial<Raw> = {}) => {
      const p = poseGwen(raw({ phase, amp: 1, vx: -200, lag: 60, lift: 4, moving: true, ...over }), 4.9);
      const get = (n: string) => p[names.indexOf(n)]!;
      return { legL: get("legL").rot!, legR: get("legR").rot!, hair: get("hairL").rot!, scissors: get("scissors").rot! };
    };
    const a = at(0.5);
    const b = at(1.5);
    expect(Math.sign(a.legL)).toBe(-Math.sign(a.legR)); // feet alternate
    expect(Math.sign(a.legL)).toBe(-Math.sign(b.legL)); // and swap on the next step
    expect(Math.abs(a.legL)).toBeGreaterThan(20);
    expect(Math.sign(a.scissors - at(0).scissors)).not.toBe(0);
    // Hair trails while accelerating, and the trailing mirrors with the character.
    expect(at(0, { lag: 80 }).hair).toBeGreaterThan(at(0, { lag: 0 }).hair);
    expect(at(0, { lag: 80, facing: -1 }).hair).toBeLessThan(at(0, { lag: 0, facing: -1 }).hair);
  });

  it("a hop tucks the legs, a crouch squashes about the feet (they stay planted)", () => {
    const names = AMUMU_RIG.bones.map((b) => b.name);
    const air = poseAmumu(raw({ hop: 12, lift: 12 }), 4.2);
    expect(air[names.indexOf("legL")]!.ty!).toBeLessThan(-5);
    const squash = poseAmumu(raw({ crouch: 0.8 }), 4.2);
    const root = squash[0]!;
    expect(root.sy!).toBeLessThan(0.92);
    // Pivot at y=405, ground 414: scaling sy about the pivot raises the feet by (1-sy)*9; ty cancels it.
    expect(root.ty!).toBeGreaterThan(0);
  });

  it("Fiddlesticks: legs scissor, arms swing, the cloak flutters, and the head carries the tilt", () => {
    const run = poseFiddle(raw({ phase: 0.5, amp: 1, vx: 160, lag: 50, lift: 3, moving: true, tilt: 10 }));
    expect(Math.abs(run.legL)).toBeGreaterThan(15);
    expect(Math.sign(run.legL)).toBe(-Math.sign(run.legR));
    expect(Math.abs(run.armL)).toBeGreaterThan(10);
    expect(run.body).not.toBe(0);
    expect(poseFiddle(raw({ tilt: 12 })).head).toBeGreaterThan(8);
    expect(poseFiddle(raw({ arm: 60 })).armL).toBeGreaterThan(40); // "BOO": arms fly up
  });
});
