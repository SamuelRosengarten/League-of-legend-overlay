// Header crest: the official ranked emblem with a soft halo and a slow float. Persistent
// across renders; on a tier change the new emblem cross-fades in over the old one.
import type { RankTheme } from "../theme/ranks";

export class Crest {
  readonly el: HTMLElement;
  private current: string | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "crest";
    this.el.setAttribute("data-tauri-drag-region", "");
    this.el.innerHTML = "<span class='crest-halo'></span><span class='crest-float'></span>";
  }

  update(theme: RankTheme, compact: boolean) {
    this.el.classList.toggle("crest-compact", compact);
    if (this.current === theme.id) return;
    const first = this.current === null;
    this.current = theme.id;
    this.el.title = `${theme.label} theme`;
    const holder = this.el.querySelector(".crest-float")!;
    const next = crestArt(theme);
    const old = [...holder.children] as HTMLElement[];
    holder.append(next);
    if (first) {
      old.forEach((o) => o.remove());
      return;
    }
    // `scale` (not `transform`) so the CSS transform that sizes the emblem is kept.
    next.animate([{ opacity: 0, scale: "0.8" }, { opacity: 1, scale: "1" }], { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" });
    for (const o of old) {
      o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }).onfinish = () => o.remove();
    }
  }
}

/** The emblem image, or a CSS crest for the unranked theme (no official emblem exists). */
export function crestArt(theme: RankTheme, size?: number): HTMLElement {
  const el = document.createElement(theme.emblem ? "img" : "span");
  el.className = theme.emblem ? "crest-img" : "crest-img crest-unranked";
  if (size) Object.assign(el.style, { width: `${size}px`, height: `${size}px` });
  if (el instanceof HTMLImageElement) {
    el.src = theme.emblem!;
    el.alt = `${theme.label} emblem`;
    el.draggable = false;
    el.setAttribute("data-tauri-drag-region", "");
  } else {
    el.innerHTML = "<i></i>";
  }
  return el;
}
