// The companion layer: a persistent, pointer-events:none overlay above the panel. It is NOT
// rebuilt on every backend event (that would restart the idle animations); it only changes
// when the layout itself changes.
//
// Each companion = sprite (from the user's art) + eyelid overlays (blink, wink, sleepy,
// happy eyes) + small FX (tear, sparkles, speech bubble). Idle loops are CSS
// (transform/opacity only); occasional expressions are a class toggled by a slow timer that
// only fires while motion is "full" and the overlay is visible.
import type { Layout, Placed } from "./layout";
import { type CompanionId, type Expression, SPRITES, type Sprite } from "./sprites";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const BUBBLE: Partial<Record<Expression, string>> = {
  curious: "?",
  sleepy: "z z",
  surprised: "!",
  happy: "♪",
  wink: "♥",
};

function el(tag: string, cls: string, style?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (style) for (const [k, v] of Object.entries(style)) e.style.setProperty(k, v);
  return e;
}

/** Sprite with eyelids and FX anchored in sprite-relative coordinates. */
function spriteEl(s: Sprite, height: number, top: number): HTMLElement {
  const box = el("div", "sprite", { top: `${top}px`, height: `${height}px`, width: `${Math.round((height * s.width) / s.height)}px` });
  const img = document.createElement("img");
  img.className = "sprite-img";
  img.src = s.url;
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  box.append(img);
  s.eyes.forEach((e, i) => {
    box.append(
      el("i", `lid lid-${i ? "r" : "l"}`, {
        left: pct(e.x - e.w / 2),
        top: pct(e.y - e.h / 2),
        width: pct(e.w),
        height: pct(e.h),
        "--rot": `${e.rot}deg`,
        "--lid-a": s.lid[0],
        "--lid-b": s.lid[1],
        "--lash": s.lash,
      }),
    );
  });
  if (s.id === "amumu") {
    const e = s.eyes[0];
    box.append(el("i", "tear", { left: pct(e.x - e.w * 0.18), top: pct(e.y + e.h * 0.32) }));
  }
  for (const p of s.sparkles) box.append(el("i", "spark", { left: pct(p.x), top: pct(p.y) }));
  return box;
}

/** Ribbon (Gwen) or bandage strip (Amumu) from the border down to the top of the head. */
function ribbonEl(s: Sprite, p: Placed): SVGSVGElement {
  const x = (p.spot.flip ? 1 - s.hangAt.x : s.hangAt.x) * p.width;
  const y2 = p.ribbon + s.hangAt.y * p.spriteHeight + 3;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ribbon");
  svg.setAttribute("width", String(p.width));
  svg.setAttribute("height", String(Math.ceil(y2)));
  svg.setAttribute("aria-hidden", "true");
  const knot =
    s.id === "gwen"
      ? `<path d="M ${x} 3 c -6 -5 -10 1 -6 4 c 2 1.5 4 0 6 -4 z M ${x} 3 c 6 -5 10 1 6 4 c -2 1.5 -4 0 -6 -4 z" fill="${s.ribbon.color}" stroke="${s.ribbon.edge}" stroke-width="0.8"/><circle cx="${x}" cy="3" r="1.8" fill="var(--rank-accent, #8ff0ff)"/>`
      : `<rect x="${x - 4.5}" y="0" width="9" height="5" rx="1.5" fill="${s.ribbon.color}" stroke="${s.ribbon.edge}" stroke-width="0.8"/>`;
  // Static, self-authored markup (numbers + palette constants only).
  svg.innerHTML = `
    <path d="M ${x} 2 C ${x - 2} ${y2 * 0.4}, ${x + 2} ${y2 * 0.7}, ${x} ${y2}" fill="none" stroke="${s.ribbon.edge}" stroke-width="${s.id === "gwen" ? 4.2 : 6}" stroke-linecap="round"/>
    <path d="M ${x} 2 C ${x - 2} ${y2 * 0.4}, ${x + 2} ${y2 * 0.7}, ${x} ${y2}" fill="none" stroke="${s.ribbon.color}" stroke-width="${s.id === "gwen" ? 2.8 : 4.6}" stroke-linecap="round"/>
    ${knot}`;
  return svg;
}

/** Side pose: sway pivot height as a fraction of the sprite height (Gwen's waist, Amumu's arm). */
const STRAP_Y: Record<CompanionId, number> = { gwen: 0.46, amumu: 0.62 };

/**
 * Docked to the client: the sprite leans over the panel's frame (the layer is drawn above the
 * panel) and sways from the point where it holds the border. No strap: it read as a stray
 * scrollbar handle on the frame.
 */
function sideEl(s: Sprite, p: Placed, root: HTMLElement): HTMLElement {
  const inner = el("div", "companion-inner");
  const bx = p.spot.flip ? 1 - s.bubble.x : s.bubble.x;
  inner.append(spriteEl(s, p.spriteHeight, 0), el("span", "bubble", { left: pct(bx), top: `${s.bubble.y * p.spriteHeight}px` }));
  root.style.setProperty("--grip", `${p.overlap}px`);
  root.style.setProperty("--strap-y", pct(STRAP_Y[p.who]));
  root.style.top = `calc(${((p.spot.y ?? 0.5) * 100).toFixed(1)}% - ${p.height}px)`;
  root.append(inner);
  return root;
}

function companionEl(p: Placed): HTMLElement {
  const s = SPRITES[p.who];
  const root = el("div", `companion companion-${p.who} pose-${p.spot.pose}${p.spot.flip ? " flip" : ""}`, {
    width: `${p.width}px`,
    height: `${p.height}px`,
    left: `${p.left}px`,
    // Shared clock so the two companions' idle loops stay in step.
    "--sync": `-${Math.round(performance.now() % 24000)}ms`,
    "--hang-x": pct(p.spot.flip ? 1 - s.hangAt.x : s.hangAt.x),
  });
  if (p.spot.pose === "side") return sideEl(s, p, root);
  // Border line: top border = --gutter-top; bottom border = bottom of the panel.
  if (p.spot.pose === "hang") root.style.bottom = `calc(var(--gutter-bottom) - ${p.height}px)`;
  else root.style.top = `calc(var(--gutter-top) - ${p.seat}px)`;

  const inner = el("div", "companion-inner");
  if (p.spot.pose === "hang") inner.append(ribbonEl(s, p));
  inner.append(spriteEl(s, p.spriteHeight, p.ribbon));
  const bx = p.spot.flip ? 1 - s.bubble.x : s.bubble.x;
  inner.append(el("span", "bubble", { left: pct(bx), top: `${p.ribbon + s.bubble.y * p.spriteHeight}px` }));
  root.append(inner);
  return root;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class CompanionLayer {
  readonly el: HTMLElement;
  private key = "";
  private timers = new Map<CompanionId, number>();

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "companions";
    this.el.setAttribute("aria-hidden", "true");
  }

  /** Rebuilds only if the placement changed. */
  update(layout: Layout) {
    const key = JSON.stringify(layout.placed.map((p) => [p.who, p.spot, p.width, p.height, p.left]));
    if (key === this.key) return;
    this.key = key;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.el.replaceChildren(...layout.placed.map(companionEl));
    for (const p of layout.placed) this.schedule(p.who);
  }

  private node(who: CompanionId): HTMLElement | null {
    return this.el.querySelector(`.companion-${who}`);
  }

  /** Expressions only while motion is "full" and the overlay is visible (cheap otherwise). */
  private lively(): boolean {
    const d = document.documentElement.dataset;
    return d.motion === "full" && d.paused !== "true" && !document.hidden;
  }

  private schedule(who: CompanionId) {
    this.timers.set(
      who,
      window.setTimeout(() => {
        if (this.lively()) {
          const list = SPRITES[who].expressions;
          const expr = list[Math.floor(Math.random() * list.length)]!;
          this.express(who, expr);
          // Now and then the other one joins in.
          const other: CompanionId = who === "gwen" ? "amumu" : "gwen";
          if (expr === "happy" && Math.random() < 0.5) window.setTimeout(() => this.express(other, "happy"), 350);
        }
        this.schedule(who);
      }, rand(9000, 17000)),
    );
  }

  express(who: CompanionId, expr: Expression, duration = rand(1800, 2600)) {
    const node = this.node(who);
    if (!node || node.dataset.expr) return;
    node.dataset.expr = expr;
    const bubble = node.querySelector<HTMLElement>(".bubble");
    if (bubble) bubble.textContent = BUBBLE[expr] ?? "";
    window.setTimeout(() => delete node.dataset.expr, duration);
  }

  /** Reaction when the user changes screen (opens a guide, settings, champ select …). */
  react() {
    if (!this.lively()) return;
    this.express("gwen", "excited", 1400);
    window.setTimeout(() => this.express("amumu", "surprised", 1300), 180);
  }
}
