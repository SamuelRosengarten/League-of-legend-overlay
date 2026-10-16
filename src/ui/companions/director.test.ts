import { describe, expect, it } from "vitest";

import { Director, type DirectorHost, type PuppetNodes } from "./director";
import type { Raw } from "./motion";
import type { Scene } from "./scenes";

function setup() {
  const seen: Raw[] = [];
  const style = new Map<string, string>();
  const root = { style: { transform: "", setProperty: (k: string, v: string) => style.set(k, v), removeProperty: (k: string) => style.delete(k) } } as unknown as HTMLElement;
  const node: PuppetNodes = { root, room: 20, natural: -1, apply: (r) => seen.push(r), activate: () => {} };
  const log: string[] = [];
  const host: DirectorHost = { lively: () => true, express: () => {}, say: () => {}, fx: () => {}, frame: () => {}, ended: () => log.push("ended") };
  const d = new Director(host);
  d.register("gwen", node);
  return { d, seen, log };
}

describe("Director", () => {
  it("applies a `face` beat: the character turns through a smooth squeeze", async () => {
    let now = 0;
    const raf: FrameRequestCallback[] = [];
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => (raf.push(cb), raf.length);
    (globalThis as any).cancelAnimationFrame = () => {};
    const { d, seen } = setup();
    d.sync(true);
    const scene: Scene = { id: "snip", duration: 1500, raise: [], steps: [{ at: 100, who: "gwen", face: 1 }, { at: 1200, who: "gwen", face: 0 }] };
    expect(d.play(scene)).toBe(true);
    for (let i = 0; i < 160; i++) {
      now += 16.7;
      const cbs = raf.splice(0);
      cbs.forEach((cb) => cb(now));
    }
    const facings = seen.map((r) => r.facing);
    expect(Math.min(...facings)).toBeLessThan(-0.9); // it really turned around
    const steps = facings.slice(1).map((f, i) => Math.abs(f - facings[i]!));
    expect(Math.max(...steps)).toBeLessThan(0.35); // smoothly, never a pop
    expect(facings[facings.length - 1]!).toBeGreaterThan(0.95); // and turned back
  });
});
