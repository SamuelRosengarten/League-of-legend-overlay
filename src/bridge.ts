// Thin typed wrapper over Tauri invoke/listen. All backend I/O goes through here.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Appearance,
  ChampSelectSession,
  ConnectionStatus,
  DdragonData,
  History,
  LivePayload,
  MockStatus,
  OverlayState,
  RankInfo,
  Snapshot,
} from "./types";

/** CSS px, relative to the window: the area that stays clickable in click-through mode. */
export interface HotZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackendEvents {
  "rift:connection": ConnectionStatus;
  "rift:phase": string;
  "rift:champ-select": ChampSelectSession | null;
  "rift:live": LivePayload;
  "rift:overlay": OverlayState;
  "rift:mock": MockStatus;
  "rift:ddragon": DdragonData | null;
  "rift:rank": RankInfo | null;
  "rift:appearance": Appearance;
  "rift:history": History | null;
}

export function on<K extends keyof BackendEvents>(event: K, handler: (payload: BackendEvents[K]) => void) {
  return listen<BackendEvents[K]>(event, (e) => handler(e.payload));
}

export const backend = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  ddragon: () => invoke<DdragonData | null>("get_ddragon"),
  setInteractive: (interactive: boolean) => invoke<void>("set_interactive", { interactive }),
  toggleVisibility: () => invoke<void>("toggle_visibility"),
  fitContent: (height: number) => invoke<void>("fit_content", { height }),
  resetPosition: () => invoke<void>("reset_position"),
  setHotZone: (zone: HotZone | null) => invoke<void>("set_hot_zone", { zone }),
  setAppearance: (appearance: Appearance) => invoke<void>("set_appearance", { appearance }),
  mock: {
    status: () => invoke<MockStatus>("mock_status"),
    load: (id: string) => invoke<void>("mock_load", { id }),
    step: (delta: number) => invoke<void>("mock_step", { delta }),
    play: (playing: boolean) => invoke<void>("mock_play", { playing }),
  },
};

// Data Dragon art, cached on disk and served by the Rust `ddicon` protocol.
const ASSET_BASE = navigator.userAgent.includes("Windows") ? "http://ddicon.localhost" : "ddicon://localhost";

export function championIconUrl(championId: string): string {
  return `${ASSET_BASE}/${championId}.png`;
}

export function itemIconUrl(itemId: number): string {
  return `${ASSET_BASE}/item/${itemId}.png`;
}

/** Ability icon; key is P (passive), Q, W, E or R. */
export function spellIconUrl(championId: string, key: string): string {
  return `${ASSET_BASE}/spell/${championId}/${key}.png`;
}

/** Centered default-skin splash art. */
export function splashUrl(championId: string): string {
  return `${ASSET_BASE}/splash/${championId}.jpg`;
}
