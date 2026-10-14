import type { Advice, LaneOpponent } from "../../domain/advisor";
import type { ChampionIndex } from "../../domain/champions";
import type { GameNote } from "../../domain/gameNotes";
import { formatGameTime } from "../../domain/match";
import type { Threat, ThreatReason } from "../../domain/threat";
import type { TeamWarning } from "../../domain/warnings";
import type { Confidence, Phase } from "../../data/types";
import { h } from "../h";
import { ROLE_LABEL, champIcon, notice } from "./common";

type OkAdvice = Extract<Advice, { status: "ok" }>;

/** Notice for every non-ok advisor state (graceful states). */
export function adviceStatus(advice: Advice, champs: ChampionIndex): HTMLElement | null {
  switch (advice.status) {
    case "no-champion":
      return notice("muted", "Lock in Gwen or Amumu", "The matchup advisor starts once your champion is locked.");
    case "unsupported":
      return notice("muted", `Unsupported champion: ${champs.name(advice.championId)}`, "Rift Advisor only covers Gwen (top) and Amumu (jungle).");
    case "missing-data":
      return notice("warn", `Matchup data for ${champs.name(advice.championId)} is missing or invalid`, "Run `npm run validate:data` to see what is wrong.");
    case "ok":
      return null;
  }
}

function lowMark(confidence: Confidence | undefined): HTMLElement | null {
  return confidence === "low" ? h("span", { class: "low", title: "Low confidence — please review this line" }, "?") : null;
}

function difficultyDots(difficulty: number): HTMLElement {
  return h(
    "span",
    { class: "dots", title: `Difficulty ${difficulty}/5` },
    [1, 2, 3, 4, 5].map((i) => h("span", { class: i <= difficulty ? "dot on" : "dot" })),
  );
}

const PHASE_LABEL: Record<Phase, string> = { me: "you", them: "them", even: "even" };

function phaseRow(p: { early: Phase; mid: Phase; late: Phase }): HTMLElement {
  return h(
    "div",
    { class: "phases" },
    (["early", "mid", "late"] as const).map((k) => h("span", { class: `phase phase-${p[k]}` }, h("small", null, k), PHASE_LABEL[p[k]])),
  );
}

function section(title: string, items: (HTMLElement | null)[]): HTMLElement | null {
  const content = items.filter((i): i is HTMLElement => !!i);
  return content.length ? h("div", { class: "card-section" }, h("h4", null, title), h("ul", null, content)) : null;
}

export function laneCard(advice: OkAdvice, champs: ChampionIndex, opts: { compact?: boolean } = {}): HTMLElement {
  const opp = advice.laneOpponent;
  const what = advice.role === "jungle" ? "Enemy jungler" : `Lane opponent (${ROLE_LABEL[advice.role]})`;
  if (!opp || !opp.championId) {
    return h("div", { class: "card" }, h("div", { class: "card-head" }, champIcon(null, champs, 40), h("div", null, h("div", { class: "card-title" }, what), h("div", { class: "muted" }, "Not revealed yet — the card fills in when they lock."))));
  }
  const head = h(
    "div",
    { class: "card-head" },
    champIcon(opp.championId, champs, 40),
    h(
      "div",
      { class: "grow" },
      h("div", { class: "card-title" }, `vs ${champs.name(opp.championId)}`, opp.entry ? difficultyDots(opp.entry.difficulty) : null),
      h("div", { class: "muted" }, `${what} · ${roleSourceLabel(opp)}`),
    ),
    confidenceBadge(opp),
  );
  if (!opp.entry) return uncuratedCard(head, opp, opts);

  const e = opp.entry;
  if (opts.compact) {
    return h("div", { class: "card compact-card" }, head, section("Key tips", e.tips.slice(0, 3).map((t) => h("li", null, t.text, lowMark(t.confidence)))));
  }
  return h(
    "div",
    { class: "card" },
    head,
    phaseRow(e.phaseAdvantage),
    section("Watch out for", e.dangerAbilities.map((a) => h("li", null, h("b", { class: "key" }, a.key), h("b", null, a.name), ` — ${a.note}`, lowMark(a.confidence)))),
    section("Power spikes", e.powerSpikes.map((s) => h("li", null, h("b", null, s.kind === "level" ? `Lv ${s.level}` : s.kind === "item" ? "Item" : "Spike"), ` ${s.note}`, lowMark(s.confidence)))),
    section("How to beat them", e.tips.map((t) => h("li", null, t.text, lowMark(t.confidence)))),
    section("Items", e.itemAdjustments.map((i) => h("li", null, h("b", null, i.name), ` — ${i.note}`, lowMark(i.confidence)))),
    section("Runes", e.runeAdjustments.map((r) => h("li", null, h("b", null, r.rune), ` — ${r.note}`, lowMark(r.confidence)))),
    e.reviewNotes ? h("p", { class: "review" }, `Review: ${e.reviewNotes}`) : null,
  );
}

function uncuratedCard(head: HTMLElement, opp: LaneOpponent, opts: { compact?: boolean }): HTMLElement {
  const p = opp.profile?.profile;
  const summary = p ? `${p.range} · ${p.damage} damage · ${["", "weak", "average", "strong"][p.earlyGame]} early` : "No profile for this champion.";
  return h(
    "div",
    { class: "card" },
    head,
    h("div", { class: "muted" }, summary),
    section(
      opts.compact ? "Key tips" : "Generic advice (from their tags)",
      opp.genericTips.slice(0, opts.compact ? 3 : 4).map((t) => h("li", null, h("span", { class: "chip" }, t.tag), " ", t.text)),
    ) ?? h("div", { class: "muted" }, "No generic advice matches their tags."),
  );
}

function roleSourceLabel(opp: LaneOpponent): string {
  return opp.assignment.source === "api" ? "role from client" : "role inferred";
}

function confidenceBadge(opp: LaneOpponent): HTMLElement {
  if (!opp.entry) return h("span", { class: "badge badge-uncurated", title: "No curated entry: generic tag-based advice" }, "uncurated");
  const { confidence, lastReviewedPatch } = opp.entry;
  const label = lastReviewedPatch === "draft" ? `draft · ${confidence}` : `${lastReviewedPatch} · ${confidence}`;
  return h("span", { class: `badge badge-${confidence}`, title: "Patch last reviewed · author confidence" }, label);
}

function reasonChip(r: ThreatReason): HTMLElement {
  const via = r.via?.map((v) => (v.source === "item" ? `item: ${v.detail}` : v.source)).join(", ");
  const title = r.kind === "tag" ? `+${r.points} from tag "${r.tag}" (${via})` : `+${r.points} ${r.label}`;
  const fromItem = r.via?.some((v) => v.source === "item");
  return h("span", { class: `chip chip-${r.kind}${fromItem ? " chip-item" : ""}`, title }, r.kind === "tag" ? r.label : r.label, h("small", null, ` +${r.points}`));
}

export function threatList(threats: Threat[], hidden: number, champs: ChampionIndex, opts: { limit?: number; compact?: boolean } = {}): HTMLElement {
  const shown = threats.slice(0, opts.limit ?? threats.length);
  return h(
    "div",
    { class: "threats" },
    shown.map((t, rank) =>
      h(
        "div",
        { class: `threat${opts.compact ? " threat-compact" : ""}` },
        h("span", { class: "rank" }, String(rank + 1)),
        champIcon(t.championId, champs, opts.compact ? 30 : 34),
        h(
          "div",
          { class: "grow" },
          h("div", { class: "threat-name" }, champs.name(t.championId), t.role ? h("span", { class: "muted" }, ROLE_LABEL[t.role]) : null),
          h("div", { class: "chips" }, (opts.compact ? topReasons(t.reasons, 3) : t.reasons).map(reasonChip)),
        ),
        h("span", { class: "score", title: "Threat score = sum of the chips" }, t.score.toFixed(1)),
      ),
    ),
    hidden ? h("div", { class: "muted hidden-note" }, `${hidden} enemy pick${hidden > 1 ? "s" : ""} not revealed yet — ranking updates live.`) : null,
  );
}

function topReasons(reasons: ThreatReason[], n: number): ThreatReason[] {
  const items = reasons.filter((r) => r.via?.some((v) => v.source === "item"));
  const rest = [...reasons].filter((r) => !items.includes(r)).sort((a, b) => b.points - a.points);
  return [...items, ...rest].slice(0, n);
}

export function warningsList(warnings: TeamWarning[]): HTMLElement | null {
  if (!warnings.length) return null;
  return h("div", { class: "warnings" }, warnings.map((w) => h("div", { class: `warning warning-${w.level}` }, w.text)));
}

export function notesFeed(notes: GameNote[], champs: ChampionIndex): HTMLElement | null {
  if (!notes.length) return null;
  return h(
    "div",
    { class: "notes" },
    notes.map((n) => h("div", { class: `note note-${n.kind}` }, champIcon(n.championId, champs, 20), h("span", { class: "clock" }, formatGameTime(n.time)), h("span", null, n.text))),
  );
}
