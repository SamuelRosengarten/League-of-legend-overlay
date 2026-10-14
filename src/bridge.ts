// Thin typed wrapper over Tauri invoke/listen. All backend I/O goes through here.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ChampSelectSession,
  ConnectionStatus,
  DdragonData,
  LivePayload,
  MockStatus,
  OverlayState,
  Snapshot,
} from "./types";

export interface BackendEvents {
  "rift:connection": ConnectionStatus;
  "rift:phase": string;
  "rift:champ-select": ChampSelectSession | null;
  "rift:live": LivePayload;
  "rift:overlay": OverlayState;
  "rift:mock": MockStatus;
  "rift:ddragon": DdragonData | null;
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
  mock: {
    status: () => invoke<MockStatus>("mock_status"),
    load: (id: string) => invoke<void>("mock_load", { id }),
    step: (delta: number) => invoke<void>("mock_step", { delta }),
    play: (playing: boolean) => invoke<void>("mock_play", { playing }),
  },
};

/** URL of a cached Data Dragon champion icon (served by the Rust `ddicon` protocol). */
export function championIconUrl(championId: string): string {
  const windows = navigator.userAgent.includes("Windows");
  return windows ? `http://ddicon.localhost/${championId}.png` : `ddicon://localhost/${championId}.png`;
}
