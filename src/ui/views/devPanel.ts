import { backend } from "../../bridge";
import type { MockStatus } from "../../types";
import { h } from "../h";

/** Fixture controls, only rendered in mock mode. */
export function devPanel(mock: MockStatus | null): HTMLElement | null {
  if (!mock) return null;
  const select = h(
    "select",
    { onchange: (e: Event) => backend.mock.load((e.target as HTMLSelectElement).value) },
    mock.scenarios.map((s) => h("option", { value: s.id, selected: s.id === mock.scenario, title: s.description }, s.name)),
  );
  return h(
    "footer",
    { class: "dev" },
    h("div", { class: "row" }, h("span", { class: "pill pill-mock" }, "MOCK"), select),
    h(
      "div",
      { class: "row" },
      h("button", { onclick: () => backend.mock.step(-1), title: "Previous step" }, "◀"),
      h("button", { onclick: () => backend.mock.play(!mock.playing), title: mock.playing ? "Pause" : "Play" }, mock.playing ? "❚❚" : "▶"),
      h("button", { onclick: () => backend.mock.step(1), title: "Next step" }, "▶|"),
      h("span", { class: "step" }, `${mock.stepIndex + 1}/${mock.stepCount} · ${mock.stepLabel}`),
    ),
    mock.error ? h("div", { class: "error" }, mock.error) : null,
  );
}
