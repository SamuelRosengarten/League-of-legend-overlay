import type { CuratedData } from "../../data";
import { buildAdvice } from "../../domain/advisor";
import type { ChampionIndex } from "../../domain/champions";
import type { GameNote } from "../../domain/gameNotes";
import { type MatchView, formatGameTime } from "../../domain/match";
import type { LiveStatus } from "../../types";
import { h } from "../h";
import { icon } from "../icons";
import { adviceStatus, laneCard, notesFeed, threatList } from "./advisor";
import { heading, notice } from "./common";
import { pathCard, pathSummary } from "./jungle";

/** The jungle plan stays expanded on the loading screen and for the first 90 s of game time. */
export const PATH_VISIBLE_UNTIL = 90;

export function inGameView(
  match: MatchView | null,
  status: LiveStatus,
  champs: ChampionIndex,
  data: CuratedData,
  notes: GameNote[],
  /** Last champ-select view, to keep showing the plan during the loading screen. */
  preGame: MatchView | null,
  /** Off: one glanceable line per threat and two short tips (the in-game default). */
  opts: { details: boolean } = { details: false },
): HTMLElement {
  if (!match) {
    const msg =
      status.state === "unreachable"
        ? notice("warn", "Live Client API unreachable", `${status.message}. Make sure the game runs in Borderless mode.`)
        : notice("muted", "Loading screen…", "Waiting for the Live Client Data API (starts once the game has loaded).");
    const pre = preGame ? buildAdvice(preGame, champs, data) : null;
    const plan = pre?.status === "ok" ? pre.plan : null;
    return h("section", { class: "body" }, msg, plan ? pathCard(plan, champs, { compact: true }) : null);
  }
  const advice = buildAdvice(match, champs, data);
  const clock = h(
    "div",
    { class: "game-bar" },
    h("span", { class: "clock" }, icon("clock", 13), formatGameTime(match.gameTime ?? 0)),
    advice.status === "ok" ? h("span", { class: "muted" }, `${champs.name(advice.me)} · ${match.side === "red" ? "red" : "blue"} side`) : null,
  );
  if (advice.status !== "ok") return h("section", { class: "body" }, clock, adviceStatus(advice, champs));

  const plan = advice.plan
    ? (match.gameTime ?? 0) < PATH_VISIBLE_UNTIL
      ? pathCard(advice.plan, champs, { compact: true })
      : pathSummary(advice.plan)
    : null;
  return h(
    "section",
    { class: "body" },
    clock,
    plan,
    heading("Top threats"),
    threatList(advice.threats.ranked, advice.threats.hidden, champs, { limit: 3, compact: true, oneLine: !opts.details }),
    laneCard(advice, champs, { compact: true, brief: !opts.details }),
    notesFeed(notes.slice(opts.details ? -3 : -2).reverse(), champs),
  );
}
