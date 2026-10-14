import { championIconUrl } from "../../bridge";
import type { ChampionIndex } from "../../domain/champions";
import type { Role, Slot } from "../../domain/match";
import { h } from "../h";

export const ROLE_LABEL: Record<Role, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  utility: "Support",
};

export function champIcon(id: string | null, champs: ChampionIndex, size = 36): HTMLElement {
  const box = h("div", { class: "icon", style: `width:${size}px;height:${size}px` });
  if (!id) {
    box.classList.add("icon-hidden");
    box.textContent = "?";
    return box;
  }
  box.textContent = champs.name(id).slice(0, 2);
  const img = h("img", { src: championIconUrl(id), alt: champs.name(id), draggable: "false" }) as HTMLImageElement;
  img.onerror = () => img.remove();
  box.append(img);
  return box;
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

export function notice(kind: "info" | "warn" | "muted", title: string, body?: string): HTMLElement {
  return h("div", { class: `notice notice-${kind}` }, h("strong", null, title), body ? h("p", null, body) : null);
}
