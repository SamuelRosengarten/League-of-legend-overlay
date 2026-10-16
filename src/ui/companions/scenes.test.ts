import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE } from "../../theme/appearance";
import { layoutCompanions } from "./layout";
import { Motion } from "./motion";
import { SCENE_IDS, eligibleScenes, planScene } from "./scenes";
import type { Cast, Scene, Step } from "./scenes";

function castFor(placement: string, width: number, compact = true): Cast[] {
  const { placed } = layoutCompanions({ ...DEFAULT_APPEARANCE.companions, placement }, width, { compact });
  return placed.filter((p) => p.spot.pose === "perch").map((p) => ({ who: p.who, left: p.left, width: p.width }));
}

type Go = Extract<Step, { to: number }>;
type Warp = Extract<Step, { warp: number }>;
const goes = (steps: Step[], who?: string) => steps.filter((s): s is Go => "to" in s && (!who || s.who === who)).sort((a, b) => a.at - b.at);
const warps = (steps: Step[], who?: string) => steps.filter((s): s is Warp => "warp" in s && (!who || s.who === who)).sort((a, b) => a.at - b.at);

/** Plays a scene's travel through the real motion model; reports collisions between visible companions. */
function simulate(scene: Scene, cast: Cast[], width: number) {
  const motions = new Map(cast.map((c) => [c.who, new Motion(20)]));
  const steps = [...scene.steps].sort((a, b) => a.at - b.at);
  const DT = 1 / 60;
  let next = 0;
  let worst = Infinity; // smallest gap between any two visible companions (negative = overlap)
  let who = "";
  let maxEnd = 0;
  for (let t = 0; t < scene.duration + 6000; t += DT * 1000) {
    while (next < steps.length && steps[next]!.at <= t) {
      const s = steps[next++]!;
      const m = motions.get(s.who)!;
      if ("to" in s) m.go(s.to, s.gait, s.max, s.smooth);
      else if ("warp" in s) m.warp(s.warp, s.vx);
    }
    for (const m of motions.values()) m.update(DT, t);
    const boxes = cast.map((c) => ({ who: c.who, l: c.left + motions.get(c.who)!.x, r: c.left + motions.get(c.who)!.x + c.width }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const visible = (x: { l: number; r: number }) => x.r > 0 && x.l < width;
        if (!visible(a) || !visible(b)) continue;
        const gap = Math.max(a.l - b.r, b.l - a.r);
        if (gap < worst) {
          worst = gap;
          who = `${a.who}/${b.who}@${Math.round(t)}ms`;
        }
      }
    }
    if ([...motions.values()].every((m) => m.settled) && t > scene.duration) {
      maxEnd = t;
      break;
    }
  }
  return { worst, who, settledAt: maxEnd, motions };
}

describe("scene planning", () => {
  it("only offers scenes whose cast is on the border", () => {
    expect(eligibleScenes(castFor("top", 320))).toEqual(SCENE_IDS);
    // Default preset: Amumu hangs below, so only the scene with Gwen + Fiddlesticks is left.
    expect(eligibleScenes(castFor("corners", 320))).toEqual(["chase"]);
    expect(eligibleScenes([])).toEqual([]);
    expect(planScene("snip", castFor("corners", 320), 320)).toBeNull();
  });

  for (const placement of ["top", "left", "right", "corners"]) {
    for (const width of [300, 320, 380, 460]) {
      for (const id of SCENE_IDS) {
        const cast = castFor(placement, width);
        if (!eligibleScenes(cast).includes(id)) continue;
        describe(`${id} on "${placement}" @${width}`, () => {
          const scene = planScene(id, cast, width)!;
          const home = new Map(cast.map((c) => [c.who, c]));

          it("every beat is well-formed and inside the scene", () => {
            for (const step of scene.steps) {
              expect(step.at).toBeGreaterThanOrEqual(0);
              expect(step.at).toBeLessThan(scene.duration);
              expect(home.has(step.who), "only companions on the border take part").toBe(true);
              if ("to" in step) {
                expect(step.max).toBeGreaterThan(0);
                expect(step.smooth).toBeGreaterThan(0);
              }
              if ("pose" in step || "expr" in step || "say" in step) expect((step as { dur: number }).dur).toBeGreaterThan(0);
              if ("say" in step) expect(step.say.length).toBeLessThanOrEqual(5); // brief, readable bubbles
            }
          });

          it("nobody passes through anybody, and everyone ends home at rest", () => {
            const sim = simulate(scene, cast, width);
            expect(sim.worst, `closest approach ${sim.who}`).toBeGreaterThanOrEqual(-3);
            for (const m of sim.motions.values()) {
              expect(m.x).toBe(0);
              expect(m.settled).toBe(true);
            }
            expect(sim.settledAt).toBeGreaterThan(0); // it did finish
          });

          it("a character that leaves the window re-enters from the opposite side and goes home", () => {
            for (const c of cast) {
              const moves = goes(scene.steps, c.who);
              const exit = moves.find((m) => c.left + m.to + c.width < 0 || c.left + m.to > width);
              if (!exit) continue;
              const side = c.left + exit.to + c.width < 0 ? -1 : 1;
              const w = warps(scene.steps, c.who);
              expect(w.length, `${c.who} re-enters`).toBe(1);
              const entered = c.left + w[0]!.warp;
              // Appears fully outside the window on the other side...
              expect(side < 0 ? entered >= width : entered + c.width <= 0).toBe(true);
              // ...already running the same way it left, then runs home.
              expect(Math.sign(w[0]!.vx)).toBe(side);
              expect(w[0]!.at).toBeGreaterThan(exit.at);
              expect(moves[moves.length - 1]!.to).toBe(0);
            }
            // Whoever travelled ends at home.
            for (const who of new Set(goes(scene.steps).map((s) => s.who))) {
              const moves = goes(scene.steps, who);
              expect(moves[moves.length - 1]!.to, `${who} ends at home`).toBe(0);
            }
          });
        });
      }
    }
  }

  it("chase: travel uses the right gaits and Fiddlesticks is a bit slower than Gwen", () => {
    const scene = planScene("chase", castFor("top", 460, false), 460)!;
    const first = (who: string) => goes(scene.steps, who).find((s) => s.to !== 0)!;
    expect(first("gwen").gait).toBe("run");
    expect(first("amumu").gait).toBe("waddle");
    expect(first("fiddlesticks").gait).toBe("stride");
    expect(first("fiddlesticks").max).toBeLessThan(first("gwen").max);
  });

  it("chase: every launch has an anticipation crouch, and the strip is empty before anyone re-enters", () => {
    const scene = planScene("chase", castFor("top", 460, false), 460)!;
    for (const who of ["gwen", "amumu", "fiddlesticks"]) {
      const launch = goes(scene.steps, who).find((s) => s.to !== 0)!;
      const wind = scene.steps.find((s) => "pose" in s && s.who === who && s.pose === "windup" && s.at < launch.at && s.at + s.dur >= launch.at - 400);
      expect(wind, `${who} crouches before running`).toBeTruthy();
    }
    // He leaves last and returns last (so the others are not run over).
    const exits = ["gwen", "amumu", "fiddlesticks"].map((w) => goes(scene.steps, w).find((s) => s.to !== 0)!.at);
    const enters = ["gwen", "amumu", "fiddlesticks"].map((w) => warps(scene.steps, w)[0]!.at);
    expect(Math.min(...enters)).toBeGreaterThan(Math.max(...exits));
    expect(enters[2]).toBeGreaterThan(Math.max(enters[0]!, enters[1]!));
  });

  it("snip: Gwen turns to face Amumu, reaches, then snips with the scissors", () => {
    const scene = planScene("snip", castFor("top", 460, false), 460)!;
    const face = scene.steps.find((s) => "face" in s && s.who === "gwen")!;
    const reach = scene.steps.find((s) => "pose" in s && s.who === "gwen" && s.pose === "reach")!;
    const snip = scene.steps.find((s) => "pose" in s && s.who === "gwen" && s.pose === "snip")!;
    expect((face as { face: number }).face).toBe(1); // Amumu is on her right
    expect(face.at).toBeLessThan(reach.at);
    expect(reach.at).toBeLessThan(snip.at);
    expect(scene.steps.filter((s) => "fx" in s).length).toBeGreaterThanOrEqual(2);
    // Amumu answers the scissors with a recoil hop after the snips.
    const hop = scene.steps.find((s) => "hop" in s && s.who === "amumu")!;
    expect(hop.at).toBeGreaterThan(snip.at);
  });

  it("scare: crouch (anticipation), a held beat, then BOO and Amumu cries", () => {
    const scene = planScene("scare", castFor("top", 460, false), 460)!;
    const wind = scene.steps.find((s) => "pose" in s && s.who === "fiddlesticks" && s.pose === "windup")!;
    const boo = scene.steps.find((s) => "pose" in s && s.who === "fiddlesticks" && s.pose === "boo")!;
    expect(boo.at - wind.at).toBeGreaterThanOrEqual(600); // the beat held before the scare
    const cry = scene.steps.find((s) => "expr" in s && s.who === "amumu" && s.expr === "cry")!;
    expect(cry.at).toBeGreaterThan(boo.at);
  });
});
