import { backend } from "../../bridge";
import type { ConnectionStatus, Snapshot } from "../../types";
import { h } from "../h";
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

export function header(snap: Snapshot, opts: { collapsible: boolean }): HTMLElement {
  const [tone, label] = connectionLabel(snap.connection);
  const { overlay } = snap;
  const collapsed = store.state.collapsed;
  return h(
    "header",
    { class: "header", "data-tauri-drag-region": true },
    h("span", { class: "brand", "data-tauri-drag-region": true }, "Rift Advisor"),
    h("span", { class: `pill pill-${tone}`, title: label }, label),
    h("span", { class: "spacer", "data-tauri-drag-region": true }),
    h(
      "button",
      {
        class: `pill pill-btn${overlay.interactive ? " pill-on" : ""}`,
        title: `Toggle with ${overlay.hotkeys.toggleInteractive}`,
        onclick: () => backend.setInteractive(!overlay.interactive),
      },
      overlay.interactive ? "Interactive" : `Click-through · ${overlay.hotkeys.toggleInteractive}`,
    ),
    opts.collapsible
      ? h(
          "button",
          { class: "icon-btn", title: collapsed ? "Expand" : "Collapse", onclick: () => store.setCollapsed(!collapsed) },
          collapsed ? "▾" : "▴",
        )
      : null,
  );
}
