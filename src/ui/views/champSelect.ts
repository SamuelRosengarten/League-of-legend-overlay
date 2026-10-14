import type { ChampionIndex } from "../../domain/champions";
import { type MatchView, supportedRole } from "../../domain/match";
import { h } from "../h";
import { ROLE_LABEL, champIcon, notice, slotRow } from "./common";

export function champSelectView(match: MatchView, champs: ChampionIndex, timerPhase: string): HTMLElement {
  const role = supportedRole(match.me);
  const hiddenEnemies = match.enemies.filter((e) => !e.championId).length;
  const me = match.me;

  const hero = h(
    "div",
    { class: "hero" },
    champIcon(me?.championId ?? null, champs, 56),
    h(
      "div",
      null,
      h("div", { class: "hero-title" }, me?.championId ? champs.name(me.championId) : "No champion yet", me?.hovering ? h("span", { class: "tag" }, "hovering") : null),
      h(
        "div",
        { class: "hero-meta" },
        [match.side ? `${match.side === "blue" ? "Blue" : "Red"} side` : null, me?.position ? ROLE_LABEL[me.position] : null, timerPhase.replace("_", " ").toLowerCase()]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    match.side ? h("span", { class: `side side-${match.side}` }, match.side) : null,
  );

  let advisor: HTMLElement;
  if (!me?.championId || me.hovering) {
    advisor = notice("muted", "Lock in Gwen or Amumu", "The matchup advisor starts once your champion is locked.");
  } else if (!role) {
    advisor = notice("muted", `Unsupported champion: ${champs.name(me.championId)}`, "Rift Advisor only covers Gwen (top) and Amumu (jungle).");
  } else {
    advisor = notice("info", `${champs.name(me.championId)} advisor`, "Matchup cards, threat ranking and the jungle path planner arrive in the next steps.");
  }

  return h(
    "section",
    { class: "body scroll" },
    hero,
    advisor,
    h("h3", null, "Enemy team", hiddenEnemies ? h("span", { class: "count" }, `${hiddenEnemies} hidden`) : null),
    h("div", { class: "slots" }, match.enemies.map((s) => slotRow(s, champs))),
    h("h3", null, "Your team"),
    h("div", { class: "slots" }, match.allies.map((s) => slotRow(s, champs))),
  );
}
