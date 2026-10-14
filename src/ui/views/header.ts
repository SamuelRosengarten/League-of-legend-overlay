import { backend } from "../../bridge";
import type { ResolvedTheme } from "../../theme/theme";
import { rankLabel } from "../../theme/theme";
import type { ConnectionStatus, Snapshot } from "../../types";
import { h } from "../h";
import { icon } from "../icons";
import { store } from "../store";

function connectionLabel(c: ConnectionStatus): [string, string] {
  switch (c.state) {
    case "mock":
      return ["mock", "Mock data"];
    case "connected":
      return ["ok", c.transport === "websocket" ? "Client connected" : "Client connected (polling)"];
    case "connecting":
      return ["pending", "Connecting…"];
    case "api-unreachable":
      return ["bad", "Client API unreachable"];
    case "client-not-running":
      return ["bad", "Client not running"];
  }
}

/** "Ctrl+Shift+Z" → "Ctrl⇧Z": fits the narrow in-game header (full text in the tooltip). */
export function shortHotkey(hotkey: string): string {
  return hotkey.replace(/\bShift\b/i, "⇧").replace(/\+/g, "");
}

/** Second header line: the rank (or the manual theme), never a guessed rank. */
function rankLine(snap: Snapshot, resolved: ResolvedTheme): HTMLElement {
  const r = snap.rank;
  if (resolved.source === "manual") {
    return h("div", { class: "rank-line", "data-tauri-drag-region": true }, h("b", null, resolved.theme.label), " theme");
  }
  const lp = r && r.tier !== "unranked" ? `${r.leaguePoints} LP` : null;
  return h(
    "div",
    { class: "rank-line", "data-tauri-drag-region": true, title: r?.source === "cached" ? "Last rank reported by the client (client not connected)" : undefined },
    h("b", null, rankLabel(r)),
    lp ? ` · ${lp}` : null,
    r?.source === "cached" ? h("span", { class: "muted" }, " · last known") : null,
  );
}

export function headerContent(
  snap: Snapshot,
  resolved: ResolvedTheme,
  opts: { collapsible: boolean; collapsed: boolean; view: "main" | "settings" },
): HTMLElement[] {
  const [tone, label] = connectionLabel(snap.connection);
  const { overlay } = snap;
  const settings = opts.view === "settings";
  return [
    h("div", { class: "title", "data-tauri-drag-region": true }, h("div", { class: "brand", "data-tauri-drag-region": true }, "Rift Advisor"), rankLine(snap, resolved)),
    h("span", { class: `status status-${tone}`, title: label }, h("i", { class: "status-dot" }), h("span", { class: "status-text" }, label)),
    h("span", { class: "spacer", "data-tauri-drag-region": true }),
    h(
      "button",
      {
        class: `btn-icon${settings ? " on" : ""}`,
        title: settings ? "Back" : "Appearance — rank theme & companions",
        "aria-label": settings ? "Back" : "Appearance",
        onclick: () => store.update({ view: settings ? "main" : "settings" }),
      },
      icon(settings ? "back" : "gear", 15),
    ),
    h(
      "button",
      {
        class: `btn-icon${overlay.interactive ? " on" : " btn-kbd"}`,
        title: overlay.interactive
          ? `Interactive — clicks go to the overlay (${overlay.hotkeys.toggleInteractive} for click-through)`
          : `Click-through — ${overlay.hotkeys.toggleInteractive} to interact`,
        "aria-label": "Toggle interactive mode",
        onclick: () => backend.setInteractive(!overlay.interactive),
      },
      icon(overlay.interactive ? "pointer" : "ghost", 15),
      // Tooltips can't be hovered in click-through mode, so the hotkey stays visible.
      overlay.interactive ? null : h("kbd", null, shortHotkey(overlay.hotkeys.toggleInteractive)),
    ),
    opts.collapsible && !settings
      ? h(
          "button",
          { class: "btn-icon", title: opts.collapsed ? "Expand" : "Collapse", "aria-label": opts.collapsed ? "Expand" : "Collapse", onclick: () => store.setCollapsed(!opts.collapsed) },
          icon(opts.collapsed ? "chevronDown" : "chevronUp", 15),
        )
      : null,
  ].filter((x): x is HTMLElement => !!x);
}
