// Skeletal mesh puppets (pure maths, no DOM): the painted companion art is laid on a grid mesh, and
// each vertex follows up to four bones (linear blend skinning). Animating the bones bends the
// painting itself (legs step, hair and ribbons swing, the skirt flares, the scissors arm swings)
// instead of sliding a flat picture. mesh-gl.ts draws the result with WebGL.
//
// Coordinates are texture pixels. A bone has a pivot (its joint, in rest coordinates) and a parent;
// its local pose is a rotation / scale about the pivot plus a translation.

/** 2×3 affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** `m` applied after `n` (so the result maps p → m(n(p))). */
export function compose(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export interface Bone {
  name: string;
  /** Index of the parent bone, or -1. A parent must come before its children. */
  parent: number;
  /** The joint, in rest (texture) coordinates. */
  pivot: [number, number];
}

/** A bone's local pose: degrees clockwise, scale and translation (texture px). */
export interface BonePose {
  rot?: number;
  sx?: number;
  sy?: number;
  tx?: number;
  ty?: number;
}

/** A soft elliptical region that pulls the vertices inside it toward `bone`. */
export interface Region {
  bone: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Optional rotation of the ellipse (deg) for diagonal shapes like the scissor blade. */
  angle?: number;
}

export interface RigDef {
  width: number;
  height: number;
  /** Extra room around the texture the posed mesh may use (texture px). */
  margin: number;
  bones: Bone[];
  /** Bone that holds everything not claimed by a region. */
  base: string;
  regions: Region[];
  cols: number;
  rows: number;
}

function local(b: Bone, p: BonePose | undefined): Mat {
  const r = ((p?.rot ?? 0) * Math.PI) / 180;
  const sx = p?.sx ?? 1;
  const sy = p?.sy ?? 1;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = cos * sx;
  const bb = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const [px, py] = b.pivot;
  return [a, bb, c, d, px + (p?.tx ?? 0) - (a * px + c * py), py + (p?.ty ?? 0) - (bb * px + d * py)];
}

/** World matrices (rest coordinates → posed coordinates) for every bone. */
export function worldMatrices(bones: Bone[], poses: (BonePose | undefined)[]): Mat[] {
  const out: Mat[] = [];
  bones.forEach((b, i) => {
    const l = local(b, poses[i]);
    out.push(b.parent >= 0 ? compose(out[b.parent]!, l) : l);
  });
  return out;
}

export interface Mesh {
  /** Rest positions, x/y interleaved. */
  rest: Float32Array;
  /** Texture coordinates (0–1), u/v interleaved. */
  uv: Float32Array;
  indices: Uint16Array;
  /** Per vertex: up to 4 bone indices and weights (weights sum to 1). */
  boneIdx: Uint8Array;
  weights: Float32Array;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Weight of `region` at a point: 1 inside the core, fading smoothly to 0 at the edge. */
export function regionWeight(r: Region, x: number, y: number): number {
  let dx = x - r.cx;
  let dy = y - r.cy;
  if (r.angle) {
    const a = (-r.angle * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  const d = Math.hypot(dx / r.rx, dy / r.ry);
  return d >= 1 ? 0 : smooth(Math.min(1, (1 - d) / 0.5));
}

export function buildMesh(def: RigDef): Mesh {
  const { cols, rows, width, height } = def;
  const nv = (cols + 1) * (rows + 1);
  const rest = new Float32Array(nv * 2);
  const uv = new Float32Array(nv * 2);
  const boneIdx = new Uint8Array(nv * 4);
  const weights = new Float32Array(nv * 4);
  const index = new Map(def.bones.map((b, i) => [b.name, i]));
  const baseIdx = index.get(def.base);
  if (baseIdx === undefined) throw new Error(`unknown base bone ${def.base}`);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const v = j * (cols + 1) + i;
      const x = (i / cols) * width;
      const y = (j / rows) * height;
      rest[v * 2] = x;
      rest[v * 2 + 1] = y;
      uv[v * 2] = i / cols;
      uv[v * 2 + 1] = j / rows;
      // Raw influences from the regions, the base bone takes what is left.
      const raw = new Map<number, number>();
      let total = 0;
      for (const r of def.regions) {
        const w = regionWeight(r, x, y);
        if (w <= 0) continue;
        const bi = index.get(r.bone);
        if (bi === undefined) throw new Error(`unknown bone ${r.bone}`);
        raw.set(bi, Math.max(raw.get(bi) ?? 0, w));
        total += w;
      }
      const strongest = Math.max(0, ...raw.values());
      raw.set(baseIdx, (raw.get(baseIdx) ?? 0) + (1 - Math.min(1, strongest)));
      const top = [...raw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      top.forEach(([bi, w], k) => {
        boneIdx[v * 4 + k] = bi;
        weights[v * 4 + k] = w / sum;
      });
    }
  }
  const indices = new Uint16Array(cols * rows * 6);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { rest, uv, indices, boneIdx, weights };
}

/** Linear blend skinning: writes the posed vertex positions into `out`. */
export function skin(mesh: Mesh, world: Mat[], out: Float32Array) {
  const n = mesh.rest.length / 2;
  for (let v = 0; v < n; v++) {
    const x = mesh.rest[v * 2]!;
    const y = mesh.rest[v * 2 + 1]!;
    let px = 0;
    let py = 0;
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[v * 4 + k]!;
      if (w === 0) continue;
      const m = world[mesh.boneIdx[v * 4 + k]!]!;
      px += w * (m[0] * x + m[2] * y + m[4]);
      py += w * (m[1] * x + m[3] * y + m[5]);
    }
    out[v * 2] = px;
    out[v * 2 + 1] = py;
  }
}

/** The matrix a rigid overlay (the eyelids) follows with a bone, in texture px. */
export function boneMatrix(world: Mat[], bones: Bone[], name: string): Mat {
  const i = bones.findIndex((b) => b.name === name);
  return i < 0 ? IDENTITY : world[i]!;
}
