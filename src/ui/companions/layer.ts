// The companion layer: a persistent, pointer-events:none overlay above the panel. It is NOT
// rebuilt on every backend event (that would restart the idle animations); it only changes
// when the layout itself changes.
import { ART, type CompanionId, type Pose } from "./art";
import type { Layout, Placed } from "./layout";

// Optional raster art: src/assets/companions/<gwen|amumu>/<pose>.(webp|png) replaces the
// built-in vector pose with the same box (see src/assets/companions/README.md).
const RASTER = import.meta.glob("../../assets/companions/*/*.{png,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function rasterArt(who: CompanionId, pose: Pose): string | null {
  for (const ext of ["webp", "png"]) {
    const url = RASTER[`../../assets/companions/${who}/${pose}.${ext}`];
    if (url) return url;
  }
  return null;
}

let uid = 0;

function companionEl(p: Placed): HTMLElement {
  const [x, y, w, h] = ART[p.who][p.spot.pose].box;
  const el = document.createElement("div");
  el.className = `companion companion-${p.who} pose-${p.spot.pose} edge-${p.spot.edge}${p.spot.flip ? " flip" : ""}`;
  el.style.width = `${p.width}px`;
  el.style.height = `${p.height}px`;
  el.style.left = `${p.left}px`;
  el.style.setProperty("--seat", `${p.seat}px`);
  // Shared clock for the coordinated idle beat (both companions use the same 24 s cycle).
  el.style.setProperty("--sync", `-${Math.round(performance.now() % 24000)}ms`);
  // Seat line on the panel border: top border = gutterTop, bottom border = bottom of the panel.
  if (p.spot.edge === "top") el.style.top = `calc(var(--gutter-top) - ${p.seat}px)`;
  else el.style.bottom = `calc(var(--gutter-bottom) - ${p.height - p.seat}px)`;

  const inner = document.createElement("div");
  inner.className = "companion-inner";
  const raster = rasterArt(p.who, p.spot.pose);
  if (raster) {
    const img = document.createElement("img");
    img.src = raster;
    img.alt = "";
    img.draggable = false;
    inner.append(img);
  } else {
    // Static, self-authored markup (no user data) — safe to set as HTML.
    inner.innerHTML = `<svg viewBox="${x} ${y} ${w} ${h}" width="100%" height="100%" aria-hidden="true">${ART[p.who][p.spot.pose].svg(`c${++uid}-`)}</svg>`;
  }
  el.append(inner);
  return el;
}

export class CompanionLayer {
  readonly el: HTMLElement;
  private key = "";

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "companions";
    this.el.setAttribute("aria-hidden", "true");
  }

  /** Rebuilds only if the placement changed. */
  update(layout: Layout) {
    const key = JSON.stringify(layout.placed.map((p) => [p.who, p.spot, Math.round(p.width), Math.round(p.left)]));
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(...layout.placed.map(companionEl));
  }

  /** Small hop when the user changes screen. Web Animations, so CSS idle loops keep running. */
  react() {
    if (document.documentElement.dataset.motion === "off") return;
    this.el.querySelectorAll<HTMLElement>(".companion-inner").forEach((el, i) => {
      el.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(-5px) scale(1.03)" }, { transform: "translateY(0)" }],
        { duration: 520, delay: i * 120, easing: "cubic-bezier(.3,.7,.4,1)" },
      );
    });
  }
}
