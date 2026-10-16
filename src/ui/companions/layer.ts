// The companion layer: a persistent, pointer-events:none overlay above the panel. It is NOT
// rebuilt on every backend event (that would restart the idle animations); it only changes
// when the layout itself changes.
//
// Each companion is a stack of elements, outermost first:
//   .companion       placement on the border (+ horizontal travel during a scene)
//     .puppet        lift / lean / squash / skew during a scene (director.ts writes both)
//       .companion-inner   the idle loops (sway, swing, scarecrow twitch) — never touched by scenes
//         .sprite          the art; Fiddlesticks is a stack of .part layers (arms, head, legs …)
//     .bubble        speech bubble: anchored to the companion, follows its travel, clamped to the window
// so a scene and the idle animations can never fight over the same transform.
//
// Idle behaviour is CSS (transform/opacity only) plus a slow timer for occasional expressions that
// only fires while motion is "full" and the overlay is visible. Scenes (see scenes.ts) are played by
// the Director, one at a time, on a randomized but bounded schedule.
import { Director, type DirectorHost, type PuppetNodes } from "./director";
import { MeshRenderer } from "./mesh-gl";
import type { Raw } from "./motion";
import { poseAmumu, poseFiddle, poseGwen } from "./rig-pose";
import type { Layout, Placed } from "./layout";
import { type Cast, type SceneId, SCENE_IDS, eligibleScenes, planScene } from "./scenes";
import { COMPANION_IDS, type CompanionId, type Expression, SPRITES, type Sprite } from "./sprites";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

/** Idle expressions that sometimes get a tiny bubble (the rest never do). */
const IDLE_BUBBLE: Partial<Record<Expression, string>> = {
  curious: "?",
  sleepy: "z z",
  happy: "♪",
  wink: "♥",
};

function el(tag: string, cls: string, style?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (style) for (const [k, v] of Object.entries(style)) e.style.setProperty(k, v);
  return e;
}

function img(url: string, cls: string): HTMLImageElement {
  const i = document.createElement("img");
  i.className = cls;
  i.src = url;
  i.alt = "";
  i.draggable = false;
  i.decoding = "async";
  return i;
}

/** Sprite with eyelids and FX anchored in sprite-relative coordinates. */
function spriteEl(s: Sprite, height: number, top: number): HTMLElement {
  const box = el("div", `sprite${s.parts ? " layered" : ""}`, { top: `${top}px`, height: `${height}px`, width: `${Math.round((height * s.width) / s.height)}px` });
  // Eyelids and the eye glow ride on the head layer when the sprite has layers.
  let face: HTMLElement = box;
  if (s.rig) {
    // Painted art that is bent by bones during scenes: the plain image stays until then, and the
    // face (eyelids, tears) rides on the head bone.
    box.classList.add("meshed");
    box.append(img(s.url, "sprite-img"));
    face = el("div", "face");
    box.append(face);
  } else if (s.parts) {
    for (const part of s.parts) {
      const layer = el("div", `part part-${part.name}`, { "--ox": pct(part.origin.x), "--oy": pct(part.origin.y) });
      layer.append(img(part.url, "part-img"));
      box.append(layer);
      if (part.name === "head") face = layer;
    }
  } else {
    box.append(img(s.url, "sprite-img"));
  }
  s.eyes.forEach((e, i) => {
    face.append(
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
    // One tear per eye: they roll now and then, and stream while he cries.
    s.eyes.forEach((e, i) => {
      const at = { left: pct(e.x - e.w * (i ? -0.1 : 0.18)), top: pct(e.y + e.h * 0.32) };
      face.append(el("i", `tear tear-${i ? "r" : "l"}`, at), el("i", `tear tear-x tear-${i ? "r" : "l"}`, at));
    });
  }
  if (s.id === "fiddlesticks") {
    // Emissive eye flare (opacity only) for the stare / scare moments.
    s.eyes.forEach((e, i) =>
      face.append(el("i", `eye-glow eye-glow-${i ? "r" : "l"}`, { left: pct(e.x - e.w * 0.9), top: pct(e.y - e.h * 0.9), width: pct(e.w * 1.8), height: pct(e.h * 1.8) })),
    );
  }
  for (const p of s.sparkles) box.append(el("i", "spark", { left: pct(p.x), top: pct(p.y) }));
  return box;
}

/** Hang line thickness: [outer edge, inner color] in px. */
const ROPE_WIDTH: Record<CompanionId, [number, number]> = { gwen: [4.2, 2.8], amumu: [6, 4.6], fiddlesticks: [4.6, 3.2] };

/** Ribbon (Gwen), bandage strip (Amumu) or rope (Fiddlesticks) from the border down to the top of the head. */
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
      : s.id === "fiddlesticks"
        ? `<path d="M ${x - 5} 1 q 5 7 10 0 M ${x - 4} 5 q 4 5 8 0" fill="none" stroke="${s.ribbon.edge}" stroke-width="1.6" stroke-linecap="round"/>`
        : `<rect x="${x - 4.5}" y="0" width="9" height="5" rx="1.5" fill="${s.ribbon.color}" stroke="${s.ribbon.edge}" stroke-width="0.8"/>`;
  // Static, self-authored markup (numbers + palette constants only).
  svg.innerHTML = `
    <path d="M ${x} 2 C ${x - 2} ${y2 * 0.4}, ${x + 2} ${y2 * 0.7}, ${x} ${y2}" fill="none" stroke="${s.ribbon.edge}" stroke-width="${ROPE_WIDTH[s.id][0]}" stroke-linecap="round"/>
    <path d="M ${x} 2 C ${x - 2} ${y2 * 0.4}, ${x + 2} ${y2 * 0.7}, ${x} ${y2}" fill="none" stroke="${s.ribbon.color}" stroke-width="${ROPE_WIDTH[s.id][1]}" stroke-linecap="round"/>
    ${knot}`;
  return svg;
}

/** Side pose: sway pivot height as a fraction of the sprite height (Gwen's waist, Amumu's arm, Fiddlesticks' hand). */
const STRAP_Y: Record<CompanionId, number> = { gwen: 0.46, amumu: 0.62, fiddlesticks: 0.72 };

/** Speech bubble anchored above the head (inside the root so it follows the companion's travel). */
function bubbleEl(s: Sprite, p: Placed, top: number): HTMLElement {
  const bx = p.spot.flip ? 1 - s.bubble.x : s.bubble.x;
  return el("span", "bubble", { left: pct(bx), top: `${top + s.bubble.y * p.spriteHeight}px` });
}

/**
 * Docked to the client: the sprite leans over the panel's frame (the layer is drawn above the
 * panel) and sways from the point where it holds the border. No strap: it read as a stray
 * scrollbar handle on the frame.
 */
function sideEl(s: Sprite, p: Placed, root: HTMLElement): HTMLElement {
  const inner = el("div", "companion-inner");
  inner.append(spriteEl(s, p.spriteHeight, 0));
  const puppet = el("div", "puppet");
  puppet.append(inner);
  root.style.setProperty("--grip", `${p.overlap}px`);
  root.style.setProperty("--strap-y", pct(STRAP_Y[p.who]));
  root.style.top = `calc(${((p.spot.y ?? 0.5) * 100).toFixed(1)}% - ${p.height}px)`;
  root.append(puppet, bubbleEl(s, p, 0));
  return root;
}

function companionEl(p: Placed): HTMLElement {
  const s = SPRITES[p.who];
  const root = el("div", `companion companion-${p.who} pose-${p.spot.pose}${p.spot.flip ? " flip" : ""}`, {
    width: `${p.width}px`,
    height: `${p.height}px`,
    left: `${p.left}px`,
    // Shared clock so the companions' idle loops stay in step.
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
  const puppet = el("div", "puppet");
  puppet.append(inner);
  root.append(puppet, bubbleEl(s, p, p.ribbon));
  return root;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Hooks a companion up to the director. Painted characters (Gwen, Amumu) get a WebGL canvas that draws
 * the art bent by its skeleton; Fiddlesticks' layers are rotated around their joints.
 */
function puppetFor(p: Placed, root: HTMLElement, puppet: HTMLElement, sprite: HTMLElement, room: number): PuppetNodes {
  const s = SPRITES[p.who];
  const natural: 1 | -1 = p.spot.flip ? 1 : -1;
  // A mirrored layout flips the art on screen, so rotations (hair trailing, leaning) must flip with it.
  const flip = p.spot.flip ? -1 : 1;
  // css px per texture px
  const cs = p.spriteHeight / s.height;
  const base = { root, room, natural };
  if (s.rig) {
    const def = s.rig;
    const art = new Image();
    art.src = s.url;
    const mesh = new MeshRenderer(def, art);
    sprite.append(mesh.canvas);
    const face = sprite.querySelector<HTMLElement>(".face")!;
    const headIdx = def.bones.findIndex((b) => b.name === "head");
    const pose = p.who === "gwen" ? poseGwen : poseAmumu;
    let shown = false;
    let dpr = 0;
    let facing = 2;
    return {
      ...base,
      apply(raw: Raw) {
        const d = Math.min(3, window.devicePixelRatio || 1);
        if (d !== dpr && mesh.ready) {
          dpr = d;
          mesh.resize(cs, d);
        }
        const world = mesh.render(pose(flip === 1 ? raw : { ...raw, facing: raw.facing * flip }, 1 / cs));
        if (mesh.ready && !shown) {
          shown = true;
          sprite.classList.add("mesh-on");
        }
        const h = world[headIdx]!;
        face.style.transform = `matrix(${h[0].toFixed(4)},${h[1].toFixed(4)},${h[2].toFixed(4)},${h[3].toFixed(4)},${(h[4] * cs).toFixed(2)},${(h[5] * cs).toFixed(2)})`;
        if (Math.abs(raw.facing - facing) > 0.002) {
          facing = raw.facing;
          puppet.style.transform = `scaleX(${facing.toFixed(3)})`;
        }
      },
      activate(on: boolean) {
        if (!on) {
          shown = false;
          sprite.classList.remove("mesh-on");
          face.style.removeProperty("transform");
          puppet.style.removeProperty("transform");
          facing = 2;
        } else dpr = 0;
      },
    };
  }
  // Fiddlesticks: separate layers (arms, legs, head, cloak) around their joints.
  return {
    ...base,
    apply(raw: Raw) {
      const v = poseFiddle(flip === 1 ? raw : { ...raw, facing: raw.facing * flip });
      const st = sprite.style;
      st.setProperty("--p-head", `${v.head.toFixed(2)}deg`);
      st.setProperty("--p-armL", `${v.armL.toFixed(2)}deg`);
      st.setProperty("--p-armR", `${v.armR.toFixed(2)}deg`);
      st.setProperty("--p-legL", `${v.legL.toFixed(2)}deg`);
      st.setProperty("--p-legR", `${v.legR.toFixed(2)}deg`);
      st.setProperty("--p-legLy", `${v.legLy.toFixed(2)}px`);
      st.setProperty("--p-legRy", `${v.legRy.toFixed(2)}px`);
      st.setProperty("--p-body", `${v.body.toFixed(2)}deg`);
      puppet.style.transform = `translateY(${(-v.lift).toFixed(2)}px) rotate(${v.rot.toFixed(2)}deg) scale(${(v.sx * raw.facing).toFixed(3)},${v.sy.toFixed(3)})`;
    },
    activate(on: boolean) {
      if (!on) {
        for (const n of ["--p-head", "--p-armL", "--p-armR", "--p-legL", "--p-legR", "--p-legLy", "--p-legRy", "--p-body"]) sprite.style.removeProperty(n);
        puppet.style.removeProperty("transform");
      }
    },
  };
}

/** First scene shortly after the overlay settles, then one every minute or so (randomized, bounded). */
const FIRST_SCENE_MS: [number, number] = [20000, 40000];
const NEXT_SCENE_MS: [number, number] = [50000, 100000];
const BUBBLE_EDGE = 4;

export class CompanionLayer implements DirectorHost {
  readonly el: HTMLElement;
  private key = "";
  private timers = new Map<CompanionId, number>();
  private exprTimers = new WeakMap<HTMLElement, number>();
  private bubbleTimers = new WeakMap<HTMLElement, number[]>();
  private placed: Placed[] = [];
  private gutterTop = 0;
  private scenesOn = false;
  private sceneTimer = 0;
  private lastScene: SceneId | null = null;
  private director = new Director(this);
  /** Test/debug: collapses the quiet period between scenes (build with VITE_SCENE_DEMO=1). */
  sceneDelay: [number, number] | null = import.meta.env.VITE_SCENE_DEMO ? [2500, 3000] : null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "companions";
    this.el.setAttribute("aria-hidden", "true");
    document.addEventListener("visibilitychange", () => this.director.sync(this.lively()));
  }

  /** Rebuilds only if the placement changed. `scenes` = the user's "Companion scenes" setting. */
  update(layout: Layout, opts: { scenes: boolean } = { scenes: false }) {
    const key = JSON.stringify(layout.placed.map((p) => [p.who, p.spot, p.width, p.height, p.left]));
    if (key !== this.key) {
      this.key = key;
      this.director.clear(); // a scene in progress ends at once; the DOM is replaced below
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
      this.placed = layout.placed;
      this.gutterTop = layout.gutterTop;
      this.el.replaceChildren(...layout.placed.map(companionEl));
      for (const p of layout.placed) {
        this.schedule(p.who);
        const root = this.node(p.who);
        const puppet = root?.querySelector<HTMLElement>(".puppet");
        const sprite = root?.querySelector<HTMLElement>(".sprite");
        if (root && puppet && sprite && p.spot.pose === "perch") {
          this.director.register(p.who, puppetFor(p, root, puppet, sprite, this.gutterTop - p.seat));
        }
      }
    }
    if (opts.scenes !== this.scenesOn) {
      this.scenesOn = opts.scenes;
      if (!opts.scenes) {
        this.director.abort("glide"); // finishes by walking home, never snapping
        clearTimeout(this.sceneTimer);
        this.sceneTimer = 0;
      }
    }
    this.director.sync(this.lively());
    if (this.scenesOn && !this.sceneTimer) this.scheduleScene(true);
  }

  private node(who: CompanionId): HTMLElement | null {
    return this.el.querySelector(`.companion-${who}`);
  }

  // ---- DirectorHost ------------------------------------------------------------------------

  /** Expressions and scenes only run while motion is "full" and the overlay is visible. */
  lively(): boolean {
    const d = document.documentElement.dataset;
    return d.motion === "full" && d.paused !== "true" && !document.hidden;
  }

  fx(who: CompanionId, kind: "snip" | "dust") {
    if (kind === "dust") return this.dust(who);
    const target = this.node(who)?.querySelector(".sprite");
    if (!target) return;
    const fx = el("i", "fx-snip", { left: "86%", top: "20%" });
    fx.textContent = "✂";
    target.append(fx);
    window.setTimeout(() => fx.remove(), 700);
  }

  /** A little puff of dust at the feet (footfalls, landings), kicked up behind the direction of travel. */
  private dust(who: CompanionId) {
    const root = this.node(who);
    const p = this.placed.find((x) => x.who === who);
    if (!root || !p || root.querySelectorAll(".dust").length > 8) return;
    const dir = Math.sign(this.director.velocityOf(who)) || 1;
    const d = el("i", "dust", { left: pct(0.38 + Math.random() * 0.24), top: `${p.seat - 4}px`, "--dx": `${(-dir * (8 + Math.random() * 10)).toFixed(1)}px` });
    root.append(d);
    window.setTimeout(() => d.remove(), 600);
  }

  /** Keeps visible bubbles inside the window while their companion moves. */
  frame() {
    for (const p of this.placed) {
      const b = this.node(p.who)?.querySelector<HTMLElement>(".bubble.on");
      if (b) this.clampBubble(p, b);
    }
  }

  ended() {
    // Nothing to restore: the director already cleared every transform. Bubbles fade on their own.
  }

  // ---- bubbles -----------------------------------------------------------------------------

  /** Pops a bubble in (scale + fade), swaps text through a short fade-out, and hides it after `dur`. */
  say(who: CompanionId, text: string, dur: number) {
    const b = this.node(who)?.querySelector<HTMLElement>(".bubble");
    const p = this.placed.find((x) => x.who === who);
    if (!b || !p) return;
    this.bubbleTimers.get(b)?.forEach((t) => clearTimeout(t));
    const timers: number[] = [];
    this.bubbleTimers.set(b, timers);
    const show = () => {
      b.textContent = text;
      this.clampBubble(p, b);
      b.classList.add("on");
      timers.push(window.setTimeout(() => b.classList.remove("on"), dur));
    };
    if (b.classList.contains("on")) {
      b.classList.remove("on");
      timers.push(window.setTimeout(show, 150));
    } else show();
  }

  private clampBubble(p: Placed, b: HTMLElement) {
    const s = SPRITES[p.who];
    const w = this.el.clientWidth || 0;
    if (!w) return;
    const bx = (p.spot.flip ? 1 - s.bubble.x : s.bubble.x) * p.width;
    const center = p.left + this.director.offsetOf(p.who) + bx;
    const half = b.offsetWidth / 2;
    const shift = Math.min(Math.max(center, half + BUBBLE_EDGE), Math.max(half + BUBBLE_EDGE, w - half - BUBBLE_EDGE)) - center;
    b.style.setProperty("--bs", `${shift.toFixed(1)}px`);
    // Never above the window's top edge.
    const bottom = this.gutterTop - p.seat + p.ribbon + s.bubble.y * p.spriteHeight;
    const over = BUBBLE_EDGE + b.offsetHeight + 5 - bottom;
    b.style.setProperty("--bt", `${Math.max(0, over).toFixed(1)}px`);
  }

  // ---- idle expressions --------------------------------------------------------------------

  private schedule(who: CompanionId) {
    this.timers.set(
      who,
      window.setTimeout(() => {
        if (this.lively() && !this.director.running) {
          const list = SPRITES[who].expressions;
          const expr = list[Math.floor(Math.random() * list.length)]!;
          this.express(who, expr);
          // Only now and then does an idle expression get a bubble.
          const text = IDLE_BUBBLE[expr];
          if (text && Math.random() < 0.35) this.say(who, text, 1500);
          // Now and then another one joins in.
          if (expr === "happy" && Math.random() < 0.5) {
            const others = COMPANION_IDS.filter((id) => id !== who);
            const other = others[Math.floor(Math.random() * others.length)]!;
            window.setTimeout(() => this.express(other, "happy"), 350);
          }
        }
        this.schedule(who);
      }, rand(9000, 17000)),
    );
  }

  /** Shows an expression (replacing any that is showing) for `duration` ms. */
  express(who: CompanionId, expr: Expression, duration = rand(1800, 2600)) {
    const node = this.node(who);
    if (!node) return;
    window.clearTimeout(this.exprTimers.get(node));
    node.dataset.expr = expr;
    this.exprTimers.set(node, window.setTimeout(() => delete node.dataset.expr, duration));
  }

  /** Reaction when the user changes screen (opens a guide, settings, champ select …). */
  react() {
    if (!this.lively() || this.director.running) return;
    this.express("gwen", "excited", 1400);
    window.setTimeout(() => this.express("fiddlesticks", "curious", 1500), 90);
    window.setTimeout(() => this.express("amumu", "surprised", 1300), 180);
  }

  // ---- scenes ------------------------------------------------------------------------------

  private scheduleScene(first = false) {
    const [lo, hi] = this.sceneDelay ?? (first ? FIRST_SCENE_MS : NEXT_SCENE_MS);
    this.sceneTimer = window.setTimeout(() => {
      this.sceneTimer = 0;
      if (!this.scenesOn) return;
      // Not lively (hidden / calm / in game) or a scene is still finishing: skip this slot.
      if (this.lively() && !this.director.running) this.playRandomScene();
      this.scheduleScene();
    }, rand(lo, hi));
  }

  /** Companions that stand on the top border; the only ones a scene can move. */
  private cast(): Cast[] {
    return this.placed.filter((p) => p.spot.pose === "perch").map((p) => ({ who: p.who, left: p.left, width: p.width }));
  }

  playRandomScene(only?: SceneId): boolean {
    if (this.director.running || !this.lively()) return false;
    const cast = this.cast();
    const options = (only ? [only] : eligibleScenes(cast)).filter((id) => only || id !== this.lastScene || SCENE_IDS.length < 2);
    // Demo builds cycle the scenes in order so each one can be inspected.
    const demoNext = import.meta.env.VITE_SCENE_DEMO ? SCENE_IDS[(SCENE_IDS.indexOf(this.lastScene ?? SCENE_IDS[SCENE_IDS.length - 1]!) + 1) % SCENE_IDS.length] : undefined;
    const id = demoNext && options.includes(demoNext) ? demoNext : options[Math.floor(Math.random() * options.length)];
    const scene = id && planScene(id, cast, this.el.clientWidth);
    if (!scene) return false;
    this.lastScene = scene.id;
    return this.director.play(scene);
  }
}
