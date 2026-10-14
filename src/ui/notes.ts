// Keeps the in-game note feed in sync with Live Client snapshots.
import { buildAdvice } from "../domain/advisor";
import { diffNotes } from "../domain/gameNotes";
import { fromLive } from "../domain/match";
import type { LivePayload } from "../types";
import type { UiState } from "./store";

const MAX_NOTES = 20;

export function notesPatch(state: UiState, live: LivePayload): Partial<UiState> {
  if (!live.game) {
    // Game over / not started: next game starts with a clean feed.
    return state.lastEnemies || state.notes.length ? { notes: [], lastEnemies: null } : {};
  }
  const match = fromLive(live.game, state.champions);
  if (!match) return {};
  const advice = buildAdvice(match, state.champions, state.data);
  if (advice.status !== "ok") return {};

  const enemies = match.enemies
    .filter((e): e is typeof e & { championId: string } => !!e.championId)
    .map((e) => ({ championId: e.championId, level: e.level, items: e.items }));
  const fresh = diffNotes(state.lastEnemies, enemies, {
    me: advice.me,
    matchups: advice.data,
    counters: state.data.items,
    laneOpponent: advice.laneOpponent?.championId ?? null,
    time: match.gameTime ?? 0,
    name: (id) => state.champions.name(id),
  });
  const seen = new Set(state.notes.map((n) => n.key));
  const notes = [...state.notes, ...fresh.filter((n) => !seen.has(n.key))].slice(-MAX_NOTES);
  return { notes, lastEnemies: enemies };
}
