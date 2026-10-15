// Small stroke icons (24-unit grid, currentColor) used by buttons and notices.
const PATHS = {
  gear: "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.2 4.9-1.9-.4a6.6 6.6 0 0 1-.6 1.5l1.1 1.6-1.5 1.5-1.6-1.1a6.6 6.6 0 0 1-1.5.6l-.4 1.9h-2.1l-.4-1.9a6.6 6.6 0 0 1-1.5-.6l-1.6 1.1-1.5-1.5 1.1-1.6a6.6 6.6 0 0 1-.6-1.5l-1.9-.4v-2.1l1.9-.4c.1-.5.3-1 .6-1.5L6.6 6.6l1.5-1.5 1.6 1.1c.5-.3 1-.5 1.5-.6l.4-1.9h2.1l.4 1.9c.5.1 1 .3 1.5.6l1.6-1.1 1.5 1.5-1.1 1.6c.3.5.5 1 .6 1.5l1.9.4Z",
  pointer: "M6 3.5 18.5 12l-5.6 1.3 3.3 6.2-2.2 1.1-3.2-6.2L6.6 18Z",
  ghost: "M6 3.5 18.5 12l-5.6 1.3 3.3 6.2-2.2 1.1-3.2-6.2L6.6 18Z M3 21 21 3",
  chevronUp: "m6 15 6-6 6 6",
  chevronDown: "m6 9 6 6 6-6",
  back: "M15 5 8 12l7 7",
  check: "m5 12.5 4.5 4.5L19 7",
  info: "M12 8h.01M11 11.5h1v5h1 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  warn: "M12 9v4.5M12 17h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  plug: "M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0Zm5.5 8.5V21",
  sword: "M14.5 3.5H20v5.5L9 20l-5-5Z M4 20l3-3",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5",
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 14): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", `ico ico-${name}`);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", name === "gear" || name === "pointer" || name === "ghost" ? "1.6" : "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
