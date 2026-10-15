// Placement presets: where each companion sits relative to the panel, and how much
// transparent space ("gutter") the window needs above/below the panel for them.
//
// Companions only ever live ABOVE the top border (perching, peeking) or BELOW the bottom
// border (hanging), so they never cover the panel's content or controls.
import type { CompanionSettings } from "../../types";
import { type CompanionId, type Pose, SPRITES } from "./sprites";

export interface PlacementPreset {
  id: string;
  label: string;
  description: string;
  spots: Partial<Record<CompanionId, Spot>>;
}

export interface Spot {
  pose: Pose;
  /** Horizontal anchor as a fraction of the panel width (sprite center). */
  x: number;
  /** Side pose: height of the ledge as a fraction of the window height. */
  y?: number;
  /** Mirror the sprite. */
  flip?: boolean;
  /** Extra scale relative to the user size (minimal mode). */
  scale?: number;
}

export const PRESETS: PlacementPreset[] = [
  {
    id: "corners",
    label: "Opposite corners",
    description: "Gwen stands on the top-left of the frame, Amumu dangles from the bottom-right corner.",
    spots: { gwen: { pose: "perch", x: 0.2 }, amumu: { pose: "hang", x: 0.84 } },
  },
  {
    id: "top",
    label: "Top border",
    description: "Gwen stands and Amumu sits on the top border.",
    spots: { gwen: { pose: "perch", x: 0.22 }, amumu: { pose: "perch", x: 0.8 } },
  },
  {
    id: "bottom",
    label: "Hanging below",
    description: "Both dangle from the bottom border — Gwen on a ribbon, Amumu on his bandage.",
    spots: { gwen: { pose: "hang", x: 0.22 }, amumu: { pose: "hang", x: 0.78 } },
  },
  {
    id: "left",
    label: "Left corner",
    description: "Side by side on the top-left of the frame.",
    spots: { gwen: { pose: "perch", x: 0.15 }, amumu: { pose: "perch", x: 0.36 } },
  },
  {
    id: "right",
    label: "Right corner",
    description: "Side by side on the top-right of the frame.",
    spots: { amumu: { pose: "perch", x: 0.64, flip: true }, gwen: { pose: "perch", x: 0.85, flip: true } },
  },
  {
    id: "peek",
    label: "Peeking",
    description: "Both peek over the top border.",
    spots: { gwen: { pose: "peek", x: 0.28 }, amumu: { pose: "peek", x: 0.72 } },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Two small heads peeking over the top-right corner.",
    spots: { gwen: { pose: "peek", x: 0.72, scale: 0.72 }, amumu: { pose: "peek", x: 0.88, scale: 0.72 } },
  },
];

/**
 * Docked to the League client: both stand on ledges off the panel's outer border (right, or
 * left when the panel sits on the client's left). Mirrored on the left so they face the panel.
 */
const DOCKED_SPOTS: Record<CompanionId, Spot> = {
  gwen: { pose: "side", x: 0, y: 0.34 },
  amumu: { pose: "side", x: 0, y: 0.78 },
};
const DOCKED_SPOTS_LEFT: Record<CompanionId, Spot> = {
  gwen: { ...DOCKED_SPOTS.gwen, flip: true },
  amumu: { ...DOCKED_SPOTS.amumu, flip: true },
};
const DOCKED_SCALE = 0.85;
/** The docked window shrinks to the space beside the client; the gutter never takes more. */
const DOCKED_MAX_GUTTER = 0.2;
/**
 * Share of each docked sprite's width that leans over the panel's frame, measured on the art:
 * at strap height Gwen's body starts 23% in (her hair is wider), Amumu's bandaged arm reaches
 * the edge. So Gwen's hair crosses the border and her body touches it; Amumu's arm crosses it.
 */
const DOCKED_GRIP: Record<CompanionId, number> = { gwen: 0.2, amumu: 0.12 };

export const DEFAULT_PRESET = "corners";
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.4;
/** In-game (compact) panels are narrower: companions shrink a little. */
const COMPACT_SCALE = 0.8;
/** Ribbon / bandage length for hanging companions, CSS px at size 1. */
const RIBBON = 16;

export interface Placed {
  who: CompanionId;
  spot: Spot;
  /** CSS px box of the companion element. */
  width: number;
  height: number;
  left: number;
  /** Rendered sprite height (CSS px). */
  spriteHeight: number;
  /** Distance from the element's top to the border line (top-edge poses). */
  seat: number;
  /** Hanging: ribbon length above the sprite. */
  ribbon: number;
  /** Side pose: sprite px leaning over the panel's frame (past its outer border). */
  overlap: number;
}

export interface Layout {
  placed: Placed[];
  gutterTop: number;
  gutterBottom: number;
  /** Side pose: transparent strip right (or left) of the panel. */
  gutterRight: number;
  gutterLeft: number;
}

export function presetById(id: string): PlacementPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET)!;
}

export function clampSize(size: number): number {
  return Number.isFinite(size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)) : 1;
}

/**
 * Lays the enabled companions out over a panel of `panelWidth` CSS px, clamped to stay inside
 * the window horizontally. `compact` (in-game) shrinks them a little. `docked` ignores the
 * preset: they stand beside the outer border (`dockedLeft`: the left one) and `panelWidth`
 * is the whole window.
 */
export function layoutCompanions(
  settings: CompanionSettings,
  panelWidth: number,
  opts: { compact: boolean; docked?: boolean; dockedLeft?: boolean },
): Layout {
  if (opts.docked) return layoutDocked(settings, panelWidth, !!opts.dockedLeft);
  const preset = presetById(settings.placement);
  const size = clampSize(settings.size) * (opts.compact ? COMPACT_SCALE : 1);
  const placed: Placed[] = [];
  for (const who of ["gwen", "amumu"] as const) {
    if (!settings[who]) continue;
    const spot = preset.spots[who];
    if (!spot) continue;
    const sprite = SPRITES[who];
    const spriteHeight = Math.round(sprite.baseHeight * size * (spot.scale ?? 1));
    const width = Math.round((spriteHeight * sprite.width) / sprite.height);
    const left = Math.round(Math.min(Math.max(spot.x * panelWidth - width / 2, 0), Math.max(0, panelWidth - width)));
    let height = spriteHeight;
    let seat = 0;
    let ribbon = 0;
    if (spot.pose === "perch") {
      seat = Math.round(spriteHeight * sprite.seat);
    } else if (spot.pose === "peek") {
      // Only the head shows; the element clips the rest just below the border.
      seat = Math.round(spriteHeight * sprite.peek);
      height = seat + 2;
    } else {
      ribbon = Math.round(RIBBON * size);
      height = ribbon + spriteHeight;
    }
    placed.push({ who, spot, width, height, left, spriteHeight, seat, ribbon, overlap: 0 });
  }
  const gutterTop = Math.max(0, ...placed.filter((p) => p.spot.pose !== "hang").map((p) => p.seat));
  const gutterBottom = Math.max(0, ...placed.filter((p) => p.spot.pose === "hang").map((p) => p.height));
  return { placed, gutterTop, gutterBottom, gutterRight: 0, gutterLeft: 0 };
}

function layoutDocked(settings: CompanionSettings, windowWidth: number, onLeft: boolean): Layout {
  const enabled = (["gwen", "amumu"] as const).filter((who) => settings[who]);
  const size = clampSize(settings.size) * DOCKED_SCALE;
  // Widest sprite at this size, then shrink everyone if that would eat too much of the panel.
  const widthAt = (who: CompanionId, s: number) => (SPRITES[who].baseHeight * s * SPRITES[who].width) / SPRITES[who].height;
  const widest = Math.max(0, ...enabled.map((who) => widthAt(who, size)));
  const fit = widest ? Math.min(1, (windowWidth * DOCKED_MAX_GUTTER - 4) / (widest * (1 - Math.min(...enabled.map((w) => DOCKED_GRIP[w]))))) : 1;
  const sized = enabled.map((who) => {
    const sprite = SPRITES[who];
    const spriteHeight = Math.round(sprite.baseHeight * size * fit);
    return { who, spriteHeight, width: Math.round((spriteHeight * sprite.width) / sprite.height) };
  });
  if (!sized.length) return { placed: [], gutterTop: 0, gutterBottom: 0, gutterRight: 0, gutterLeft: 0 };
  // Each one leans over the frame (drawn on top of it), so they cling to the panel instead of
  // floating beside it; the gutter only holds the part outside the border.
  const gripped = sized.map((s) => ({ ...s, overlap: Math.round(s.width * DOCKED_GRIP[s.who]) }));
  const gutter = Math.max(...gripped.map((s) => s.width - s.overlap)) + 4;
  const placed = gripped.map(({ who, spriteHeight, width, overlap }) => ({
    who,
    spot: (onLeft ? DOCKED_SPOTS_LEFT : DOCKED_SPOTS)[who],
    width,
    height: spriteHeight,
    // `overlap` px of the sprite sit over the panel, the rest in the gutter.
    left: onLeft ? gutter + overlap - width : windowWidth - gutter - overlap,
    spriteHeight,
    seat: spriteHeight,
    ribbon: 0,
    overlap,
  }));
  return { placed, gutterTop: 0, gutterBottom: 0, gutterRight: onLeft ? 0 : gutter, gutterLeft: onLeft ? gutter : 0 };
}
