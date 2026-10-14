import type { ChampionIndex } from "../../domain/champions";
import type { BuffSide } from "../../data/types";
import { type JunglePlan, type LaneStatus, type MapLane, type PathOption, campLabel, laneForBuffSide } from "../../domain/pathPlanner";
import { h } from "../h";

const LANE_LABEL: Record<MapLane, string> = { top: "Top", mid: "Mid", bot: "Bot" };
const STATUS_LABEL: Record<LaneStatus, string> = { priority: "priority", even: "even", losing: "losing", unknown: "?" };

function laneChips(plan: JunglePlan): HTMLElement {
  return h(
    "div",
    { class: "lanes" },
    (["top", "mid", "bot"] as const).map((lane) => {
      const l = plan.lanes[lane];
      return h("span", { class: `lane lane-${l.status}`, title: l.reason }, h("small", null, LANE_LABEL[lane]), STATUS_LABEL[l.status]);
    }),
  );
}

function campChain(option: PathOption, plan: JunglePlan): HTMLElement {
  return h(
    "div",
    { class: "camps" },
    option.path.clear.map((c, i) => [
      i > 0 ? h("span", { class: "arrow" }, "→") : null,
      h("span", { class: i === 0 ? "camp start" : "camp", title: i === 0 ? "Start camp" : undefined }, h("b", null, String(i + 1)), " ", campLabel(c, plan.side)),
    ]),
  );
}

function firstGankLine(option: PathOption): HTMLElement {
  if (!option.firstGank) return h("div", { class: "muted" }, "No early gank planned — keep farming.");
  return h("div", null, h("b", null, "First gank: "), `${LANE_LABEL[option.firstGank]} lane after the clear`);
}

/** Curated reasons name buff sides; show the actual map side for this game instead. */
function localize(text: string, side: JunglePlan["side"]): string {
  return text.replace(/\b(blue|red)-buff side\b/g, (_, buff: string) => `${laneForBuffSide(`${buff}-buff-side` as BuffSide, side)} side`);
}

function reasons(option: PathOption, side: JunglePlan["side"]): HTMLElement | null {
  if (!option.applied.length) return h("div", { class: "muted small" }, "No conditions matched — default preference (full clears are the safe default).");
  return h(
    "ul",
    { class: "path-reasons" },
    option.applied.map((a) =>
      h("li", { class: a.kind === "favor" ? "pro" : "con" }, `${a.kind === "favor" ? "+" : "−"}${a.rule.weight} `, localize(a.rule.reason, side)),
    ),
  );
}

function invade(plan: JunglePlan, champs: ChampionIndex): HTMLElement | null {
  const jg = plan.enemyJungler;
  if (!jg.championId) return h("div", { class: "muted small" }, "Enemy jungler not revealed yet — invade risk unknown.");
  if (!plan.invadeWarning) return h("div", { class: "muted small" }, `${champs.name(jg.championId)}: low invade risk.`);
  return h("div", { class: `warning warning-${jg.invadeRisk === "high" ? "warn" : "info"}` }, h("b", null, `Invade risk ${jg.invadeRisk}: `), plan.invadeWarning);
}

export function pathCard(plan: JunglePlan, champs: ChampionIndex, opts: { compact?: boolean } = {}): HTMLElement {
  const best = plan.recommended;
  const head = h(
    "div",
    { class: "card-head" },
    h("div", { class: "grow" }, h("div", { class: "card-title" }, "Jungle path"), h("div", { class: "muted" }, best.path.name)),
    h("span", { class: `badge badge-${best.path.confidence}`, title: "Curated path confidence" }, `≈ ${best.path.approxFinish}`),
  );
  if (opts.compact) {
    return h("div", { class: "card compact-card" }, head, campChain(best, plan), firstGankLine(best), invade(plan, champs));
  }
  const others = plan.options.slice(1);
  return h(
    "div",
    { class: "card" },
    head,
    laneChips(plan),
    campChain(best, plan),
    firstGankLine(best),
    h("div", { class: "card-section" }, h("h4", null, `Why (score ${best.score})`), reasons(best, plan.side)),
    invade(plan, champs),
    others.length
      ? h(
          "div",
          { class: "card-section" },
          h("h4", null, "Other options"),
          h(
            "ul",
            null,
            others.map((o) =>
              h(
                "li",
                { title: o.applied.map((a) => `${a.kind === "favor" ? "+" : "−"}${a.rule.weight} ${localize(a.rule.reason, plan.side)}`).join("\n") || "no conditions matched" },
                `${o.path.name} `,
                h("span", { class: "muted" }, `(score ${o.score})`),
              ),
            ),
          ),
        )
      : null,
  );
}

/** After the first 90 s of game the plan collapses to one line. */
export function pathSummary(plan: JunglePlan): HTMLElement {
  return h("div", { class: "path-summary muted" }, `Jungle plan: ${plan.recommended.path.name}`);
}
