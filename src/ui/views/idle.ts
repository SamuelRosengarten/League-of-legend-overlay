import type { Snapshot } from "../../types";
import { h } from "../h";
import { notice } from "./common";

export function idleView(snap: Snapshot): HTMLElement {
  const c = snap.connection;
  const hide = snap.overlay.hotkeys.toggleVisibility;
  let body: HTMLElement;
  switch (c.state) {
    case "client-not-running":
      body = notice("muted", "League client not running", "Start League of Legends — Rift Advisor connects automatically.");
      break;
    case "connecting":
      body = notice("muted", "Connecting to the League client…");
      break;
    case "api-unreachable":
      body = notice("warn", "Client found, but its API is not answering", `${c.message}. Retrying every few seconds.`);
      break;
    default:
      body = notice("info", "Waiting for champ select", `Phase: ${snap.phase}. The advisor opens automatically when you enter champ select.`);
  }
  return h("section", { class: "body" }, body, h("p", { class: "hint" }, `${hide} hides/shows this overlay.`));
}
