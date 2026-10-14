import type { ChampionIndex } from "../../domain/champions";
import { type MatchView, formatGameTime, supportedRole } from "../../domain/match";
import type { LiveStatus } from "../../types";
import { h } from "../h";
import { notice, slotRow } from "./common";

export function inGameView(match: MatchView | null, status: LiveStatus, champs: ChampionIndex): HTMLElement {
  if (!match) {
    const msg =
      status.state === "unreachable"
        ? notice("warn", "Live Client API unreachable", `${status.message}. Make sure the game runs in Borderless mode.`)
        : notice("muted", "Loading screen…", "Waiting for the Live Client Data API (starts once the game has loaded).");
    return h("section", { class: "body" }, msg);
  }
  const role = supportedRole(match.me);
  const items = (names: string[]) => (names.length ? h("div", { class: "items" }, names.join(", ")) : null);
  return h(
    "section",
    { class: "body" },
    h(
      "div",
      { class: "row" },
      h("span", { class: "clock" }, formatGameTime(match.gameTime ?? 0)),
      h("span", { class: "muted" }, role ? `${champs.name(match.me?.championId ?? null)} · ${role}` : "Unsupported champion"),
    ),
    role ? null : notice("muted", "Advisor inactive", "Rift Advisor only covers Gwen (top) and Amumu (jungle)."),
    h("h3", null, "Enemies"),
    h(
      "div",
      { class: "slots compact" },
      match.enemies.map((s) => slotRow(s, champs, items(s.items.map((i) => i.name)))),
    ),
  );
}
