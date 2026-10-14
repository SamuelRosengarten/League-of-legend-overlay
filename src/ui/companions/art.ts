// Original chibi vector art for the companions — fan-made and inspired by Gwen and Amumu.
// It is NOT official Riot artwork. Drop-in raster art can replace any pose (see
// src/assets/companions/README.md).
//
// Every pose is drawn in a coordinate system where y = 0 is the panel border the companion
// sits on / hangs from (the "seat line"). Animated parts carry class names that
// styles/companions.css animates with transform/opacity only.

export type CompanionId = "gwen" | "amumu";
export type Pose = "sit" | "stand" | "peek" | "hang";

export interface PoseArt {
  /** viewBox: x, y, width, height (in art units). */
  box: [number, number, number, number];
  svg: (uid: string) => string;
}

// ---------------------------------------------------------------- Gwen ----

const G = {
  hairLight: "#d4f3ff",
  hairMid: "#86cdf3",
  hairDark: "#4a96d4",
  hairLine: "#2f6aa8",
  skin: "#ffeae0",
  skinShade: "#f4c9bb",
  blush: "#ff9fb2",
  eye: "#1b2748",
  iris: "#3aa3f2",
  irisLight: "#9fe0ff",
  dress: "#222a47",
  dressMid: "#34416b",
  collar: "#f8fbff",
  skirtLight: "#f0f9ff",
  skirtMid: "#b7dbf3",
  trim: "#29355a",
  bow: "#161b2c",
  bowHi: "#46557d",
  stocking: "#f6f8ff",
  shoe: "#1a1f31",
};

function gwenDefs(u: string): string {
  return `<defs>
    <linearGradient id="${u}hair" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${G.hairLight}"/><stop offset="0.45" stop-color="${G.hairMid}"/><stop offset="1" stop-color="${G.hairDark}"/>
    </linearGradient>
    <radialGradient id="${u}curl" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${G.hairLight}"/><stop offset="0.6" stop-color="${G.hairMid}"/><stop offset="1" stop-color="${G.hairDark}"/>
    </radialGradient>
    <radialGradient id="${u}iris" cx="0.5" cy="0.75" r="0.7">
      <stop offset="0" stop-color="${G.irisLight}"/><stop offset="0.55" stop-color="${G.iris}"/><stop offset="1" stop-color="${G.eye}"/>
    </radialGradient>
    <linearGradient id="${u}skirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${G.skirtLight}"/><stop offset="1" stop-color="${G.skirtMid}"/>
    </linearGradient>
    <linearGradient id="${u}blade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#c3d2e4"/><stop offset="1" stop-color="#7488a6"/>
    </linearGradient>
    <radialGradient id="${u}holy" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8ff0ff" stop-opacity="0.55"/><stop offset="1" stop-color="#8ff0ff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${u}above"><rect x="-60" y="-200" width="160" height="200"/></clipPath>
  </defs>`;
}

/** One ringlet drill hanging from (x, y). */
function drill(u: string, x: number, y: number, side: "l" | "r"): string {
  const rings = [
    [0, 6.2, 5.4],
    [8, 6.0, 5.0],
    [15.5, 5.3, 4.6],
    [22, 4.5, 4.0],
    [27.5, 3.5, 3.2],
  ] as const;
  const coils = rings
    .map(
      ([dy, rx, ry]) =>
        `<ellipse cx="0" cy="${dy}" rx="${rx}" ry="${ry}" fill="url(#${u}curl)" stroke="${G.hairLine}" stroke-width="0.7"/>` +
        `<path d="M ${-rx * 0.7} ${dy - ry * 0.2} Q 0 ${dy + ry * 0.9} ${rx * 0.75} ${dy - ry * 0.35}" fill="none" stroke="${G.hairLine}" stroke-width="0.6" opacity="0.55"/>`,
    )
    .join("");
  return `<g transform="translate(${x} ${y})"><g class="drill drill-${side}">${coils}<path d="M -2 30 Q 0 35 2.4 30.5" fill="${G.hairDark}"/></g></g>`;
}

function bow(x: number, y: number, flip: boolean): string {
  return `<g transform="translate(${x} ${y}) scale(${flip ? -0.85 : 0.85} 0.85)">
    <path d="M 0 0 C -9 -10 -16 -3 -12 4 C -9 9 -3 4 0 0 Z" fill="${G.bow}" stroke="${G.bowHi}" stroke-width="0.8"/>
    <path d="M 0 0 C 9 -10 16 -3 12 4 C 9 9 3 4 0 0 Z" fill="${G.bow}" stroke="${G.bowHi}" stroke-width="0.8"/>
    <path d="M -1 1 L -5 10 L -2 9 L -1 12 Z M 1 1 L 5 10 L 2 9 L 1 12 Z" fill="${G.bow}"/>
    <circle r="2.6" fill="var(--rank-accent, #8ff0ff)" stroke="${G.bow}" stroke-width="0.9" class="bow-gem"/>
    <circle cx="-0.8" cy="-0.9" r="0.8" fill="#fff" opacity="0.8"/>
  </g>`;
}

/** Head centered at (0, 0); the face is ~24 units in radius. */
function gwenHead(u: string, opts: { drills?: boolean } = {}): string {
  const drills = opts.drills === false ? "" : drill(u, -21, -4, "l") + drill(u, 21, -4, "r");
  const eye = (cx: number) => `
    <ellipse cx="${cx}" cy="4" rx="4.5" ry="5.6" fill="${G.eye}"/>
    <ellipse cx="${cx}" cy="5.2" rx="3.7" ry="4.2" fill="url(#${u}iris)"/>
    <circle cx="${cx - 1.5}" cy="2" r="1.6" fill="#fff"/>
    <circle cx="${cx + 1.5}" cy="6.8" r="0.8" fill="#fff" opacity="0.9"/>
    <path d="M ${cx - 4.9} ${-0.2} Q ${cx} ${-3.3} ${cx + 4.9} ${-0.4}" fill="none" stroke="${G.eye}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M ${cx + (cx > 0 ? 4.6 : -4.6)} ${-0.5} l ${cx > 0 ? 1.6 : -1.6} -1.4" stroke="${G.eye}" stroke-width="1.1" stroke-linecap="round"/>`;
  return `
    <ellipse cx="0" cy="-5" rx="25" ry="22.5" fill="url(#${u}hair)" stroke="${G.hairLine}" stroke-width="0.8"/>
    ${drills}
    <ellipse cx="0" cy="2.5" rx="18.5" ry="17" fill="${G.skin}"/>
    <ellipse cx="0" cy="14" rx="11" ry="4" fill="${G.skinShade}" opacity="0.35"/>
    <path d="M -24 0 C -25 -18 -12 -28 0 -28 C 12 -28 25 -18 24 0 L 21.5 7 Q 19.5 -4 15 -4.5 Q 11.5 -1 7.5 -7 Q 3.5 -1.5 0 -8.5 Q -3.5 -1.5 -7.5 -7 Q -11.5 -1 -15 -4.5 Q -19.5 -4 -21.5 7 Z"
      fill="url(#${u}hair)" stroke="${G.hairLine}" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M -14 -20 Q -6 -25 3 -24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
    <g class="eyes">${eye(-7.6)}${eye(7.6)}</g>
    <ellipse cx="-12" cy="10" rx="3.1" ry="1.8" fill="${G.blush}" opacity="0.5"/>
    <ellipse cx="12" cy="10" rx="3.1" ry="1.8" fill="${G.blush}" opacity="0.5"/>
    <path class="mouth" d="M -2.2 12 Q 0 13.8 2.2 12" fill="none" stroke="#c45f70" stroke-width="1" stroke-linecap="round"/>
    ${bow(-19, -13, false)}${bow(19, -13, true)}`;
}

/** Gwen's shears, pivot at (0,0), blades pointing up (-y). */
function scissors(u: string, open = 7): string {
  // Static opening angle on the outer group; the snip animation runs on the inner one.
  const blade = (rot: number, cls: string) => `
    <g transform="rotate(${rot})"><g class="${cls}">
      <path d="M -3.6 1 Q -3.4 -22 -0.3 -40 Q 3.6 -22 3.8 1 Z" fill="url(#${u}blade)" stroke="#2c3a57" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M 0 -3 L -0.2 -35" stroke="#ffffff" stroke-width="0.9" opacity="0.9"/>
      <path d="M 2.6 -2 Q 2.4 -20 -0.2 -36" fill="none" stroke="#8ff0ff" stroke-width="0.6" opacity="0.8"/>
    </g></g>`;
  return `
    <ellipse cx="0" cy="-20" rx="13" ry="27" fill="url(#${u}holy)" class="holy"/>
    <circle cx="-4.6" cy="9" r="4.3" fill="none" stroke="${G.shoe}" stroke-width="2.4"/>
    <circle cx="4.8" cy="9.6" r="4.3" fill="none" stroke="${G.shoe}" stroke-width="2.4"/>
    <path d="M -2.6 5 L -1 1 M 2.8 5.4 L 1 1" stroke="${G.shoe}" stroke-width="2.4" stroke-linecap="round"/>
    ${blade(-open / 2, "blade blade-a")}${blade(open / 2, "blade blade-b")}
    <circle r="1.9" fill="var(--rank-accent, #8ff0ff)" stroke="${G.shoe}" stroke-width="0.8"/>`;
}

function sparkle(x: number, y: number, s = 1, cls = "sparkle"): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path class="${cls}" d="M 0 -4.5 Q 0.9 -0.9 4.5 0 Q 0.9 0.9 0 4.5 Q -0.9 0.9 -4.5 0 Q -0.9 -0.9 0 -4.5 Z" fill="var(--rank-accent, #bff6ff)"/></g>`;
}

function gwenBodice(): string {
  return `
    <path d="M -8.5 -26 L 8.5 -26 L 10.5 -12 L -10.5 -12 Z" fill="${G.dress}" stroke="#141a2e" stroke-width="0.6" stroke-linejoin="round"/>
    <circle cx="-3.6" cy="-25" r="4.4" fill="${G.collar}" stroke="#c9d6e6" stroke-width="0.5"/>
    <circle cx="3.6" cy="-25" r="4.4" fill="${G.collar}" stroke="#c9d6e6" stroke-width="0.5"/>
    <path d="M -2.4 -19.5 L 0 -18 L 2.4 -19.5 L 2.4 -16.5 L 0 -18 L -2.4 -16.5 Z" fill="${G.iris}"/>`;
}

function leg(x: number, side: "l" | "r", len = 12): string {
  return `<g transform="translate(${x} -1)"><g class="leg leg-${side}">
    <rect x="-2.6" y="0" width="5.2" height="${len}" rx="2.4" fill="${G.stocking}" stroke="#c8d2e6" stroke-width="0.5"/>
    <ellipse cx="${side === "l" ? -0.6 : 0.6}" cy="${len + 0.6}" rx="3.9" ry="2.5" fill="${G.shoe}"/>
    <path d="M -2.4 ${len - 2.2} L 2.4 ${len - 2.2}" stroke="${G.shoe}" stroke-width="1"/>
  </g></g>`;
}

function arm(from: [number, number], to: [number, number]): string {
  return `<circle cx="${from[0]}" cy="${from[1]}" r="4.3" fill="${G.dressMid}"/>
    <path d="M ${from[0]} ${from[1] + 2} L ${to[0]} ${to[1]}" stroke="${G.skin}" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="${to[0]}" cy="${to[1]}" r="2.6" fill="${G.skin}" stroke="${G.skinShade}" stroke-width="0.5"/>`;
}

const GWEN: Record<Pose, PoseArt> = {
  // Sitting on the border, legs dangling, shears propped beside her.
  sit: {
    box: [-32, -76, 72, 96],
    svg: (u) => `${gwenDefs(u)}
      <g class="body">
        ${leg(-6, "l")}${leg(6, "r")}
        <g transform="translate(21 -13)"><g class="shears">${scissors(u)}</g></g>
        <path d="M -10.5 -14 C -17 -8 -23 -2.5 -25 0 L 25 0 C 23 -2.5 17 -8 10.5 -14 Z" fill="url(#${u}skirt)" stroke="${G.trim}" stroke-width="0.8"/>
        <path d="M -25 0 Q -21 -2.6 -17 0 Q -13 -2.6 -9 0 Q -5 -2.6 -1 0 Q 3 -2.6 7 0 Q 11 -2.6 15 0 Q 19 -2.6 25 0" fill="none" stroke="${G.trim}" stroke-width="1.6"/>
        ${gwenBodice()}
        ${arm([-10, -23], [-13, -10])}
        ${arm([10, -23], [17, -15])}
        <g class="head" transform="translate(0 -46)"><g class="head-tilt">${gwenHead(u)}</g></g>
        ${sparkle(30, -50, 0.9)}
      </g>`,
  },
  // Standing on the border, holding the shears like a staff.
  stand: {
    box: [-32, -92, 72, 96],
    svg: (u) => `${gwenDefs(u)}
      <g class="body">
        ${leg(-5, "l", 13).replace('class="leg leg-l"', 'class="leg-still"').replace("translate(-5 -1)", "translate(-5 -14)")}
        ${leg(5, "r", 13).replace('class="leg leg-r"', 'class="leg-still"').replace("translate(5 -1)", "translate(5 -14)")}
        <g transform="translate(19 -33)"><g class="shears">${scissors(u, 3)}</g></g>
        <path d="M -10.5 -28 C -15 -22 -18 -17 -19 -13 L 19 -13 C 18 -17 15 -22 10.5 -28 Z" fill="url(#${u}skirt)" stroke="${G.trim}" stroke-width="0.8"/>
        <path d="M -19 -13 Q -15 -15.4 -11 -13 Q -7 -15.4 -3 -13 Q 1 -15.4 5 -13 Q 9 -15.4 13 -13 Q 16 -15 19 -13" fill="none" stroke="${G.trim}" stroke-width="1.6"/>
        <g transform="translate(0 -14)">${gwenBodice()}</g>
        ${arm([-10, -37], [-14, -25])}
        ${arm([10, -37], [17, -30])}
        <g class="head" transform="translate(0 -60)"><g class="head-tilt">${gwenHead(u)}</g></g>
        ${sparkle(28, -72, 0.9)}
      </g>`,
  },
  // Peeking over the border: eyes, bows and hands only.
  peek: {
    box: [-32, -46, 72, 52],
    svg: (u) => `${gwenDefs(u)}
      <g class="peek">
        <g clip-path="url(#${u}above)">
          <g transform="translate(24 -2) rotate(8)">${scissors(u, 10).replace(/<circle cx="-4.6"[\s\S]*?stroke-linecap="round"\/>/, "")}</g>
          <g class="head" transform="translate(0 -15)"><g class="head-tilt">${gwenHead(u, { drills: false })}</g></g>
        </g>
        <ellipse cx="-12" cy="0.5" rx="4.4" ry="3.1" fill="${G.skin}" stroke="${G.skinShade}" stroke-width="0.6"/>
        <ellipse cx="12" cy="0.5" rx="4.4" ry="3.1" fill="${G.skin}" stroke="${G.skinShade}" stroke-width="0.6"/>
        ${sparkle(-26, -30, 0.7)}
      </g>`,
  },
  // Hanging from the border by both hands, shears hooked over the edge.
  hang: {
    box: [-32, -8, 72, 96],
    svg: (u) => `${gwenDefs(u)}
      <g transform="translate(25 2) rotate(180)"><g class="shears">${scissors(u, 4)}</g></g>
      <g class="swing">
        ${leg(-5, "l", 12).replace("translate(-5 -1)", "translate(-5 68)")}
        ${leg(5, "r", 12).replace("translate(5 -1)", "translate(5 68)")}
        <path d="M -10.5 54 C -15 60 -18 64 -19 68 L 19 68 C 18 64 15 60 10.5 54 Z" fill="url(#${u}skirt)" stroke="${G.trim}" stroke-width="0.8"/>
        <path d="M -19 68 Q -15 65.6 -11 68 Q -7 65.6 -3 68 Q 1 65.6 5 68 Q 9 65.6 13 68 Q 16 66 19 68" fill="none" stroke="${G.trim}" stroke-width="1.6"/>
        <g transform="translate(0 66)">${gwenBodice()}</g>
        <circle cx="-10" cy="44" r="4.3" fill="${G.dressMid}"/><circle cx="10" cy="44" r="4.3" fill="${G.dressMid}"/>
        <path d="M -11 42 L -13 2 M 11 42 L 13 2" stroke="${G.skin}" stroke-width="3.6" stroke-linecap="round"/>
        <g class="head" transform="translate(0 24)"><g class="head-tilt">${gwenHead(u)}</g></g>
        <ellipse cx="-13" cy="0.5" rx="4" ry="3" fill="${G.skin}" stroke="${G.skinShade}" stroke-width="0.6"/>
        <ellipse cx="13" cy="0.5" rx="4" ry="3" fill="${G.skin}" stroke="${G.skinShade}" stroke-width="0.6"/>
      </g>
      ${sparkle(31, 40, 0.8)}`,
  },
};

// --------------------------------------------------------------- Amumu ----

const A = {
  light: "#c3d8b6",
  mid: "#93b088",
  dark: "#678563",
  line: "#4b6649",
  socket: "#232a25",
  glowCore: "#fff3a8",
  glow: "#ffc93c",
  glowEdge: "#ff8f1f",
  tear: "#9fdcff",
};

function amumuDefs(u: string): string {
  return `<defs>
    <radialGradient id="${u}wrap" cx="0.35" cy="0.3" r="0.85">
      <stop offset="0" stop-color="${A.light}"/><stop offset="0.6" stop-color="${A.mid}"/><stop offset="1" stop-color="${A.dark}"/>
    </radialGradient>
    <radialGradient id="${u}eye" cx="0.45" cy="0.45" r="0.6">
      <stop offset="0" stop-color="${A.glowCore}"/><stop offset="0.5" stop-color="${A.glow}"/><stop offset="1" stop-color="${A.glowEdge}"/>
    </radialGradient>
    <radialGradient id="${u}aura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#9dffb4" stop-opacity="0.22"/><stop offset="1" stop-color="#9dffb4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${u}eyeglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${A.glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${A.glow}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${u}head"><ellipse cx="0" cy="0" rx="20.5" ry="19"/></clipPath>
    <clipPath id="${u}above"><rect x="-60" y="-200" width="160" height="200"/></clipPath>
  </defs>`;
}

/** Wrapped blob of radius ~20 centered at (0,0), with bandage seams. */
function wraps(u: string, rx: number, ry: number, seams: string[]): string {
  return `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="url(#${u}wrap)" stroke="${A.line}" stroke-width="0.9"/>
    ${seams.map((d) => `<path d="${d}" fill="none" stroke="${A.line}" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/>`).join("")}`;
}

function amumuHead(u: string): string {
  const eye = (cx: number) => `
    <ellipse cx="${cx}" cy="3" rx="6.2" ry="5.9" fill="${A.socket}"/>
    <ellipse cx="${cx}" cy="3.3" rx="4.6" ry="4.9" fill="url(#${u}eye)"/>
    <circle cx="${cx - 1.6}" cy="1.4" r="1.6" fill="#fff"/>
    <circle cx="${cx + 1.5}" cy="5.2" r="0.7" fill="#fff" opacity="0.85"/>`;
  return `
    <circle cx="0" cy="2" r="31" fill="url(#${u}aura)" class="aura"/>
    <g class="tail"><path d="M 17 -8 C 25 -14 29 -6 35 -10 C 38 -12 40 -9 39 -6" fill="none" stroke="${A.mid}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M 17 -8 C 25 -14 29 -6 35 -10" fill="none" stroke="${A.line}" stroke-width="0.7" opacity="0.6"/></g>
    <ellipse cx="0" cy="0" rx="20.5" ry="19" fill="url(#${u}wrap)" stroke="${A.line}" stroke-width="0.9"/>
    <g clip-path="url(#${u}head)">
      <path d="M -24 -12 Q 0 -19 24 -8" fill="none" stroke="${A.line}" stroke-width="1.1" opacity="0.7"/>
      <path d="M -24 -5 Q 0 -10 24 -1" fill="none" stroke="${A.line}" stroke-width="1.1" opacity="0.6"/>
      <path d="M -24 11 Q 0 6 24 14" fill="none" stroke="${A.line}" stroke-width="1.1" opacity="0.7"/>
      <path d="M -24 17 Q 0 13 24 21" fill="none" stroke="${A.line}" stroke-width="1.1" opacity="0.6"/>
      <path d="M -20 -16 Q -4 -21 12 -18" fill="none" stroke="#e6f2dc" stroke-width="1.6" opacity="0.5"/>
      <circle cx="-7.6" cy="3" r="9" fill="url(#${u}eyeglow)"/><circle cx="7.6" cy="3" r="9" fill="url(#${u}eyeglow)"/>
    </g>
    <g class="eyes">${eye(-7.6)}${eye(7.6)}</g>
    <path d="M -13.5 -4 L -3.5 -6.8" stroke="${A.dark}" stroke-width="3" stroke-linecap="round"/>
    <path d="M 13.5 -4 L 3.5 -6.8" stroke="${A.dark}" stroke-width="3" stroke-linecap="round"/>
    <path class="mouth" d="M -2.8 12.4 Q 0 10.6 2.8 12.4" fill="none" stroke="${A.socket}" stroke-width="1.1" stroke-linecap="round"/>
    <path class="tear" d="M -11.5 8 Q -13.2 11.4 -11.5 12.6 Q -9.8 11.4 -11.5 8 Z" fill="${A.tear}" stroke="#5fa8d8" stroke-width="0.4"/>`;
}

function mitt(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="5.2" ry="4.2" fill="${A.light}" stroke="${A.line}" stroke-width="0.8"/>
    <path d="M ${x - 3.4} ${y - 0.6} L ${x + 3.4} ${y + 0.4}" stroke="${A.line}" stroke-width="0.6" opacity="0.7"/>`;
}

function charm(x: number, y: number): string {
  return `<path d="M ${x} ${y - 3} L ${x + 2.4} ${y} L ${x} ${y + 3} L ${x - 2.4} ${y} Z" fill="var(--rank-accent, #ffd34d)" stroke="${A.line}" stroke-width="0.6" class="charm"/>`;
}

const AMUMU: Record<Pose, PoseArt> = {
  // Sitting on the border hugging his knees, a little sad.
  sit: {
    box: [-34, -60, 78, 68],
    svg: (u) => `${amumuDefs(u)}
      <g class="body">
        <ellipse cx="-6" cy="2.2" rx="4.4" ry="3" fill="${A.mid}" stroke="${A.line}" stroke-width="0.7"/>
        <ellipse cx="6" cy="2.2" rx="4.4" ry="3" fill="${A.mid}" stroke="${A.line}" stroke-width="0.7"/>
        <g transform="translate(0 -9)">${wraps(u, 14, 10, ["M -14 -2 Q 0 -6 14 -1", "M -13 4 Q 0 1 13 5"])}</g>
        ${charm(-7, -12)}
        <ellipse cx="-6" cy="-6" rx="5" ry="4.2" fill="${A.light}" stroke="${A.line}" stroke-width="0.7"/>
        <ellipse cx="6" cy="-6" rx="5" ry="4.2" fill="${A.light}" stroke="${A.line}" stroke-width="0.7"/>
        <path d="M -12 -14 Q -10 -6 -4 -5 M 12 -14 Q 10 -6 4 -5" fill="none" stroke="${A.mid}" stroke-width="4" stroke-linecap="round"/>
        <g class="head" transform="translate(0 -32)"><g class="head-tilt">${amumuHead(u)}</g></g>
      </g>`,
  },
  stand: {
    box: [-34, -60, 78, 68],
    svg: (u) => AMUMU.sit.svg(u),
  },
  // Peeking over the border with both mitts on the edge.
  peek: {
    box: [-34, -46, 78, 52],
    svg: (u) => `${amumuDefs(u)}
      <g class="peek">
        <g clip-path="url(#${u}above)"><g class="head" transform="translate(0 -14)"><g class="head-tilt">${amumuHead(u)}</g></g></g>
        ${mitt(-13, 0.5)}${mitt(13, 0.5)}
      </g>`,
  },
  // Dangling from the border by both arms, bandage trailing.
  hang: {
    box: [-34, -8, 78, 72],
    svg: (u) => `${amumuDefs(u)}
      <g class="swing">
        <path d="M -9 34 L -11 3 M 9 34 L 11 3" stroke="${A.line}" stroke-width="7.4" stroke-linecap="round"/>
        <path d="M -9 34 L -11 3 M 9 34 L 11 3" stroke="${A.mid}" stroke-width="6" stroke-linecap="round"/>
        <path d="M -10.4 24 L -8.2 25 M -10.8 14 L -8.6 15 M 10.4 24 L 8.2 25 M 10.8 14 L 8.6 15" stroke="${A.line}" stroke-width="0.6"/>
        <ellipse cx="-5" cy="56" rx="3.6" ry="4.6" fill="${A.mid}" stroke="${A.line}" stroke-width="0.7" class="leg leg-l"/>
        <ellipse cx="5" cy="56" rx="3.6" ry="4.6" fill="${A.mid}" stroke="${A.line}" stroke-width="0.7" class="leg leg-r"/>
        <g transform="translate(0 47)">${wraps(u, 12.5, 9.5, ["M -13 -3 Q 0 -6 13 -1", "M -12 3 Q 0 1 12 5"])}</g>
        ${charm(5, 44)}
        <g class="head" transform="translate(0 25)"><g class="head-tilt">${amumuHead(u)}</g></g>
        ${mitt(-11, 0.5)}${mitt(11, 0.5)}
      </g>`,
  },
};

export const ART: Record<CompanionId, Record<Pose, PoseArt>> = { gwen: GWEN, amumu: AMUMU };
