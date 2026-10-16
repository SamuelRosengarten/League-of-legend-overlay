// WebGL drawing of a skinned companion mesh (see mesh-core.ts). One small canvas per companion,
// slightly larger than the sprite so swinging parts (the scissors, the hair) are not clipped.
// The texture is the original painted PNG, uploaded once with premultiplied alpha and mipmaps, so
// the rest pose looks exactly like the plain image.
import { type Bone, type Mat, type Mesh, type RigDef, buildMesh, skin, worldMatrices, type BonePose } from "./mesh-core";

const VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec4 uMap; // x scale, y scale, x offset, y offset: texture px -> clip space
varying vec2 vUv;
void main() {
  gl_Position = vec4(aPos.x * uMap.x + uMap.z, aPos.y * uMap.y + uMap.w, 0.0, 1.0);
  vUv = aUv;
}`;
const FRAG = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

export class MeshRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly bones: Bone[];
  /** False if WebGL or the texture is unavailable: the caller keeps showing the plain image. */
  ready = false;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private mesh: Mesh;
  private posed: Float32Array;
  private posBuf: WebGLBuffer | null = null;
  private uMap: WebGLUniformLocation | null = null;
  private world: Mat[] = [];

  constructor(
    private def: RigDef,
    image: HTMLImageElement,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "sprite-mesh";
    this.bones = def.bones;
    this.mesh = buildMesh(def);
    this.posed = new Float32Array(this.mesh.rest.length);
    const init = () => this.init(image);
    if (image.complete && image.naturalWidth) init();
    else image.addEventListener("load", init, { once: true });
  }

  private init(image: HTMLImageElement) {
    const gl = (this.canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: true }) ??
      this.canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true })) as WebGLRenderingContext | null;
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const bind = (name: string, data: Float32Array, usage: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      return buf;
    };
    this.posBuf = bind("aPos", this.mesh.rest, gl.DYNAMIC_DRAW);
    bind("aUv", this.mesh.uv, gl.STATIC_DRAW);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    if (webgl2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    this.uMap = gl.getUniformLocation(prog, "uMap");
    // texture px (with the margin around it) -> clip space, y flipped
    const m = this.def.margin;
    const W = this.def.width + 2 * m;
    const H = this.def.height + 2 * m;
    gl.uniform4f(this.uMap, 2 / W, -2 / H, (2 * m) / W - 1, 1 - (2 * m) / H);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;
    this.ready = true;
  }

  /** Canvas size: the sprite plus the margin on every side. `cssScale` = css px per texture px. */
  resize(cssScale: number, dpr: number) {
    const m = this.def.margin;
    const w = (this.def.width + 2 * m) * cssScale;
    const h = (this.def.height + 2 * m) * cssScale;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.left = `${-m * cssScale}px`;
    this.canvas.style.top = `${-m * cssScale}px`;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Poses the bones and draws one frame. Returns the world matrices (for the face overlay). */
  render(poses: (BonePose | undefined)[]): Mat[] {
    this.world = worldMatrices(this.def.bones, poses);
    const gl = this.gl;
    if (!gl || !this.ready) return this.world;
    skin(this.mesh, this.world, this.posed);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.posed);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    return this.world;
  }
}
