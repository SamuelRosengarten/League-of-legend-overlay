import type { ChampSelectSession, DdragonData, MockStatus, Snapshot } from "../types";
import { ChampionIndex } from "../domain/champions";
import type { EnemySnapshot, GameNote } from "../domain/gameNotes";
import { type CuratedData, curated } from "../data";

export interface UiState {
  snapshot: Snapshot | null;
  champions: ChampionIndex;
  data: CuratedData;
  mock: MockStatus | null;
  /** Compact in-game panel collapsed to its header (persisted per machine). */
  collapsed: boolean;
  /** In-game notes for the current game, oldest first. */
  notes: GameNote[];
  /** Enemy items/levels from the previous live snapshot (for diffing). */
  lastEnemies: EnemySnapshot[] | null;
  /** Last non-empty champ-select session (the plan stays visible on the loading screen). */
  lastChampSelect: ChampSelectSession | null;
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
  state: UiState = {
    snapshot: null,
    champions: new ChampionIndex(null),
    data: curated(),
    mock: null,
    collapsed: readCollapsed(),
    notes: [],
    lastEnemies: null,
    lastChampSelect: null,
  };
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
