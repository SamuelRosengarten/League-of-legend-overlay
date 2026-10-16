// Rig definitions for the painted companions (Gwen, Amumu): bones, pivots and the soft regions that
// say which part of the painting follows which bone. Coordinates are pixels of the art
// (gwen.png 414×480, amumu.png 358×420). See mesh-core.ts for how they are used and
// rig-pose.ts for how the animation drives the bones.
import type { RigDef } from "./mesh-core";

export const GWEN_RIG: RigDef = {
  width: 414,
  height: 480,
  margin: 60,
  cols: 30,
  rows: 36,
  base: "torso",
  bones: [
    { name: "root", parent: -1, pivot: [225, 400] },
    { name: "torso", parent: 0, pivot: [235, 385] },
    { name: "head", parent: 1, pivot: [225, 228] },
    { name: "hairL", parent: 2, pivot: [175, 115] },
    { name: "hairR", parent: 2, pivot: [290, 105] },
    { name: "ribbonL", parent: 1, pivot: [150, 305] },
    { name: "ribbonR", parent: 1, pivot: [325, 290] },
    { name: "skirt", parent: 1, pivot: [245, 318] },
    { name: "legL", parent: 0, pivot: [214, 398] },
    { name: "legR", parent: 0, pivot: [242, 398] },
    { name: "scissors", parent: 1, pivot: [185, 252] },
  ],
  regions: [
    { bone: "head", cx: 228, cy: 140, rx: 118, ry: 108 },
    { bone: "hairL", cx: 108, cy: 195, rx: 82, ry: 132 },
    { bone: "hairR", cx: 342, cy: 160, rx: 72, ry: 112 },
    { bone: "ribbonL", cx: 78, cy: 322, rx: 66, ry: 38 },
    { bone: "ribbonR", cx: 366, cy: 338, rx: 52, ry: 88 },
    { bone: "ribbonR", cx: 345, cy: 418, rx: 52, ry: 34 },
    { bone: "skirt", cx: 262, cy: 352, rx: 128, ry: 66 },
    { bone: "legL", cx: 207, cy: 436, rx: 26, ry: 44 },
    { bone: "legR", cx: 241, cy: 446, rx: 32, ry: 36 },
    // The hands and the scissors, as one arm: the ring, then the long blade running down-left.
    { bone: "scissors", cx: 150, cy: 268, rx: 68, ry: 70 },
    { bone: "scissors", cx: 100, cy: 365, rx: 36, ry: 128, angle: -34 },
  ],
};

export const AMUMU_RIG: RigDef = {
  width: 358,
  height: 420,
  margin: 50,
  cols: 26,
  rows: 30,
  base: "body",
  bones: [
    { name: "root", parent: -1, pivot: [180, 405] },
    { name: "body", parent: 0, pivot: [180, 385] },
    { name: "head", parent: 1, pivot: [150, 300] },
    { name: "tail", parent: 2, pivot: [168, 105] },
    { name: "stripR", parent: 2, pivot: [236, 268] },
    { name: "floorStrip", parent: 1, pivot: [250, 385] },
    { name: "legL", parent: 0, pivot: [105, 335] },
    { name: "legR", parent: 0, pivot: [192, 335] },
    { name: "footBack", parent: 0, pivot: [58, 365] },
  ],
  regions: [
    { bone: "head", cx: 130, cy: 195, rx: 150, ry: 118 },
    { bone: "tail", cx: 258, cy: 68, rx: 108, ry: 74 },
    { bone: "stripR", cx: 258, cy: 322, rx: 38, ry: 76 },
    { bone: "floorStrip", cx: 292, cy: 396, rx: 62, ry: 24 },
    { bone: "legL", cx: 100, cy: 366, rx: 40, ry: 56 },
    { bone: "legR", cx: 192, cy: 366, rx: 50, ry: 56 },
    { bone: "footBack", cx: 50, cy: 386, rx: 42, ry: 36 },
  ],
};
