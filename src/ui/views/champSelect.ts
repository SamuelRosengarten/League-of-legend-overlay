import type { CuratedData } from "../../data";
import { buildAdvice } from "../../domain/advisor";
import type { ChampionIndex } from "../../domain/champions";
import type { MatchView } from "../../domain/match";
import { h } from "../h";
import { adviceStatus, laneCard, threatList, warningsList } from "./advisor";
import { ROLE_LABEL, champIcon, notice } from "./common";
import { pathCard } from "./jungle";

export function champSelectView(match: MatchView, champs: ChampionIndex, data: CuratedData, timerPhase: string): HTMLElement {
  const me = match.me;
  const advice = buildAdvice(match, champs, data);
  const ok = advice.status === "ok" ? advice : null;

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
        [match.side ? `${match.side === "blue" ? "Blue" : "Red"} side` : null, ok ? ROLE_LABEL[ok.role] : null, timerPhase.replace("_", " ").toLowerCase()]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    match.side ? h("span", { class: `side side-${match.side}` }, match.side) : null,
  );

  const dataErrors = data.issues.filter((i) => i.severity === "error");
  const body: (HTMLElement | null)[] = [
    hero,
    dataErrors.length ? notice("warn", "Some curated data failed validation", `${dataErrors.length} problem(s) — affected files are ignored. Run npm run validate:data.`) : null,
    adviceStatus(advice, champs),
  ];

  if (ok) {
    // Ranking + warnings first: in click-through mode the panel can't be scrolled, so the
    // long matchup card goes last (scroll it in interactive mode).
    body.push(
      warningsList(ok.warnings),
      ok.plan ? pathCard(ok.plan, champs) : null,
      h("h3", null, "Threat ranking", h("span", { class: "count" }, `vs ${champs.name(ok.me)}`)),
      threatList(ok.threats.ranked, ok.threats.hidden, champs),
      laneCard(ok, champs),
    );
  } else {
    body.push(
      h("h3", null, "Enemy team"),
      h("div", { class: "team-row" }, match.enemies.map((s) => champIcon(s.championId, champs, 34))),
    );
  }

  body.push(
    h("h3", null, "Your team"),
    h(
      "div",
      { class: "team-row" },
      match.allies.map((s, i) => {
        const role = ok?.allyRoles[i]?.role ?? s.position;
        return h("div", { class: `ally${s.isMe ? " ally-me" : ""}`, title: s.championId ? champs.name(s.championId) : "Not picked" }, champIcon(s.championId, champs, 34), h("small", null, role ? ROLE_LABEL[role] : "?"));
      }),
    ),
  );
  return h("section", { class: "body scroll" }, body);
}
