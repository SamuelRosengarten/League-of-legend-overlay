import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE } from "../../theme/appearance";
import { layoutCompanions } from "./layout";
import { SCENE_IDS, eligibleScenes, planScene } from "./scenes";
import type { Cast, Step } from "./scenes";

function castFor(placement: string, width: number, compact = true): Cast[] {
  const { placed } = layoutCompanions({ ...DEFAULT_APPEARANCE.companions, placement }, width, { compact });
  return placed.filter((p) => p.spot.pose === "perch").map((p) => ({ who: p.who, left: p.left, width: p.width }));
}

type Go = Extract<Step, { to: number }>;
const goes = (steps: Step[], who?: string) => steps.filter((s): s is Go => "to" in s && (!who || s.who === who)).sort((a, b) => a.at - b.at);

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
        it(`${id} on "${placement}" @${width}: stays inside the window, every beat is well-formed, ends at home`, () => {
          const scene = planScene(id, cast, width)!;
          const home = new Map(cast.map((c) => [c.who, c]));
          for (const step of scene.steps) {
            expect(step.at).toBeGreaterThanOrEqual(0);
            expect(step.at).toBeLessThan(scene.duration);
            expect(home.has(step.who), "only companions on the border take part").toBe(true);
            if ("to" in step) {
              const c = home.get(step.who)!;
              expect(step.max).toBeGreaterThan(0);
              expect(step.smooth).toBeGreaterThan(0);
              if (step.to !== 0) {
                // Away from home they keep a margin from the wall (room to lean and hop).
                expect(c.left + step.to, "left edge").toBeGreaterThanOrEqual(Math.min(c.left, 5.999));
                expect(c.left + step.to + c.width, "right edge").toBeLessThanOrEqual(Math.max(c.left + c.width, width - 5.999));
              }
            }
            if ("pose" in step || "expr" in step || "say" in step) expect((step as { dur: number }).dur).toBeGreaterThan(0);
            // Bubbles stay brief and readable.
            if ("say" in step) expect(step.say.length).toBeLessThanOrEqual(5);
          }
          // Whoever travelled is sent back home with their last move.
          for (const who of new Set(goes(scene.steps).map((s) => s.who))) {
            const moves = goes(scene.steps, who);
            expect(moves[moves.length - 1]!.to, `${who} ends at home`).toBe(0);
          }
        });
      }
    }
  }

  it("travel uses the right gaits (Gwen runs, Amumu waddles, Fiddlesticks strides) with natural speeds", () => {
    const scene = planScene("chase", castFor("top", 460, false), 460)!;
    const first = (who: string) => goes(scene.steps, who).find((s) => s.to !== 0)!;
    expect(first("gwen").gait).toBe("run");
    expect(first("amumu").gait).toBe("waddle");
    expect(first("fiddlesticks").gait).toBe("stride");
    // He is a bit slower than Gwen, so the chase reads as a chase.
    expect(first("fiddlesticks").max).toBeLessThan(first("gwen").max);
  });

  it("chase has anticipation before every launch", () => {
    const scene = planScene("chase", castFor("top", 460, false), 460)!;
    for (const who of ["gwen", "amumu", "fiddlesticks"]) {
      const launch = goes(scene.steps, who).find((s) => s.to !== 0)!;
      const wind = scene.steps.find((s) => "pose" in s && s.who === who && s.pose === "windup" && s.at < launch.at && s.at + s.dur >= launch.at - 400);
      expect(wind, `${who} crouches before running`).toBeTruthy();
    }
  });

  it("chase uses the whole border: he charges to the far wall while the prey dash the other way, then he charges back", () => {
    for (const [placement, width] of [["top", 320], ["top", 460], ["left", 320], ["right", 380]] as const) {
      const cast = castFor(placement, width, false);
      const scene = planScene("chase", cast, width)!;
      const f = cast.find((c) => c.who === "fiddlesticks")!;
      const fMoves = goes(scene.steps, "fiddlesticks").filter((s) => s.to !== 0);
      // First charge crosses (nearly) the whole border toward the far wall.
      const first = fMoves[0]!;
      const towardFar = Math.sign(first.to);
      expect(Math.abs(first.to), `${placement}@${width}: long first charge`).toBeGreaterThan((width - f.width) * 0.5);
      // Prey run the opposite way (toward the wall he started from).
      for (const m of goes(scene.steps).filter((s) => s.to !== 0 && s.who !== "fiddlesticks")) {
        expect(Math.sign(m.to), `${m.who} dashes the other way`).toBe(-towardFar);
        expect(Math.abs(m.to)).toBeGreaterThan(30);
      }
      // He turns back with a second, shorter-or-equal charge (after a crouch).
      expect(fMoves.length).toBeGreaterThanOrEqual(2);
      const second = fMoves[1]!;
      expect(Math.sign(second.to - first.to), "second charge goes back toward the prey").toBe(-towardFar);
      const wind = scene.steps.find((s) => "pose" in s && s.who === "fiddlesticks" && s.pose === "windup" && s.at < second.at && s.at + s.dur >= second.at - 900);
      expect(wind, "he crouches before charging back").toBeTruthy();
    }
    const scene = planScene("chase", castFor("top", 460, false), 460)!;
    expect(scene.raise).toEqual(expect.arrayContaining(["gwen", "amumu"])); // they pass in front of him
  });

  for (const placement of ["top", "left", "right"]) {
    for (const width of [320, 460]) {
      it(`snip / scare on "${placement}" @${width}: faces stay clear when they meet, and Amumu never jumps into a neighbour`, () => {
        const cast = castFor(placement, width);
        const box = (who: string, to = 0) => {
          const c = cast.find((x) => x.who === who)!;
          return { l: c.left + to, r: c.left + to + c.width };
        };
        const gap = (a: { l: number; r: number }, b: { l: number; r: number }) => Math.max(a.l - b.r, b.l - a.r);
        for (const id of ["snip", "scare"] as const) {
          const scene = planScene(id, cast, width)!;
          // Gwen's spot when she is next to Amumu: her walk target, or home when she just leans in.
          const toGwen = goes(scene.steps, "gwen").find((s) => s.to !== 0);
          const g = box("gwen", toGwen?.to ?? 0);
          expect(gap(g, box("amumu")), `${id}: Gwen clear of Amumu`).toBeGreaterThanOrEqual(5);
          // Amumu's hop away (recoil / scare) leaves a visible gap to whoever is on that side.
          for (const m of goes(scene.steps, "amumu").filter((s) => s.to !== 0 && s.gait === null)) {
            const a = box("amumu", m.to);
            for (const other of cast.filter((c) => c.who !== "amumu")) {
              const o = { l: other.left, r: other.left + other.width };
              expect(gap(a, o), `${id}: Amumu clear of ${other.who} after the recoil`).toBeGreaterThanOrEqual(2.5);
            }
          }
        }
      });
    }
  }
});
