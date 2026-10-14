import { describe, expect, it } from "vitest";

import { loadCurated } from "../data";
import { type EnemySnapshot, diffNotes } from "./gameNotes";

const data = loadCurated();
const ctx = (me: "Gwen" | "Amumu", laneOpponent: string | null, time = 600) => ({
  me,
  matchups: data.matchups[me]!,
  counters: data.items,
  laneOpponent,
  time,
  name: (id: string) => (id === "LeeSin" ? "Lee Sin" : id),
});
const fiora = (level: number, ...items: [number, string][]): EnemySnapshot => ({
  championId: "Fiora",
  level,
  items: items.map(([id, name]) => ({ id, name })),
});

describe("diffNotes", () => {
  it("notes an item power spike from the curated matchup", () => {
    const notes = diffNotes([fiora(10, [3077, "Tiamat"])], [fiora(11, [3074, "Ravenous Hydra"])], ctx("Gwen", "Fiora", 1310));
    expect(notes).toEqual([
      expect.objectContaining({ key: "Fiora:item:3074", kind: "item-spike", time: 1310, text: expect.stringMatching(/^Fiora finished Ravenous Hydra — /) }),
    ]);
  });

  it("notes counter items relevant to my champion only", () => {
    const jinx = (items: [number, string][]): EnemySnapshot => ({ championId: "Jinx", level: 11, items: items.map(([id, name]) => ({ id, name })) });
    const prev = [jinx([])];
    const cur = [jinx([[3140, "Quicksilver Sash"]])];
    expect(diffNotes(prev, cur, ctx("Amumu", null))[0]).toMatchObject({ kind: "counter-item", text: expect.stringMatching(/^Jinx bought Quicksilver Sash — /) });
    expect(diffNotes(prev, cur, ctx("Gwen", null))).toEqual([]);
  });

  it("notes the lane opponent's level spikes on the transition only", () => {
    expect(diffNotes([fiora(5)], [fiora(6)], ctx("Gwen", "Fiora"))[0]).toMatchObject({ kind: "level-spike", key: "Fiora:level:6" });
    expect(diffNotes([fiora(6)], [fiora(7)], ctx("Gwen", "Fiora"))).toEqual([]);
    // Not the lane opponent → no level notes.
    expect(diffNotes([fiora(5)], [fiora(6)], ctx("Gwen", "Darius"))).toEqual([]);
    // First snapshot mid-game: no level notes (we did not see the transition).
    expect(diffNotes(null, [fiora(9)], ctx("Gwen", "Fiora"))).toEqual([]);
  });

  it("does not repeat items already owned", () => {
    expect(diffNotes([fiora(12, [3074, "Ravenous Hydra"])], [fiora(12, [3074, "Ravenous Hydra"])], ctx("Gwen", "Fiora"))).toEqual([]);
  });
});
