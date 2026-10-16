import { backend } from "../bridge";
import { fromChampSelect, fromLive } from "../domain/match";
import { effectiveMotion, normalizeAppearance } from "../theme/appearance";
import { applyTheme, resolveTheme } from "../theme/theme";
import { CompanionLayer } from "./companions/layer";
import { layoutCompanions } from "./companions/layout";
import { Crest } from "./crest";
import { Particles } from "./particles";
import type { UiState } from "./store";
import { champSelectView } from "./views/champSelect";
import { devPanel } from "./views/devPanel";
import { headerContent } from "./views/header";
import { idleView } from "./views/idle";
import { inGameView } from "./views/inGame";
import { settingsView } from "./views/settings";

// The shell is built once. Only the header content and the body are re-rendered on each
// backend event; the crest, frame, particles and companions are persistent so their
// animations never restart.
interface Shell {
  stage: HTMLElement;
  panel: HTMLElement;
  headerSlot: HTMLElement;
  content: HTMLElement;
  crest: Crest;
  particles: Particles;
  companions: CompanionLayer;
}

let shell: Shell | null = null;
let screenKey = "";
/** Mirrors `snapshot.overlay.interactive` for the click guard on the content. */
let interactive = false;
let inGame = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function buildShell(root: HTMLElement): Shell {
  const stage = document.createElement("div");
  stage.className = "stage";
  const panel = document.createElement("main");
  const frame = document.createElement("div");
  frame.className = "frame";
  frame.setAttribute("aria-hidden", "true");
  frame.innerHTML = "<i class='c tl'></i><i class='c tr'></i><i class='c bl'></i><i class='c br'></i><b class='gem'></b><span class='sheen'></span>";
  const particles = new Particles();
  const header = document.createElement("header");
  header.className = "header";
  header.setAttribute("data-tauri-drag-region", "");
  const crest = new Crest();
  const headerSlot = document.createElement("div");
  headerSlot.className = "header-slot";
  headerSlot.setAttribute("data-tauri-drag-region", "");
  header.append(crest.el, headerSlot);
  const content = document.createElement("div");
  content.className = "content";
  // Outside the game the whole panel takes the mouse in click-through mode too, so the wheel
  // scrolls it (see reportHotZone). Clicks on the content still do nothing until interactive.
  content.addEventListener(
    "click",
    (e) => {
      if (interactive) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  // Mode tag on the top border: only shown in interactive mode (CSS), so it is always clear
  // whether clicks go to the overlay or to the game.
  const modeTag = document.createElement("span");
  modeTag.className = "mode-tag";
  modeTag.textContent = "Interactive";
  panel.append(particles.el, frame, modeTag, header, content);
  const companions = new CompanionLayer();
  stage.append(panel, companions.el);
  root.replaceChildren(stage);
  const s = { stage, panel, headerSlot, content, crest, particles, companions };
  // The docked panel resizes with the client window between renders: keep the zone current.
  new ResizeObserver(() => reportHotZone(s, inGame)).observe(panel);
  return s;
}

export function render(root: HTMLElement, state: UiState) {
  const snap = state.snapshot;
  if (!snap) return;
  shell ??= buildShell(root);
  const s = shell;
  const { mode } = snap.overlay;
  interactive = snap.overlay.interactive;
  inGame = mode === "in-game";
  const compact = mode !== "champ-select";
  const collapsed = mode === "in-game" && state.collapsed && state.view === "main";
  const appearance = normalizeAppearance(snap.appearance);

  // Theme + motion on <html>, so everything (including the companion layer) follows.
  const resolved = resolveTheme(appearance, snap.rank);
  applyTheme(resolved.theme);
  const html = document.documentElement;
  html.dataset.motion = effectiveMotion(appearance.motion, { inGame: mode === "in-game", reducedMotion: reducedMotion.matches });
  html.dataset.paused = String(!snap.overlay.visible || document.hidden);

  s.crest.update(resolved.theme, compact);
  s.panel.className = `panel mode-${mode}${snap.overlay.interactive ? " interactive" : ""}${collapsed ? " collapsed" : ""}`;
  const docked = mode === "idle" && snap.overlay.docked;
  s.stage.className = `stage stage-${mode}${docked ? " docked" : ""}`;
  s.headerSlot.replaceChildren(...headerContent(snap, resolved, { collapsible: mode === "in-game", collapsed, details: state.details, view: state.view }));

  let body: HTMLElement | null = null;
  if (state.view === "settings") {
    body = settingsView(appearance, snap.rank, resolved, { compact: compact && !docked });
  } else if (!collapsed) {
    if (mode === "champ-select" && snap.champSelect) {
      body = champSelectView(fromChampSelect(snap.champSelect, state.champions), state.champions, state.data, snap.champSelect.timer.phase);
    } else if (mode === "in-game") {
      const game = snap.live.game;
      const preGame = state.lastChampSelect ? fromChampSelect(state.lastChampSelect, state.champions) : null;
      body = inGameView(game ? fromLive(game, state.champions) : null, snap.live.status, state.champions, state.data, state.notes, preGame, {
        details: state.details,
      });
    } else {
      body = idleView(snap, resolved, state.champions);
    }
  }
  s.content.replaceChildren(...[body, devPanel(state.mock)].filter((x): x is HTMLElement => !!x));

  // Companions: hidden in game unless the user wants them there.
  const showCompanions = mode !== "hidden" && (mode !== "in-game" || appearance.companions.inGame);
  const layout = layoutCompanions(
    showCompanions ? appearance.companions : { ...appearance.companions, gwen: false, amumu: false, fiddlesticks: false, scenes: false },
    window.innerWidth,
    { compact: mode === "in-game", docked, dockedLeft: snap.overlay.dockedLeft },
  );
  s.stage.style.setProperty("--gutter-top", `${layout.gutterTop}px`);
  s.stage.style.setProperty("--gutter-bottom", `${layout.gutterBottom}px`);
  s.stage.style.setProperty("--gutter-right", `${layout.gutterRight}px`);
  s.stage.style.setProperty("--gutter-left", `${layout.gutterLeft}px`);
  s.companions.update(layout, { scenes: showCompanions && appearance.companions.scenes });
  s.particles.update(html.dataset.motion === "full" && mode !== "in-game", resolved.theme.prestige);

  // Screen changes (mode, settings, collapse) get a short fade and a companion hop.
  const key = `${mode}|${state.view}|${collapsed}|${state.details}|${docked}`;
  if (screenKey && key !== screenKey) {
    s.content.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" });
    s.companions.react();
  }
  screenKey = key;

  if (compact && !docked) reportHeight(s, layout.gutterTop + layout.gutterBottom);
  reportHotZone(s, inGame);
}

let lastHotZone = "";
/**
 * The area Rust makes clickable in click-through mode while the cursor is over it.
 * - In game: only the header buttons (League keeps hotkeys from reaching the overlay while
 *   the game has focus, so they must work by mouse), never the rest of the panel.
 * - Elsewhere: the whole panel, so the wheel scrolls it without interactive mode.
 */
function reportHotZone(s: Shell, inGame: boolean) {
  const buttons = [...s.panel.querySelectorAll<HTMLElement>(".header .btn-icon")].map((b) => b.getBoundingClientRect());
  const pad = 4;
  const panel = s.panel.getBoundingClientRect();
  const zone = !inGame
    ? { x: panel.left, y: panel.top, w: panel.width, h: panel.height }
    : buttons.length
    ? {
        x: Math.min(...buttons.map((r) => r.left)) - pad,
        y: Math.min(...buttons.map((r) => r.top)) - pad,
        w: Math.max(...buttons.map((r) => r.right)) - Math.min(...buttons.map((r) => r.left)) + 2 * pad,
        h: Math.max(...buttons.map((r) => r.bottom)) - Math.min(...buttons.map((r) => r.top)) + 2 * pad,
      }
    : null;
  const key = JSON.stringify(zone);
  if (key !== lastHotZone) {
    lastHotZone = key;
    void backend.setHotZone(zone);
  }
}

let lastHeight = 0;
/**
 * Compact panels hug their content: tell Rust the natural height (incl. companion gutters).
 * Measured from scrollHeight, so a panel capped at the screen height still reports what it
 * needs (Rust clamps the window to the monitor and the content scrolls).
 */
function reportHeight(s: Shell, gutters: number) {
  const header = s.panel.querySelector(".header") as HTMLElement;
  const height = Math.ceil(header.offsetHeight + s.content.scrollHeight + gutters) + 4;
  if (Math.abs(height - lastHeight) >= 2) {
    lastHeight = height;
    void backend.fitContent(height);
  }
}
