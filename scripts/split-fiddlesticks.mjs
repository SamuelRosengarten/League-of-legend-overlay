// Splits the master artwork (src/assets/companions/fiddlesticks.svg) into the layers the overlay
// animates separately: two legs, body, left arm (+ lantern), right arm (+ scythe), head. Every layer
// shares the master's viewBox, so they stack exactly; the animation code only rotates each one
// around its joint (see PARTS in src/ui/companions/sprites.ts).
//
//   node scripts/split-fiddlesticks.mjs
//
// The master is the source of truth: edit it, then re-run this script.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "companions");
const lines = readFileSync(join(root, "fiddlesticks.svg"), "utf8").split(/\r?\n/);

const find = (marker) => {
  const i = lines.findIndex((l) => l.includes(marker));
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  return i;
};
const at = {
  scythe: find("============ scythe (behind)"),
  legL: find("============ legL"),
  legR: find("============ legR"),
  cloak: find("============ layered rag cloak"),
  armL: find("============ left arm"),
  armR: find("============ right arm to the scythe"),
  neck: find("<!-- neck, scarf, collar straw -->"),
  hardware: find("============ hardware"),
  head: find("============ head (crooked, tilted)"),
  end: lines.findLastIndex((l) => l.includes("</svg>")),
};
const slice = (a, b) => lines.slice(a, b);
const header = slice(0, at.scythe); // <svg …> + <defs>

// The hardware block mixes parts; sort its lines by what they attach to.
const hw = slice(at.hardware + 1, at.head);
const isLeft = (l) => /M 88 258 C 92 240|M 94 250 l -4|M 92 262 C 100 250|cx="102" cy="258"|M 90 266 l 6 8|x="64" y="316"|cx="68" cy="320"/.test(l);
const isRight = (l) => /M 178 258 C 188 252|x="212" y="276"|M 226 292 l -16|M 212 289 l 5 2/.test(l) || /<path d="M 226 292 l -16 -4/.test(l);
const strawLine = hw.findIndex((l) => l.includes("M 188 258 l 6 -12"));
const hwLeft = [];
const hwRight = [];
const hwBody = [];
hw.forEach((l, i) => {
  if (i === strawLine) {
    hwRight.push('  <g stroke="url(#straw)" stroke-width="3.2" stroke-linecap="round"><path d="M 188 258 l 6 -12 M 194 262 l 12 -8 M 210 266 l 8 -10 M 202 270 l 12 2"/></g>');
    hwLeft.push('  <g stroke="url(#straw)" stroke-width="3.2" stroke-linecap="round"><path d="M 98 296 l -14 -2 M 70 292 l -12 -4 M 74 302 l -14 4"/></g>');
  } else if (/^\s*<g fill="url\(#iron\)" stroke="#120b0c" stroke-width="1.4"/.test(l) || /^\s*<path d="M 226 292/.test(l) || /^\s*<\/g>/.test(l) && hw[i - 1]?.includes("M 226 292")) {
    hwRight.push(l);
  } else if (isLeft(l)) hwLeft.push(l);
  else if (isRight(l)) hwRight.push(l);
  else hwBody.push(l);
});

const parts = {
  legL: slice(at.legL, at.legR),
  legR: slice(at.legR, at.cloak),
  body: [...slice(at.cloak, at.armL), ...slice(at.neck, at.hardware), ...hwBody],
  armL: [...slice(at.armL, at.armR), ...hwLeft],
  armR: [...slice(at.scythe, at.legL), ...slice(at.armR, at.neck), ...hwRight],
  head: slice(at.head, at.end),
};

mkdirSync(join(root, "fiddlesticks"), { recursive: true });
for (const [name, body] of Object.entries(parts)) {
  writeFileSync(join(root, "fiddlesticks", `${name}.svg`), [...header, ...body, "</svg>", ""].join("\n"));
  console.log(name, body.length, "lines");
}
