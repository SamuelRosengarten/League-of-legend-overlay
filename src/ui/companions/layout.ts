// Placement presets: where each companion sits relative to the panel, and how much
// transparent space ("gutter") the window needs above/below the panel for them.
//
// Companions only ever live ABOVE the top border (perching, peeking) or BELOW the bottom
// border (hanging), so they never cover the panel's content or controls.
import type { CompanionSettings } from "../../types";
import { COMPANION_IDS, type CompanionId, type Pose, SPRITES } from "./sprites";

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
    description: "Gwen and Fiddlesticks stand on the top-left of the frame, Amumu dangles from the bottom-right corner.",
    spots: { gwen: { pose: "perch", x: 0.15 }, fiddlesticks: { pose: "perch", x: 0.4 }, amumu: { pose: "hang", x: 0.84 } },
  },
  {
    id: "top",
    label: "Top border",
    description: "Gwen and Amumu on the top border, with Fiddlesticks lurking at the end.",
    spots: { gwen: { pose: "perch", x: 0.15 }, amumu: { pose: "perch", x: 0.5 }, fiddlesticks: { pose: "perch", x: 0.85 } },
  },
  {
    id: "bottom",
    label: "Hanging below",
    description: "All dangle from the bottom border — Gwen on a ribbon, Fiddlesticks on a rope, Amumu on his bandage.",
    spots: { gwen: { pose: "hang", x: 0.16 }, fiddlesticks: { pose: "hang", x: 0.5 }, amumu: { pose: "hang", x: 0.84 } },
  },
  {
    id: "left",
    label: "Left corner",
    description: "Side by side on the top-left of the frame.",
    spots: { gwen: { pose: "perch", x: 0.13 }, amumu: { pose: "perch", x: 0.36 }, fiddlesticks: { pose: "perch", x: 0.58 } },
  },
  {
    id: "right",
    label: "Right corner",
    description: "Side by side on the top-right of the frame.",
    spots: {
      gwen: { pose: "perch", x: 0.46, flip: true },
      amumu: { pose: "perch", x: 0.67, flip: true },
      fiddlesticks: { pose: "perch", x: 0.88, flip: true },
    },
  },
  {
    id: "peek",
    label: "Peeking",
    description: "All peek over the top border.",
    spots: { gwen: { pose: "peek", x: 0.18 }, fiddlesticks: { pose: "peek", x: 0.5 }, amumu: { pose: "peek", x: 0.82 } },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Small heads peeking over the top-right corner.",
    spots: {
      gwen: { pose: "peek", x: 0.55, scale: 0.72 },
      fiddlesticks: { pose: "peek", x: 0.73, scale: 0.72 },
      amumu: { pose: "peek", x: 0.88, scale: 0.72 },
    },
  },
];

/**
 * Docked to the League client: both stand on ledges off the panel's outer border (right, or
 * left when the panel sits on the client's left). Mirrored on the left so they face the panel.
 */
const DOCKED_SPOTS: Record<CompanionId, Spot> = {
  gwen: { pose: "side", x: 0, y: 0.3 },
  fiddlesticks: { pose: "side", x: 0, y: 0.57 },
  amumu: { pose: "side", x: 0, y: 0.84 },
};
const DOCKED_SPOTS_LEFT: Record<CompanionId, Spot> = {
  gwen: { ...DOCKED_SPOTS.gwen, flip: true },
  fiddlesticks: { ...DOCKED_SPOTS.fiddlesticks, flip: true },
  amumu: { ...DOCKED_SPOTS.amumu, flip: true },
};
const DOCKED_SCALE = 0.85;
/** The docked window shrinks to the space beside the client; the gutter never takes more. */
const DOCKED_MAX_GUTTER = 0.2;
/**
 * Share of each docked sprite's width that leans over the panel's frame, measured on the art:
 * at strap height Gwen's body starts 23% in (her hair is wider), Amumu's bandaged arm reaches
 * the edge, and Fiddlesticks' outstretched hand reaches it. So Gwen's hair crosses the border and
 * her body touches it; Amumu's arm and Fiddlesticks' hand cross it.
 */
const DOCKED_GRIP: Record<CompanionId, number> = { gwen: 0.2, amumu: 0.12, fiddlesticks: 0.2 };

export const DEFAULT_PRESET = "corners";
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.4;
/** In-game (compact) panels are narrower: companions shrink a little. */
const COMPACT_SCALE = 0.8;
/** Ribbon / bandage length for hanging companions, CSS px at size 1. */
const RIBBON = 16;
/** Clear space between neighbours on one border (CSS px at size 1), so silhouettes never merge. */
const MIN_GAP = 6;
/** Space kept above the tallest standing companion (CSS px): room for hops and speech bubbles. */
const HEADROOM = 24;

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
  // Sprites that share a border (top or bottom) are sized and spaced together so they never
  // pile onto each other on a narrow panel: shrink if they cannot fit, then push apart.
  const items = COMPANION_IDS.flatMap((who) => {
    const spot = preset.spots[who];
    return settings[who] && spot ? [{ who, spot, sprite: SPRITES[who] }] : [];
  });
  const heightAt = (it: (typeof items)[number], fit: number) => Math.round(it.sprite.baseHeight * size * fit * (it.spot.scale ?? 1));
  const widthOf = (it: (typeof items)[number], h: number) => Math.round((h * it.sprite.width) / it.sprite.height);
  const placed: Placed[] = [];
  for (const hanging of [false, true]) {
    const group = items.filter((it) => (it.spot.pose === "hang") === hanging).sort((x, y) => x.spot.x - y.spot.x);
    if (!group.length) continue;
    const total = group.reduce((s, it) => s + widthOf(it, heightAt(it, 1)), 0);
    const gaps = MIN_GAP * (group.length - 1);
    const fit = Math.min(1, (panelWidth - 4 - gaps) / total);
    const boxes = group.map((it) => {
      const spriteHeight = heightAt(it, fit);
      const width = widthOf(it, spriteHeight);
      return { it, spriteHeight, width, left: it.spot.x * panelWidth - width / 2 };
    });
    const allow = () => -MIN_GAP;
    for (let i = 1; i < boxes.length; i++) boxes[i]!.left = Math.max(boxes[i]!.left, boxes[i - 1]!.left + boxes[i - 1]!.width - allow());
    for (let i = boxes.length - 1; i >= 0; i--) {
      const limit = i === boxes.length - 1 ? panelWidth - boxes[i]!.width : boxes[i + 1]!.left + allow() - boxes[i]!.width;
      boxes[i]!.left = Math.min(boxes[i]!.left, limit);
    }
    for (let i = 0; i < boxes.length; i++) {
      const prev = boxes[i - 1];
      boxes[i]!.left = Math.max(0, boxes[i]!.left, prev ? prev.left + prev.width - allow() : 0);
    }
    for (const { it, spriteHeight, width, left } of boxes) {
      let height = spriteHeight;
      let seat = 0;
      let ribbon = 0;
      if (it.spot.pose === "perch") {
        seat = Math.round(spriteHeight * it.sprite.seat);
      } else if (it.spot.pose === "peek") {
        // Only the head shows; the element clips the rest just below the border.
        seat = Math.round(spriteHeight * it.sprite.peek);
        height = seat + 2;
      } else {
        ribbon = Math.round(RIBBON * size);
        height = ribbon + spriteHeight;
      }
      placed.push({ who: it.who, spot: it.spot, width, height, left: Math.round(left), spriteHeight, seat, ribbon, overlap: 0 });
    }
  }
  const standing = placed.filter((p) => p.spot.pose !== "hang").map((p) => p.seat);
  // A little headroom so hops and lunges are never clipped by the window's top edge.
  const gutterTop = standing.length ? Math.max(...standing) + HEADROOM : 0;
  const gutterBottom = Math.max(0, ...placed.filter((p) => p.spot.pose === "hang").map((p) => p.height));
  return { placed, gutterTop, gutterBottom, gutterRight: 0, gutterLeft: 0 };
}

function layoutDocked(settings: CompanionSettings, windowWidth: number, onLeft: boolean): Layout {
  const enabled = COMPANION_IDS.filter((who) => settings[who]);
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
