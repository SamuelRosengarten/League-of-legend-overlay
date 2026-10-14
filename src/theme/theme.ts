import type { Appearance, RankInfo } from "../types";
import { type RankTheme, THEMES, type ThemeId, isThemeId } from "./ranks";

export type ThemeSource = "client" | "cached" | "mock" | "manual" | "none";

export interface ResolvedTheme {
  theme: RankTheme;
  /** Where the tier came from — shown in the UI so it never pretends to know the rank. */
  source: ThemeSource;
}

/**
 * Manual choice wins; "auto" follows the rank the client reported (or the cached last value
 * while the client is closed). An unranked account gets the neutral "unranked" theme.
 */
export function resolveTheme(appearance: Appearance, rank: RankInfo | null): ResolvedTheme {
  if (appearance.theme !== "auto" && isThemeId(appearance.theme)) {
    return { theme: THEMES[appearance.theme], source: "manual" };
  }
  if (rank && isThemeId(rank.tier)) return { theme: THEMES[rank.tier], source: rank.source };
  return { theme: THEMES.unranked, source: "none" };
}

const VARS: Record<keyof RankTheme["palette"], string> = {
  primary: "--rank-primary",
  secondary: "--rank-secondary",
  accent: "--rank-accent",
  glow: "--rank-glow",
  background: "--rank-background",
  background2: "--rank-background-2",
  border: "--rank-border",
  onPrimary: "--rank-on-primary",
  particle: "--rank-particle",
};

let applied: ThemeId | null = null;

/** Writes the palette to :root. Colors cross-fade via the @property transitions in theme.css. */
export function applyTheme(theme: RankTheme, root: HTMLElement = document.documentElement) {
  if (applied === theme.id) return;
  applied = theme.id;
  for (const [key, cssVar] of Object.entries(VARS)) {
    root.style.setProperty(cssVar, theme.palette[key as keyof RankTheme["palette"]]);
  }
  root.dataset.rank = theme.id;
  root.dataset.prestige = String(theme.prestige);
}

export function rankLabel(rank: RankInfo | null): string {
  if (!rank) return "Rank unknown";
  if (!isThemeId(rank.tier) || rank.tier === "unranked") {
    return rank.provisionalGamesRemaining > 0 ? `Unranked · ${rank.provisionalGamesRemaining} placements left` : "Unranked";
  }
  return [THEMES[rank.tier].label, rank.division].filter(Boolean).join(" ");
}
