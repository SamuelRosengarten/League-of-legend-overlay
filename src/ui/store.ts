import type { DdragonData, MockStatus, Snapshot } from "../types";
import { ChampionIndex } from "../domain/champions";

export interface UiState {
  snapshot: Snapshot | null;
  champions: ChampionIndex;
  mock: MockStatus | null;
  /** Compact in-game panel collapsed to its header (persisted per machine). */
  collapsed: boolean;
}

type Listener = (s: UiState) => void;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("rift.collapsed") === "1";
  } catch {
    return false;
  }
}

class Store {
  state: UiState = { snapshot: null, champions: new ChampionIndex(null), mock: null, collapsed: readCollapsed() };
  private listeners: Listener[] = [];
  private queued = false;

  subscribe(fn: Listener) {
    this.listeners.push(fn);
  }

  update(patch: Partial<UiState>) {
    this.state = { ...this.state, ...patch };
    if (this.queued) return;
    this.queued = true;
    // Coalesce bursts of backend events into one render per frame.
    requestAnimationFrame(() => {
      this.queued = false;
      for (const fn of this.listeners) fn(this.state);
    });
  }

  patchSnapshot(patch: Partial<Snapshot>) {
    if (this.state.snapshot) this.update({ snapshot: { ...this.state.snapshot, ...patch } });
  }

  setDdragon(data: DdragonData | null) {
    this.update({ champions: new ChampionIndex(data) });
  }

  setCollapsed(collapsed: boolean) {
    try {
      localStorage.setItem("rift.collapsed", collapsed ? "1" : "0");
    } catch {
      /* storage unavailable — keep in memory only */
    }
    this.update({ collapsed });
  }
}

export const store = new Store();
