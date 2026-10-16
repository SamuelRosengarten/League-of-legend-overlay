// The panel docked to the League client (between games): last-game recap and the player's
// own Gwen / Fiddlesticks / Amumu numbers, so they don't have to dig through the client's profile tabs.
import type { ChampionIndex } from "../../domain/champions";
import { AMUMU_KEY, type ChampStats, FIDDLESTICKS_KEY, GWEN_KEY, type Rates, type Recap, champStats, lastGameRecap, queueName, timeAgo } from "../../domain/stats";
import type { History } from "../../types";
import { h } from "../h";
import { champIcon, heading, notice } from "./common";

const fixed = (n: number, digits = 1) => n.toFixed(digits);
const thousands = (n: number) => (n >= 10_000 ? `${fixed(n / 1000)}k` : Math.round(n).toLocaleString("en-US"));

/** One stat tile; with `usual`, an arrow says whether this game was above or below it. */
function stat(label: string, value: string, now?: number, usual?: number): HTMLElement {
  let delta: HTMLElement | null = null;
  if (now !== undefined && usual !== undefined && usual > 0) {
    const diff = (now - usual) / usual;
    // Within ±5 % reads as "your usual"; no arrow.
    if (Math.abs(diff) >= 0.05) {
      delta = h("span", { class: `delta ${diff > 0 ? "delta-up" : "delta-down"}`, title: `Your usual: ${fixed(usual)}` }, `${diff > 0 ? "▲" : "▼"} ${Math.round(Math.abs(diff) * 100)}%`);
    }
  }
  return h("div", { class: "stat" }, h("span", { class: "stat-label" }, label), h("b", { class: "stat-value" }, value), delta);
}

function recapCard(r: Recap, champs: ChampionIndex, now: number): HTMLElement {
  const g = r.game;
  const id = champs.idForKey(g.championId);
  const usual: Partial<Rates> = r.usual ?? {};
  return h(
    "div",
    { class: `card recap ${g.win ? "recap-win" : "recap-loss"}` },
    h(
      "div",
      { class: "card-head" },
      champIcon(id, champs, 40),
      h(
        "div",
        { class: "grow" },
        h("div", { class: "card-title" }, h("span", { class: "result" }, g.win ? "Victory" : "Defeat"), id ? champs.name(id) : null),
        h("div", { class: "muted" }, `${queueName(g)} · ${Math.round(g.durationSecs / 60)} min · ${timeAgo(g.created, now)}`),
      ),
    ),
    h(
      "div",
      { class: "stat-grid" },
      stat("K / D / A", `${g.kills} / ${g.deaths} / ${g.assists}`),
      stat("KDA", fixed(r.kda, 2), r.kda, usual.kda),
      stat("CS / min", fixed(r.csPerMin), r.csPerMin, usual.csPerMin),
      stat("Dmg / min", thousands(r.damagePerMin), r.damagePerMin, usual.damagePerMin),
    ),
    h(
      "p",
      { class: "hint" },
      r.usual ? `Arrows compare with your other ${r.usualGames} ${id ? champs.name(id) : ""} game${r.usualGames > 1 ? "s" : ""} below.` : "No other games on this champion to compare with yet.",
    ),
  );
}

function formStrip(form: boolean[]): HTMLElement {
  return h(
    "span",
    { class: "form-strip", title: "Last games, newest first" },
    form.map((win) => h("i", { class: win ? "w" : "l" }, win ? "W" : "L")),
  );
}

const FALLBACK_NAMES: Record<number, string> = { [GWEN_KEY]: "Gwen", [AMUMU_KEY]: "Amumu", [FIDDLESTICKS_KEY]: "Fiddlesticks" };

function champCard(key: number, s: ChampStats | null, champs: ChampionIndex): HTMLElement {
  const id = champs.idForKey(key);
  const name = id ? champs.name(id) : (FALLBACK_NAMES[key] ?? "Champion");
  const mastery = s?.mastery ? h("span", { class: "mastery", title: `${s.mastery.points.toLocaleString("en-US")} mastery points` }, `M${s.mastery.level}`) : null;
  const head = h(
    "div",
    { class: "card-head" },
    champIcon(id, champs, 36),
    h(
      "div",
      { class: "grow" },
      h("div", { class: "card-title" }, name, mastery),
      s && s.games
        ? h("div", { class: "muted" }, `${s.wins}W ${s.games - s.wins}L · `, h("b", { class: s.winRate >= 0.5 ? "good" : "bad" }, `${Math.round(s.winRate * 100)}%`))
        : h("div", { class: "muted" }, "Not in your last 20 games"),
    ),
  );
  if (!s || !s.games) return h("div", { class: "card champ-stats" }, head);
  return h(
    "div",
    { class: "card champ-stats" },
    head,
    formStrip(s.form),
    h(
      "div",
      { class: "stat-grid" },
      stat("K / D / A", `${fixed(s.kills)} / ${fixed(s.deaths)} / ${fixed(s.assists)}`),
      stat("KDA", fixed(s.kda, 2)),
      stat("CS / min", fixed(s.csPerMin)),
      stat("Dmg / min", thousands(s.damagePerMin)),
    ),
  );
}

export function clientView(history: History | null, champs: ChampionIndex, now = Date.now()): HTMLElement {
  if (!history) {
    return h("section", { class: "body docked" }, notice("muted", "Loading your match history…", "Your stats appear once the League client answers."));
  }
  const recap = lastGameRecap(history);
  return h(
    "section",
    { class: "body docked scroll" },
    heading("Last game"),
    recap ? recapCard(recap, champs, now) : h("p", { class: "muted" }, "No recent games yet."),
    heading("Your champions"),
    champCard(GWEN_KEY, champStats(history, GWEN_KEY), champs),
    champCard(AMUMU_KEY, champStats(history, AMUMU_KEY), champs),
    champCard(FIDDLESTICKS_KEY, champStats(history, FIDDLESTICKS_KEY), champs),
    h(
      "p",
      { class: "hint" },
      `From your last ${history.games.length} games (the most the League client shares). Champion stats count Summoner's Rift only; Practice Tool, custom games and remakes are left out.`,
    ),
  );
}
