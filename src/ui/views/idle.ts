import type { ResolvedTheme } from "../../theme/theme";
import type { Snapshot } from "../../types";
import { h } from "../h";
import { notice } from "./common";
import { rankShowcase } from "./rank";

export function idleView(snap: Snapshot, resolved: ResolvedTheme): HTMLElement {
  const c = snap.connection;
  let status: HTMLElement;
  switch (c.state) {
    case "client-not-running":
      status = notice("muted", "League client not running", "Start League of Legends — Rift Advisor connects automatically.");
      break;
    case "connecting":
      status = notice("muted", "Connecting to the League client…");
      break;
    case "api-unreachable":
      status = notice("warn", "Client found, but its API is not answering", `${c.message}. Retrying every few seconds.`);
      break;
    default:
      status = notice("info", "Waiting for champ select", `Phase: ${snap.phase}. The advisor opens automatically when you enter champ select.`);
  }
  return h("section", { class: "body" }, rankShowcase(snap.rank, resolved, { compact: true }), status);
}
