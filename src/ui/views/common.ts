import { championIconUrl, itemIconUrl, spellIconUrl } from "../../bridge";
import type { ChampionIndex } from "../../domain/champions";
import type { Role, Slot } from "../../domain/match";
import { h } from "../h";
import { type IconName, icon } from "../icons";

export const ROLE_LABEL: Record<Role, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  utility: "Support",
};

/** Image tile with a text fallback if the art cannot load (offline, unknown id). */
function artTile(cls: string, size: number, url: string, alt: string, fallback: string): HTMLElement {
  const box = h("div", { class: `icon ${cls}`, style: `width:${size}px;height:${size}px` }, h("span", { class: "icon-fallback" }, fallback));
  const img = h("img", { src: url, alt, draggable: "false" }) as HTMLImageElement;
  img.onerror = () => img.remove();
  box.append(img);
  return box;
}

export function champIcon(id: string | null, champs: ChampionIndex, size = 36): HTMLElement {
  if (!id) return h("div", { class: "icon icon-hidden", style: `width:${size}px;height:${size}px`, title: "Not revealed yet" }, "?");
  return artTile("icon-champ", size, championIconUrl(id), champs.name(id), champs.name(id).slice(0, 2));
}

export function itemIcon(itemId: number, name: string, size = 24): HTMLElement {
  return artTile("icon-item", size, itemIconUrl(itemId), name, "◆");
}

/** Ability icon with its key (P/Q/W/E/R) badge. */
export function spellIcon(championId: string, key: string, name: string, size = 26): HTMLElement {
  const tile = artTile("icon-spell", size, spellIconUrl(championId, key), name, key);
  tile.append(h("b", { class: "key-badge" }, key));
  return tile;
}

export function slotRow(slot: Slot, champs: ChampionIndex, extra?: HTMLElement | null): HTMLElement {
  const name = slot.championId ? champs.name(slot.championId) : "Not picked yet";
  const meta = [
    slot.position ? ROLE_LABEL[slot.position] : null,
    slot.hovering ? "hovering" : null,
    slot.hasSmite ? "Smite" : null,
    slot.level !== null ? `Lv ${slot.level}` : null,
  ].filter(Boolean);
  return h(
    "div",
    { class: `slot${slot.isMe ? " slot-me" : ""}${slot.championId ? "" : " slot-hidden"}` },
    champIcon(slot.championId, champs),
    h("div", { class: "slot-body" }, h("div", { class: "slot-name" }, name, slot.isMe ? h("span", { class: "you" }, "you") : null), h("div", { class: "slot-meta" }, meta.join(" · "))),
    extra ?? null,
  );
}

const NOTICE_ICON: Record<"info" | "warn" | "muted", IconName> = { info: "info", warn: "warn", muted: "plug" };

export function notice(kind: "info" | "warn" | "muted", title: string, body?: string): HTMLElement {
  return h(
    "div",
    { class: `notice notice-${kind}` },
    h("span", { class: "notice-icon" }, icon(NOTICE_ICON[kind], 16)),
    h("div", null, h("strong", null, title), body ? h("p", null, body) : null),
  );
}

/** Section heading with an ornamental rule. */
export function heading(text: string, aside?: string | HTMLElement | null): HTMLElement {
  return h("h3", null, h("span", null, text), h("i", { class: "rule" }), aside ? h("span", { class: "count" }, aside) : null);
}
