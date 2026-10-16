// Team-level warnings: rule-based checks over the whole enemy composition.
import type { ItemCountersFile, Tag } from "../data/types";
import type { ProfileLookup } from "./profiles";

export interface TeamWarning {
  id: string;
  level: "warn" | "info";
  text: string;
  champions: string[];
}

export interface WarningEnemy {
  championId: string | null;
  items: number[];
}

const HARD_CC = new Set(["stun", "root", "knockup", "knockback", "pull", "charm", "fear", "taunt", "suppression", "sleep", "polymorph"]);

export function teamWarnings(
  me: string,
  enemies: WarningEnemy[],
  ctx: { profileOf: ProfileLookup; items: ItemCountersFile | null; name: (id: string) => string },
): TeamWarning[] {
  const known = enemies.filter((e): e is WarningEnemy & { championId: string } => !!e.championId);
  const profiles = known.map((e) => ({ id: e.championId, p: ctx.profileOf(e.championId)?.profile ?? null, items: e.items }));
  const hasTag = (e: (typeof profiles)[number], tag: Tag) =>
    !!e.p?.traits.includes(tag) ||
    e.items.some((id) => {
      const item = ctx.items?.items[String(id)];
      return !!item?.relevantTo.includes(me) && item.effects.includes(tag);
    });
  const withTag = (...tags: Tag[]) => profiles.filter((e) => tags.some((t) => hasTag(e, t))).map((e) => e.id);
  const names = (ids: string[]) => ids.map(ctx.name).join(", ");
  const out: TeamWarning[] = [];

  // Damage mix (needs at least 3 known enemies to mean anything).
  const typed = profiles.filter((e) => e.p);
  if (typed.length >= 3) {
    const magic = typed.reduce((s, e) => s + (e.p!.damage === "magic" ? 1 : e.p!.damage === "mixed" ? 0.5 : 0), 0) / typed.length;
    if (magic >= 0.65) {
      const ids = typed.filter((e) => e.p!.damage !== "physical").map((e) => e.id);
      out.push({ id: "magic-heavy", level: "info", text: `Mostly magic damage (${names(ids)}) → consider early MR (e.g. Mercury's Treads).`, champions: ids });
    } else if (magic <= 0.35) {
      const ids = typed.filter((e) => e.p!.damage !== "magic").map((e) => e.id);
      out.push({ id: "physical-heavy", level: "info", text: `Mostly physical damage (${names(ids)}) → consider early armor (e.g. Plated Steelcaps).`, champions: ids });
    }
  }

  if (me === "Amumu") {
    const hardCc = profiles.filter((e) => e.p?.cc.some((c) => HARD_CC.has(c))).map((e) => e.id);
    const counters = withTag("anti-engage", "spell-shield", "cleanse");
    if (counters.length >= 2 || (hardCc.length >= 3 && counters.length >= 1)) {
      const parts = [hardCc.length >= 3 ? `${hardCc.length} heavy CC` : null, `${names(counters)} (anti-engage / spell shield / cleanse)`].filter(Boolean);
      out.push({ id: "bad-engage", level: "warn", text: `${parts.join(" + ")} → head-on Amumu engages are risky; look for flanks and bait their tools first.`, champions: counters });
    }
    const mobile = withTag("high-mobility", "untargetable");
    if (mobile.length >= 2) {
      out.push({ id: "slippery", level: "warn", text: `${names(mobile)} can dodge or escape Bandage Toss/R → hold R until their dashes are used.`, champions: mobile });
    }
    const shred = withTag("percent-hp-damage", "true-damage");
    if (shred.length >= 3) {
      out.push({ id: "tank-shred", level: "info", text: `${names(shred)} deal %HP/true damage → stacking HP helps less; engage, then peel instead of front-lining.`, champions: shred });
    }
  }

  if (me === "Fiddlesticks") {
    const shields = withTag("spell-shield", "cleanse");
    if (shields.length >= 1) {
      out.push({ id: "fear-blocked", level: "warn", text: `${names(shields)} can block or cleanse Terrify / Reap → bait the shield or cleanse first, then commit Crowstorm.`, champions: shields });
    }
    const engage = withTag("hard-engage", "gank-setup");
    if (engage.length >= 2) {
      out.push({ id: "engage-heavy", level: "warn", text: `Engage-heavy comp (${names(engage)}) → stay behind your team in brush and don't channel Bountiful Harvest in their range.`, champions: engage });
    }
    const mobile = withTag("high-mobility", "untargetable");
    if (mobile.length >= 2) {
      out.push({ id: "slippery", level: "info", text: `${names(mobile)} can leave Crowstorm or dodge your fear → wait for their dash before you channel.`, champions: mobile });
    }
    const heal = withTag("healing", "shields-allies");
    if (heal.length >= 2) {
      out.push({ id: "sustain", level: "info", text: `Sustain-heavy comp (${names(heal)}) → burst the healer first; Reap's silence cuts their heals.`, champions: heal });
    }
  }

  if (me === "Gwen") {
    const poke = withTag("ranged-poke");
    if (poke.length >= 2) {
      out.push({ id: "poke", level: "warn", text: `Poke-heavy comp (${names(poke)}) → sustain runes/items and fight inside Hallowed Mist.`, champions: poke });
    }
    const gw = withTag("grievous-wounds");
    if (gw.length >= 2) {
      out.push({ id: "anti-heal", level: "warn", text: `Multiple Grievous Wounds sources (${names(gw)}) → your passive healing is cut; prefer short trades.`, champions: gw });
    }
    const pointClick = withTag("point-click-cc");
    if (pointClick.length >= 2) {
      out.push({ id: "point-click", level: "warn", text: `Several targeted CC (${names(pointClick)}) → save Hallowed Mist for their lockdown.`, champions: pointClick });
    }
    const tanks = withTag("tank");
    if (tanks.length >= 2) {
      out.push({ id: "tanks", level: "info", text: `Tank-heavy comp (${names(tanks)}) → your %HP damage shines in long fights.`, champions: tanks });
    }
  }
  return out;
}
