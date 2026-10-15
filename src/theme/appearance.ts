import { DEFAULT_PRESET, PRESETS, clampSize } from "../ui/companions/layout";
import type { Appearance } from "../types";
import { isThemeId } from "./ranks";

export type Motion = "full" | "calm" | "off";
export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "Idle animations, sparkles and ambient particles" },
  { id: "calm", label: "Calm", hint: "Slow breathing and blinking only" },
  { id: "off", label: "Off", hint: "No animation at all" },
];

/** Must match SCALE_MIN / SCALE_MAX in src-tauri/src/settings.rs. */
export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.5;

export function clampScale(scale: number): number {
  return Number.isFinite(scale) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale)) : 1;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "auto",
  motion: "full",
  companions: { gwen: true, amumu: true, placement: DEFAULT_PRESET, size: 1, inGame: true },
  scale: 1,
  snapToEdge: false,
  dockToClient: true,
};

/** Settings come from a hand-editable file: repair anything unknown instead of failing. */
export function normalizeAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const c = { ...DEFAULT_APPEARANCE.companions, ...(a?.companions ?? {}) };
  return {
    theme: a?.theme === "auto" || (a?.theme && isThemeId(a.theme)) ? a.theme : "auto",
    motion: MOTIONS.some((m) => m.id === a?.motion) ? (a!.motion as Motion) : "full",
    companions: {
      gwen: !!c.gwen,
      amumu: !!c.amumu,
      placement: PRESETS.some((p) => p.id === c.placement) ? c.placement : DEFAULT_PRESET,
      size: clampSize(Number(c.size)),
      inGame: !!c.inGame,
    },
    scale: a?.scale === undefined ? 1 : clampScale(Number(a.scale)),
    snapToEdge: !!a?.snapToEdge,
    dockToClient: a?.dockToClient === undefined ? true : !!a.dockToClient,
  };
}

/**
 * Effective motion level: the user's choice, capped by Windows' "reduce animations" setting
 * (prefers-reduced-motion) and by gameplay (in game the overlay never runs more than "calm").
 */
export function effectiveMotion(choice: string, opts: { inGame: boolean; reducedMotion: boolean }): Motion {
  if (opts.reducedMotion || choice === "off") return "off";
  if (opts.inGame || choice === "calm") return "calm";
  return "full";
}
