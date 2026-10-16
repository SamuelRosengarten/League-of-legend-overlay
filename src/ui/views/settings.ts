import { backend } from "../../bridge";
import { MOTIONS, SCALE_MAX, SCALE_MIN, clampScale } from "../../theme/appearance";
import { THEMES, TIER_IDS, type ThemeId } from "../../theme/ranks";
import type { ResolvedTheme } from "../../theme/theme";
import type { Appearance, CompanionSettings, RankInfo } from "../../types";
import { COMPANION_IDS, type CompanionId, SPRITES } from "../companions/sprites";
import { PRESETS, SIZE_MAX, SIZE_MIN } from "../companions/layout";
import { crestArt } from "../crest";
import { h } from "../h";
import { icon } from "../icons";
import { store } from "../store";
import { heading } from "./common";
import { rankShowcase } from "./rank";

/** Optimistic local update + persist through Rust (settings.json). */
function save(next: Appearance) {
  const snap = store.state.snapshot;
  if (snap) store.patchSnapshot({ appearance: next });
  void backend.setAppearance(next);
}

function themeTile(id: ThemeId | "auto", current: string, resolved: ResolvedTheme, a: Appearance): HTMLElement {
  const selected = current === id;
  const theme = id === "auto" ? null : THEMES[id];
  return h(
    "button",
    {
      class: `tile theme-tile${selected ? " selected" : ""}${id === "auto" ? " tile-auto" : ""}`,
      "aria-pressed": String(selected),
      title: id === "auto" ? "Follow the rank reported by the League client" : `${theme!.label} theme`,
      onclick: () => save({ ...a, theme: id }),
    },
    id === "auto" ? h("span", { class: "auto-crest" }, crestArt(resolved.source === "manual" ? THEMES.unranked : resolved.theme)) : crestArt(theme!),
    h("span", { class: "tile-label" }, id === "auto" ? "My rank" : theme!.label),
  );
}

function toggle(label: string, on: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  return h(
    "button",
    { class: `switch-row${on ? " on" : ""}`, role: "switch", "aria-checked": String(on), title: hint, onclick: () => onChange(!on) },
    h("span", { class: "switch-label" }, label),
    h("span", { class: "switch" }, h("i")),
  );
}

function companionTile(who: CompanionId, c: CompanionSettings, a: Appearance): HTMLElement {
  const on = c[who];
  const name = SPRITES[who].name;
  // Head-and-shoulders crop of the companion sprite.
  const face = h("span", { class: `companion-face face-${who}`, style: `background-image:url("${SPRITES[who].url}")` });
  return h(
    "button",
    {
      class: `tile companion-tile${on ? " selected" : ""}`,
      role: "switch",
      "aria-checked": String(on),
      onclick: () => save({ ...a, companions: { ...c, [who]: !on } }),
    },
    face,
    h("span", { class: "tile-label" }, name),
    h("span", { class: "tile-state" }, on ? "Shown" : "Hidden"),
  );
}

export function settingsView(a: Appearance, rank: RankInfo | null, resolved: ResolvedTheme, opts: { compact: boolean }): HTMLElement {
  const c = a.companions;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setC = (patch: Partial<CompanionSettings>) => save({ ...a, companions: { ...c, ...patch } });
  const anyCompanion = COMPANION_IDS.some((who) => c[who]);

  return h(
    "section",
    { class: `body settings${opts.compact ? "" : " scroll"}` },
    rankShowcase(rank, resolved, { compact: true }),

    heading("Rank theme"),
    h("div", { class: "theme-grid" }, themeTile("auto", a.theme, resolved, a), TIER_IDS.map((id) => themeTile(id, a.theme, resolved, a))),
    h("p", { class: "hint" }, "“My rank” follows your Solo/Duo tier (Flex if unranked in Solo). Unranked accounts get the neutral hextech theme."),

    heading("Companions"),
    h("div", { class: "companion-grid" }, COMPANION_IDS.map((who) => companionTile(who, c, a))),
    h(
      "div",
      { class: `field${anyCompanion ? "" : " disabled"}` },
      h("label", null, "Placement"),
      h(
        "div",
        { class: "chips-select" },
        PRESETS.map((p) =>
          h(
            "button",
            { class: `chip-btn${p.id === c.placement ? " selected" : ""}`, title: p.description, disabled: !anyCompanion, onclick: () => setC({ placement: p.id }) },
            p.label,
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: `field${anyCompanion ? "" : " disabled"}` },
      h("label", null, "Size", h("span", { class: "muted" }, ` ${Math.round(c.size * 100)}%`)),
      h("input", {
        type: "range",
        min: SIZE_MIN,
        max: SIZE_MAX,
        step: 0.05,
        value: c.size,
        disabled: !anyCompanion,
        "aria-label": "Companion size",
        onchange: (e: Event) => setC({ size: Number((e.target as HTMLInputElement).value) }),
      }),
    ),
    toggle("Companion scenes", c.scenes, (v) => setC({ scenes: v }), "Now and then they chase, scare and tease each other (full motion only, never in game)"),
    toggle("Show during games", c.inGame, (v) => setC({ inGame: v }), "They sit on the compact in-game panel (animations are always calm in game)"),

    heading("Motion"),
    h(
      "div",
      { class: "segmented", role: "radiogroup" },
      MOTIONS.map((m) =>
        h("button", { class: `seg${a.motion === m.id ? " selected" : ""}`, role: "radio", "aria-checked": String(a.motion === m.id), title: m.hint, onclick: () => save({ ...a, motion: m.id }) }, m.label),
      ),
    ),
    reduced ? h("p", { class: "hint warn-text" }, icon("info", 12), " Windows “Animation effects” is off, so animations stay off.") : null,
    h("p", { class: "hint" }, "In game, animations are always calm and ambient particles are off."),

    heading("Layout"),
    h(
      "div",
      { class: "field" },
      h("label", null, "Scale", h("span", { class: "muted" }, ` ${Math.round(a.scale * 100)}%`)),
      h("input", {
        type: "range",
        min: SCALE_MIN,
        max: SCALE_MAX,
        step: 0.05,
        value: a.scale,
        "aria-label": "Overlay scale",
        onchange: (e: Event) => save({ ...a, scale: clampScale(Number((e.target as HTMLInputElement).value)) }),
      }),
    ),
    h("p", { class: "hint" }, "Text, icons and the panel itself grow together. Try 115–130% on 1440p or 4K screens."),
    toggle(
      "Dock to the League client",
      a.dockToClient,
      (v) => save({ ...a, dockToClient: v }),
      "Between games the panel sticks to the side of the client window, as tall as the client, with your stats",
    ),
    toggle("Snap to screen edge in game", a.snapToEdge, (v) => save({ ...a, snapToEdge: v }), "Off: the in-game panel stays exactly where you drop it"),
    h(
      "button",
      { class: "btn", title: "Also in the tray menu", onclick: () => void backend.resetPosition() },
      icon("refresh", 14),
      "Reset position",
    ),

    h("button", { class: "btn btn-primary done", onclick: () => store.update({ view: "main" }) }, icon("check", 14), "Done"),
  );
}
