// Placement presets: where each companion sits relative to the panel, and how much
// transparent space ("gutter") the window needs above/below the panel for them.
//
// Companions only ever live ABOVE the top border (sitting, standing, peeking) or BELOW the
// bottom border (hanging), so they never cover the panel's content.
import type { CompanionSettings } from "../../types";
import { ART, type CompanionId, type Pose } from "./art";

export interface PlacementPreset {
  id: string;
  label: string;
  description: string;
  spots: Partial<Record<CompanionId, Spot>>;
}

export interface Spot {
  pose: Pose;
  /** "top" = on the top border, "bottom" = hanging from the bottom border. */
  edge: "top" | "bottom";
  /** Horizontal anchor as a fraction of the panel width (art center). */
  x: number;
  /** Mirror the art. */
  flip?: boolean;
  /** Extra scale relative to the user size (minimal mode). */
  scale?: number;
}

export const PRESETS: PlacementPreset[] = [
  {
    id: "corners",
    label: "Opposite corners",
    description: "Gwen sits on the top border, Amumu hangs from the bottom corner.",
    spots: { gwen: { pose: "sit", edge: "top", x: 0.24 }, amumu: { pose: "hang", edge: "bottom", x: 0.84 } },
  },
  {
    id: "top",
    label: "Top border",
    description: "Both sit on the top border.",
    spots: { gwen: { pose: "sit", edge: "top", x: 0.26 }, amumu: { pose: "sit", edge: "top", x: 0.78 } },
  },
  {
    id: "bottom",
    label: "Hanging below",
    description: "Both hang from the bottom border.",
    spots: { gwen: { pose: "hang", edge: "bottom", x: 0.2 }, amumu: { pose: "hang", edge: "bottom", x: 0.8 } },
  },
  {
    id: "left",
    label: "Left corner",
    description: "Gwen stands at the top-left corner, Amumu peeks beside her.",
    spots: { gwen: { pose: "stand", edge: "top", x: 0.13 }, amumu: { pose: "peek", edge: "top", x: 0.32 } },
  },
  {
    id: "right",
    label: "Right corner",
    description: "Amumu peeks, Gwen stands at the top-right corner.",
    spots: { amumu: { pose: "peek", edge: "top", x: 0.68 }, gwen: { pose: "stand", edge: "top", x: 0.87, flip: true } },
  },
  {
    id: "peek",
    label: "Peeking",
    description: "Both peek over the top border.",
    spots: { gwen: { pose: "peek", edge: "top", x: 0.3 }, amumu: { pose: "peek", edge: "top", x: 0.7 } },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Two small heads peeking over the top-right corner.",
    spots: { gwen: { pose: "peek", edge: "top", x: 0.74, scale: 0.7 }, amumu: { pose: "peek", edge: "top", x: 0.88, scale: 0.7 } },
  },
];

export const DEFAULT_PRESET = "corners";
/** Art units → CSS px at size 1. */
export const BASE_SCALE = 0.84;
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.4;

export interface Placed {
  who: CompanionId;
  spot: Spot;
  /** CSS px. */
  width: number;
  height: number;
  /** Distance from the art's top to the seat line, CSS px. */
  seat: number;
  left: number;
}

export interface Layout {
  placed: Placed[];
  gutterTop: number;
  gutterBottom: number;
}

export function presetById(id: string): PlacementPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET)!;
}

export function clampSize(size: number): number {
  return Number.isFinite(size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, size)) : 1;
}

/**
 * Lays the enabled companions out over a panel of `panelWidth` CSS px. Art is clamped to
 * stay inside the window horizontally. `compact` (in-game) shrinks them a little.
 */
export function layoutCompanions(settings: CompanionSettings, panelWidth: number, opts: { compact: boolean }): Layout {
  const preset = presetById(settings.placement);
  const size = clampSize(settings.size) * BASE_SCALE * (opts.compact ? 0.85 : 1);
  const placed: Placed[] = [];
  for (const who of ["gwen", "amumu"] as const) {
    if (!settings[who]) continue;
    const spot = preset.spots[who];
    if (!spot) continue;
    const [, y, w, h] = ART[who][spot.pose].box;
    const s = size * (spot.scale ?? 1);
    const width = w * s;
    const left = Math.min(Math.max(spot.x * panelWidth - width / 2, 0), Math.max(0, panelWidth - width));
    placed.push({ who, spot, width, height: h * s, seat: -y * s, left });
  }
  const gutterTop = Math.ceil(Math.max(0, ...placed.filter((p) => p.spot.edge === "top").map((p) => p.seat)));
  const gutterBottom = Math.ceil(Math.max(0, ...placed.filter((p) => p.spot.edge === "bottom").map((p) => p.height - p.seat)));
  return { placed, gutterTop, gutterBottom };
}
