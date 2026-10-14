// Ambient motes drifting up inside the panel: a fixed set of spans animated with
// transform/opacity only, created once. Disabled in game and unless motion is "full".
const COUNT = 14;

export class Particles {
  readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "fx";
    this.el.setAttribute("aria-hidden", "true");
    // Deterministic spread so the layout looks the same on every start.
    for (let i = 0; i < COUNT; i++) {
      const s = document.createElement("span");
      const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
      s.style.left = `${(4 + r(1) * 92).toFixed(1)}%`;
      s.style.top = `${(20 + r(2) * 78).toFixed(1)}%`;
      s.style.setProperty("--d", `${(9 + r(3) * 9).toFixed(1)}s`);
      s.style.setProperty("--delay", `${(-r(4) * 18).toFixed(1)}s`);
      s.style.setProperty("--size", `${(1.5 + r(5) * 2.2).toFixed(1)}px`);
      if (i >= 9) s.className = "prestige";
      this.el.append(s);
    }
  }

  update(enabled: boolean, prestige: number) {
    this.el.dataset.on = String(enabled);
    this.el.dataset.prestige = String(prestige);
  }
}
