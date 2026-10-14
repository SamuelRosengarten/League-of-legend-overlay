import { backend } from "../bridge";
import { fromChampSelect, fromLive } from "../domain/match";
import { h } from "./h";
import type { UiState } from "./store";
import { champSelectView } from "./views/champSelect";
import { devPanel } from "./views/devPanel";
import { header } from "./views/header";
import { idleView } from "./views/idle";
import { inGameView } from "./views/inGame";

export function render(root: HTMLElement, state: UiState) {
  const snap = state.snapshot;
  if (!snap) return;
  const { mode } = snap.overlay;
  const compact = mode !== "champ-select";
  const collapsed = mode === "in-game" && state.collapsed;

  let body: HTMLElement | null = null;
  if (!collapsed) {
    if (mode === "champ-select" && snap.champSelect) {
      body = champSelectView(fromChampSelect(snap.champSelect, state.champions), state.champions, snap.champSelect.timer.phase);
    } else if (mode === "in-game") {
      const game = snap.live.game;
      body = inGameView(game ? fromLive(game, state.champions) : null, snap.live.status, state.champions);
    } else {
      body = idleView(snap);
    }
  }

  const panel = h(
    "main",
    { class: `panel mode-${mode}${snap.overlay.interactive ? " interactive" : ""}` },
    header(snap, { collapsible: mode === "in-game" }),
    body,
    devPanel(state.mock),
  );
  root.replaceChildren(panel);

  if (compact) reportHeight(panel);
}

let lastHeight = 0;
/** Compact panels hug their content: tell Rust the height so it can resize + re-clamp. */
function reportHeight(panel: HTMLElement) {
  const height = Math.ceil(panel.getBoundingClientRect().height) + 2;
  if (Math.abs(height - lastHeight) >= 2) {
    lastHeight = height;
    void backend.fitContent(height);
  }
}
