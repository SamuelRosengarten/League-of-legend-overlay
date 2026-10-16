// Companion sprites: Gwen and Amumu cut from the user's reference sheet
// ("Chibi Seamstress and Sad Mummy Duo.png", project root) into separate transparent PNGs.
// Fiddlesticks is a hand-drawn SVG in the same chibi style.
// Fan art inspired by the champions — not official Riot artwork.
//
// All coordinates are fractions (0–1) of the sprite's width / height, so the overlays
// (eyelids, tear, sparkles) stay aligned at any display size.
import amumuUrl from "../../assets/companions/amumu.png";
import fiddlesticksUrl from "../../assets/companions/fiddlesticks.svg";
import fidArmL from "../../assets/companions/fiddlesticks/armL.svg";
import fidArmR from "../../assets/companions/fiddlesticks/armR.svg";
import fidBody from "../../assets/companions/fiddlesticks/body.svg";
import fidHead from "../../assets/companions/fiddlesticks/head.svg";
import fidLegL from "../../assets/companions/fiddlesticks/legL.svg";
import fidLegR from "../../assets/companions/fiddlesticks/legR.svg";
import gwenUrl from "../../assets/companions/gwen.png";
import type { RigDef } from "./mesh-core";
import { AMUMU_RIG, GWEN_RIG } from "./rigs";

export type CompanionId = "gwen" | "amumu" | "fiddlesticks";
/** Left-to-right order used for layout and the settings tiles. */
export const COMPANION_IDS: CompanionId[] = ["gwen", "fiddlesticks", "amumu"];
/** perch = natural pose on the top border (Gwen and Fiddlesticks stand, Amumu sits); peek = head only above
 * the top border; hang = dangling below the bottom border from a ribbon / bandage;
 * side = standing on a ledge off the right border (docked to the League client). */
export type Pose = "perch" | "peek" | "hang" | "side";
export type Expression =
  | "happy" | "sleepy" | "curious" | "excited" | "wink" | "surprised" | "cry"
  // used by the scenes: frightened, fretful, creepy stare, head twist, sulk, snip, scare, comfort
  | "scared" | "worried" | "stare" | "twist" | "pout" | "snip" | "boo" | "comfort";

export interface Eye {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lid tilt in degrees (head tilt in the art). */
  rot: number;
}

/** A separately animated layer of a sprite (same box as the sprite; rotates around `origin`). */
export type PartName = "legL" | "legR" | "body" | "armL" | "armR" | "head";
export interface Part {
  name: PartName;
  url: string;
  /** Pivot (the joint) as fractions of the sprite box. */
  origin: { x: number; y: number };
}

export interface Sprite {
  id: CompanionId;
  name: string;
  url: string;
  /** Optional animated layers, back to front. The eyelids and eye glow attach to the `head` layer. */
  parts?: Part[];
  /** Skeleton for the painted art: the picture is bent by bones (see mesh-core.ts) instead of moved flat. */
  rig?: RigDef;
  /** Natural pixel size of the PNG (aspect ratio). */
  width: number;
  height: number;
  /** Display height in CSS px at size 1 (non-compact panel). */
  baseHeight: number;
  eyes: [Eye, Eye];
  /** Eyelid fill (skin / bandage) and lash-line color. */
  lid: [string, string];
  lash: string;
  /** Where the feet / bottom rest on the border (fraction from the top). */
  seat: number;
  /** Peek: fraction of the sprite shown above the border (head + eyes). */
  peek: number;
  /** Hang: where the ribbon ties on (top of the head). */
  hangAt: { x: number; y: number };
  ribbon: { color: string; edge: string };
  /** Small sparkle anchors (scissor gem, blade tip …). */
  sparkles: { x: number; y: number }[];
  /** Where speech-bubble FX appear (above the head). */
  bubble: { x: number; y: number };
  expressions: Expression[];
}

export const SPRITES: Record<CompanionId, Sprite> = {
  gwen: {
    id: "gwen",
    name: "Gwen",
    url: gwenUrl,
    rig: GWEN_RIG,
    width: 414,
    height: 480,
    baseHeight: 124,
    eyes: [
      { x: 0.444, y: 0.326, w: 0.125, h: 0.1, rot: 8 },
      { x: 0.63, y: 0.352, w: 0.125, h: 0.1, rot: 9 },
    ],
    lid: ["#f2c2b1", "#f9d0bf"],
    lash: "#24193a",
    seat: 0.955,
    peek: 0.47,
    hangAt: { x: 0.55, y: 0.04 },
    ribbon: { color: "#2f62c8", edge: "#173a85" },
    sparkles: [
      { x: 0.245, y: 0.66 },
      { x: 0.03, y: 0.95 },
      { x: 0.72, y: 0.15 },
    ],
    bubble: { x: 0.8, y: 0.06 },
    expressions: ["happy", "sleepy", "curious", "excited", "wink"],
  },
  amumu: {
    id: "amumu",
    name: "Amumu",
    url: amumuUrl,
    rig: AMUMU_RIG,
    width: 358,
    height: 420,
    baseHeight: 100,
    eyes: [
      { x: 0.223, y: 0.557, w: 0.19, h: 0.165, rot: -6 },
      { x: 0.497, y: 0.595, w: 0.16, h: 0.17, rot: 4 },
    ],
    lid: ["#86a684", "#71947a"],
    lash: "#3d5a45",
    seat: 0.955,
    peek: 0.7,
    hangAt: { x: 0.4, y: 0.24 },
    ribbon: { color: "#8fae93", edge: "#4f6d57" },
    sparkles: [{ x: 0.86, y: 0.2 }],
    bubble: { x: 0.7, y: 0.3 },
    expressions: ["sleepy", "curious", "happy", "surprised", "cry"],
  },
  fiddlesticks: {
    id: "fiddlesticks",
    name: "Fiddlesticks",
    url: fiddlesticksUrl,
    // Layers (see scripts/split-fiddlesticks.mjs). Pivots: hip, shoulders, neck.
    parts: [
      { name: "legL", url: fidLegL, origin: { x: 0.446, y: 0.877 } },
      { name: "legR", url: fidLegR, origin: { x: 0.593, y: 0.877 } },
      { name: "body", url: fidBody, origin: { x: 0.5, y: 0.87 } },
      { name: "armL", url: fidArmL, origin: { x: 0.379, y: 0.596 } },
      { name: "armR", url: fidArmR, origin: { x: 0.636, y: 0.592 } },
      { name: "head", url: fidHead, origin: { x: 0.5, y: 0.54 } },
    ],
    width: 280,
    height: 456,
    baseHeight: 120,
    eyes: [
      { x: 0.348, y: 0.335, w: 0.107, h: 0.076, rot: -7 },
      { x: 0.569, y: 0.33, w: 0.136, h: 0.092, rot: -7 },
    ],
    lid: ["#2a1210", "#1a0a08"],
    lash: "#ff6a4a",
    seat: 0.955,
    peek: 0.58,
    hangAt: { x: 0.56, y: 0.06 },
    ribbon: { color: "#b08a58", edge: "#4d3516" },
    sparkles: [
      { x: 0.52, y: 0.1 },
      { x: 0.24, y: 0.88 },
    ],
    bubble: { x: 0.8, y: 0.08 },
    expressions: ["curious", "wink", "stare", "twist", "stare", "happy"],
  },
};
