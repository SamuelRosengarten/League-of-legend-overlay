// Rank themes: the single source of every rank-specific color in the overlay.
//
// Each tier defines a small palette; `applyTheme` writes it to CSS custom properties on
// :root (`--rank-*`), and every component styles itself from those variables only. The
// variables are registered with @property (styles/theme.css), so a rank change cross-fades
// the whole interface instead of snapping.
//
// Emblems are Riot's official ranked crests from the Riot Developer Portal
// ("Ranked Emblems Latest"), resized to 256 px.
import bronze from "../assets/ranks/bronze.png";
import challenger from "../assets/ranks/challenger.png";
import diamond from "../assets/ranks/diamond.png";
import emerald from "../assets/ranks/emerald.png";
import gold from "../assets/ranks/gold.png";
import grandmaster from "../assets/ranks/grandmaster.png";
import iron from "../assets/ranks/iron.png";
import master from "../assets/ranks/master.png";
import platinum from "../assets/ranks/platinum.png";
import silver from "../assets/ranks/silver.png";

export const TIER_IDS = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"] as const;
export type TierId = (typeof TIER_IDS)[number];
export type ThemeId = TierId | "unranked";

export interface RankPalette {
  /** Main metal of the crest: frames, active states, headings. */
  primary: string;
  /** Darker metal: gradients, button bases, frame shadows. */
  secondary: string;
  /** Bright highlight: selected items, focus rings, sparkles, accent text. */
  accent: string;
  /** Glow color (with alpha) for lights and halos. */
  glow: string;
  /** Deep panel background, top and bottom of the panel gradient. */
  background: string;
  background2: string;
  /** Hairline frame color. */
  border: string;
  /** Readable text color on a `primary`-filled control. */
  onPrimary: string;
  /** Ambient particle color. */
  particle: string;
}

export interface RankTheme {
  id: ThemeId;
  label: string;
  emblem: string | null;
  palette: RankPalette;
  /** Extra decoration level: 0 plain, 1 apex tiers (Master+), 2 Challenger. */
  prestige: 0 | 1 | 2;
}

const t = (id: ThemeId, label: string, emblem: string | null, palette: RankPalette, prestige: 0 | 1 | 2 = 0): RankTheme => ({ id, label, emblem, palette, prestige });

export const THEMES: Record<ThemeId, RankTheme> = {
  // Default before a rank is known: the client's own gold-and-hextech look.
  unranked: t("unranked", "Unranked", null, {
    primary: "#c8aa6e", secondary: "#785a28", accent: "#0ac8b9", glow: "rgba(10, 200, 185, 0.30)",
    background: "#0a1118", background2: "#0d1a24", border: "#5b4a2c", onPrimary: "#14100a", particle: "#7fe3dc",
  }),
  iron: t("iron", "Iron", iron, {
    primary: "#9a918a", secondary: "#4b4440", accent: "#cbbfb3", glow: "rgba(170, 158, 148, 0.28)",
    background: "#111012", background2: "#1b1919", border: "#544c47", onPrimary: "#141212", particle: "#b3a99f",
  }),
  bronze: t("bronze", "Bronze", bronze, {
    primary: "#c98256", secondary: "#6c3a22", accent: "#f0b58a", glow: "rgba(222, 132, 78, 0.34)",
    background: "#140e0b", background2: "#21160f", border: "#6a4129", onPrimary: "#1a0f09", particle: "#eeaa7c",
  }),
  silver: t("silver", "Silver", silver, {
    primary: "#bfccd6", secondary: "#56636f", accent: "#eef6fc", glow: "rgba(190, 220, 245, 0.30)",
    background: "#0e1216", background2: "#161d24", border: "#56636e", onPrimary: "#10161b", particle: "#dceaf5",
  }),
  gold: t("gold", "Gold", gold, {
    primary: "#e3b65a", secondary: "#7a5418", accent: "#ffe39a", glow: "rgba(242, 190, 82, 0.38)",
    background: "#130f09", background2: "#201810", border: "#76571f", onPrimary: "#1d1406", particle: "#ffd77a",
  }),
  platinum: t("platinum", "Platinum", platinum, {
    primary: "#5ccac4", secondary: "#24646a", accent: "#b4f5ef", glow: "rgba(84, 214, 206, 0.34)",
    background: "#0a1314", background2: "#102022", border: "#2f6b6d", onPrimary: "#08191a", particle: "#9cefe7",
  }),
  emerald: t("emerald", "Emerald", emerald, {
    primary: "#34c47a", secondary: "#145c3a", accent: "#8ff5bd", glow: "rgba(46, 206, 124, 0.36)",
    background: "#08120d", background2: "#0e1f17", border: "#1f6a45", onPrimary: "#06160d", particle: "#7deeb0",
  }),
  diamond: t("diamond", "Diamond", diamond, {
    primary: "#7d97ff", secondary: "#2e3f9e", accent: "#c3d2ff", glow: "rgba(118, 146, 255, 0.40)",
    background: "#0a0d1a", background2: "#111834", border: "#3a4a9a", onPrimary: "#0b1030", particle: "#b0c4ff",
  }),
  master: t("master", "Master", master, {
    primary: "#c866e6", secondary: "#5c2273", accent: "#f2a9ff", glow: "rgba(204, 96, 236, 0.40)",
    background: "#110a16", background2: "#1d1025", border: "#6a2f80", onPrimary: "#1e0a27", particle: "#eaa2ff",
  }, 1),
  grandmaster: t("grandmaster", "Grandmaster", grandmaster, {
    primary: "#e8524a", secondary: "#6e1517", accent: "#ff9d8c", glow: "rgba(236, 66, 54, 0.42)",
    background: "#130909", background2: "#220e0e", border: "#7a2422", onPrimary: "#260807", particle: "#ff8f7d",
  }, 1),
  challenger: t("challenger", "Challenger", challenger, {
    primary: "#f4cb72", secondary: "#2f6cc9", accent: "#a6e1ff", glow: "rgba(140, 205, 255, 0.44)",
    background: "#0a0f1c", background2: "#111b33", border: "#6c6236", onPrimary: "#1b1405", particle: "#cfeeff",
  }, 2),
};

export function isThemeId(v: string): v is ThemeId {
  return v in THEMES;
}

export function tierIndex(id: ThemeId): number {
  return (TIER_IDS as readonly string[]).indexOf(id);
}
