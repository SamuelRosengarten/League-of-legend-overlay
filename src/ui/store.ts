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
  /** In-game panel shows the full cards instead of the glanceable summary (persisted). */
  details: boolean;
  /** In-game notes for the current game, oldest first. */
  notes: GameNote[];
  /** Enemy items/levels from the previous live snapshot (for diffing). */
  lastEnemies: EnemySnapshot[] | null;
  /** Last non-empty champ-select session (the plan stays visible on the loading screen). */
  lastChampSelect: ChampSelectSession | null;
  /** "settings" = the Appearance view (rank theme, companions, motion). */
  view: "main" | "settings";
}

type Listener = (s: UiState) => void;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

class Store {
  state: UiState = {
    snapshot: null,
    champions: new ChampionIndex(null),
    data: curated(),
    mock: null,
    collapsed: readFlag("rift.collapsed"),
    details: readFlag("rift.details"),
    notes: [],
    lastEnemies: null,
    lastChampSelect: null,
    view: "main",
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
    writeFlag("rift.collapsed", collapsed);
    this.update({ collapsed });
  }

  setDetails(details: boolean) {
    writeFlag("rift.details", details);
    this.update({ details });
  }
}

export const store = new Store();
