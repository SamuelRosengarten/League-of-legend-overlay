import { THEMES, isThemeId } from "../../theme/ranks";
import type { ResolvedTheme } from "../../theme/theme";
import type { RankInfo } from "../../types";
import { crestArt } from "../crest";
import { h } from "../h";

/**
 * Re-rendered elements would restart their CSS animation on every backend event; a negative
 * delay keyed to the page clock makes the restart invisible.
 */
export function steady<T extends HTMLElement>(el: T, periodMs: number): T {
  el.style.animationDelay = `-${Math.round(performance.now() % periodMs)}ms`;
  return el;
}

const SOURCE_NOTE: Record<ResolvedTheme["source"], string> = {
  client: "Live from the League client",
  cached: "Last rank the client reported — client not connected",
  mock: "Mock rank (RIFT_MOCK_RANK)",
  manual: "Theme chosen manually",
  none: "Rank not available yet — connect the League client or pick a theme",
};

/** Big crest + tier + LP progress, for the idle screen and the appearance view. */
export function rankShowcase(rank: RankInfo | null, resolved: ResolvedTheme, opts: { compact?: boolean } = {}): HTMLElement {
  const theme = resolved.theme;
  const real = rank && isThemeId(rank.tier) && rank.tier !== "unranked" ? rank : null;
  const apex = real && ["master", "grandmaster", "challenger"].includes(real.tier);
  const crest = steady(h("div", { class: "showcase-crest" }, h("span", { class: "showcase-halo" }), crestArt(theme)), 6000);

  let title: (HTMLElement | string)[];
  let detail: HTMLElement | null = null;
  if (resolved.source === "manual") {
    title = [h("span", { class: "tier-name" }, theme.label), " theme"];
    detail = real ? h("div", { class: "muted small" }, `Your rank: ${THEMES[real.tier as keyof typeof THEMES].label} ${real.division ?? ""} · ${real.leaguePoints} LP`) : null;
  } else if (real) {
    title = [h("span", { class: "tier-name" }, theme.label), real.division ? h("span", { class: "division" }, real.division) : ""];
    const games = real.wins + real.losses;
    detail = h(
      "div",
      { class: "showcase-stats" },
      apex
        ? h("div", { class: "lp-apex" }, h("b", null, String(real.leaguePoints)), " LP")
        : h(
            "div",
            { class: "lp", title: `${real.leaguePoints} / 100 LP` },
            h("div", { class: "lp-bar" }, steady(h("span", { class: "lp-fill", style: `width:${Math.min(100, Math.max(2, real.leaguePoints))}%` }), 3200)),
            h("div", { class: "lp-label" }, h("b", null, String(real.leaguePoints)), " LP"),
          ),
      games ? h("div", { class: "wl" }, h("span", { class: "win" }, `${real.wins}W`), h("span", { class: "loss" }, `${real.losses}L`), h("span", { class: "muted" }, `${Math.round((real.wins / games) * 100)}%`)) : null,
      h("div", { class: "muted small" }, real.queue === "flex" ? "Ranked Flex" : "Ranked Solo/Duo"),
    );
  } else {
    title = [h("span", { class: "tier-name" }, "Unranked")];
    detail = rank?.provisionalGamesRemaining
      ? h("div", { class: "muted small" }, `${rank.provisionalGamesRemaining} placement game${rank.provisionalGamesRemaining > 1 ? "s" : ""} left this season`)
      : null;
  }

  return h(
    "div",
    { class: `showcase${opts.compact ? " showcase-compact" : ""}` },
    crest,
    h("div", { class: "showcase-body" }, h("div", { class: "showcase-title" }, title), detail, h("div", { class: "source-note" }, SOURCE_NOTE[resolved.source])),
  );
}
