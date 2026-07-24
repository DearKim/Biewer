// WebGL2 volume raycaster — true 3D rendering of a scalar VolumeData.
//
// Approach: upload the volume as an R8 3D texture (intensity normalized to
// [0,1]). Draw a full-screen quad; per fragment, reconstruct a world-space ray
// from the inverse view-projection, intersect the volume's physical AABB, march
// front-to-back and composite. Two modes:
//   - 'dvr' : emissive/absorption compositing (solid 3D look)
//   - 'mip' : maximum-intensity projection (angio/vessel look)
//
// No external deps, no framework. Renderer owns GL resources; camera + input
// live in volumeView. WebGL2 is required (sampler3D / texImage3D).
import type { VolumeData } from '../types';
import { type Vec3, type Quat, identity, perspective, lookAt, multiply, invert, rotateVec3ByQuat } from './mat4';

export type VolumeRenderMode = 'dvr' | 'mip';

export interface VolumeCamera {
  /** free orientation quaternion (no gimbal lock → full 360° tumble) */
  q: Quat;
  distance: number;  // in normalized units (box longest edge = 1)
}

export interface VolumeRenderState {
  mode: VolumeRenderMode;
  /** window as a sub-range of normalized intensity [0,1] */
  window: { lo: number; hi: number };
  opacity: number;   // DVR density gain
  invert: boolean;
  steps: number;     // ray samples
}

export interface VolumeRenderer {
  render(camera: VolumeCamera): void;
  setState(patch: Partial<VolumeRenderState>): void;
  getState(): VolumeRenderState;
  resize(cssW: number, cssH: number, dpr: number): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform sampler3D uTex;
uniform vec2 uRes;
uniform float uLo;
uniform float uHi;
uniform float uOpacity;
uniform int uMode;    // 0 dvr, 1 mip
uniform int uInvert;
uniform int uSteps;
out vec4 frag;

vec3 unproject(vec2 ndc, float z){
  vec4 p = uInvViewProj * vec4(ndc, z, 1.0);
  return p.xyz / p.w;
}
bool hitBox(vec3 ro, vec3 rd, out float t0, out float t1){
  vec3 inv = 1.0 / rd;
  vec3 a = (uBoxMin - ro) * inv;
  vec3 b = (uBoxMax - ro) * inv;
  vec3 tmn = min(a, b), tmx = max(a, b);
  t0 = max(max(tmn.x, tmn.y), tmn.z);
  t1 = min(min(tmx.x, tmx.y), tmx.z);
  return t1 > max(t0, 0.0);
}
float win(float v){ return clamp((v - uLo) / max(1e-4, uHi - uLo), 0.0, 1.0); }

void main(){
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 nearP = unproject(ndc, -1.0);
  vec3 farP  = unproject(ndc,  1.0);
  vec3 rd = normalize(farP - nearP);
  vec3 ro = uCamPos;
  float t0, t1;
  if(!hitBox(ro, rd, t0, t1)){ frag = vec4(0.04, 0.05, 0.06, 1.0); return; }
  t0 = max(t0, 0.0);
  float dt = (t1 - t0) / float(uSteps);
  vec3 span = uBoxMax - uBoxMin;
  float maxv = 0.0;
  float acc = 0.0;
  vec3 col = vec3(0.0);
  for(int i = 0; i < 1024; i++){
    if(i >= uSteps) break;
    float t = t0 + (float(i) + 0.5) * dt;
    vec3 uvw = (ro + rd * t - uBoxMin) / span;
    float s = texture(uTex, uvw).r;
    float w = win(s);
    if(uInvert == 1) w = 1.0 - w;
    if(uMode == 1){
      maxv = max(maxv, w);
    } else {
      float a = w * w * uOpacity;
      // slight depth cue: nearer samples a touch brighter
      col += (1.0 - acc) * a * vec3(w);
      acc += (1.0 - acc) * a;
      if(acc > 0.98) break;
    }
  }
  vec3 outc = (uMode == 1) ? vec3(maxv) : col;
  // composite over the dark background so silhouettes read cleanly
  vec3 bg = vec3(0.04, 0.05, 0.06);
  outc = (uMode == 1) ? outc : outc + (1.0 - acc) * bg;
  frag = vec4(outc, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('volume shader compile failed: ' + log);
  }
  return sh;
}

export function createVolumeRenderer(canvas: HTMLCanvasElement, volume: VolumeData): VolumeRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    const e: Error & { code?: string } = new Error('이 브라우저는 WebGL2를 지원하지 않아 3D 볼륨 렌더를 사용할 수 없습니다');
    e.code = 'DECODE_FAILED';
    throw e;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('volume program link failed: ' + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // full-screen quad
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // 3D texture: normalize intensity to [0,255]
  const [nx, ny, nz] = volume.dims;
  const norm = new Uint8Array(nx * ny * nz);
  const range = volume.max - volume.min || 1;
  const src = volume.data;
  for (let i = 0; i < norm.length; i++) {
    let v = (src[i] - volume.min) / range;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    norm[i] = (v * 255) | 0;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, nx, ny, nz, 0, gl.RED, gl.UNSIGNED_BYTE, norm);

  // physical extent normalized so the longest edge = 1, centered at origin
  const ext: Vec3 = [nx * volume.spacing[0], ny * volume.spacing[1], nz * volume.spacing[2]];
  const longest = Math.max(ext[0], ext[1], ext[2]) || 1;
  const half: Vec3 = [ext[0] / longest / 2, ext[1] / longest / 2, ext[2] / longest / 2];
  const boxMin: Vec3 = [-half[0], -half[1], -half[2]];
  const boxMax: Vec3 = [half[0], half[1], half[2]];

  const U = {
    invVP: gl.getUniformLocation(prog, 'uInvViewProj'),
    camPos: gl.getUniformLocation(prog, 'uCamPos'),
    boxMin: gl.getUniformLocation(prog, 'uBoxMin'),
    boxMax: gl.getUniformLocation(prog, 'uBoxMax'),
    res: gl.getUniformLocation(prog, 'uRes'),
    lo: gl.getUniformLocation(prog, 'uLo'),
    hi: gl.getUniformLocation(prog, 'uHi'),
    opacity: gl.getUniformLocation(prog, 'uOpacity'),
    mode: gl.getUniformLocation(prog, 'uMode'),
    invert: gl.getUniformLocation(prog, 'uInvert'),
    steps: gl.getUniformLocation(prog, 'uSteps'),
    tex: gl.getUniformLocation(prog, 'uTex'),
  };
  gl.uniform3fv(U.boxMin, boxMin);
  gl.uniform3fv(U.boxMax, boxMax);
  gl.uniform1i(U.tex, 0);

  const state: VolumeRenderState = {
    mode: 'dvr',
    window: { lo: 0.12, hi: 1.0 },
    opacity: 0.4,
    invert: false,
    steps: 256,
  };

  const proj = identity(new Float32Array(16));
  const view = identity(new Float32Array(16));
  const vp = new Float32Array(16);
  const invVP = new Float32Array(16);
  let vw = 1, vh = 1;

  function resize(cssW: number, cssH: number, dpr: number) {
    vw = Math.max(1, Math.round(cssW * dpr));
    vh = Math.max(1, Math.round(cssH * dpr));
    canvas.width = vw;
    canvas.height = vh;
    gl!.viewport(0, 0, vw, vh);
  }

  function render(cam: VolumeCamera) {
    const g = gl!;
    // camera orbits a fixed axis-aligned box; the quaternion tumbles the eye AND
    // its up-vector together, so eye⊥up always holds → no gimbal lock, full 360°.
    const eye = rotateVec3ByQuat([0, 0, cam.distance], cam.q);
    const up = rotateVec3ByQuat([0, 1, 0], cam.q);
    lookAt(view, eye, [0, 0, 0], up);
    perspective(proj, (45 * Math.PI) / 180, vw / vh, 0.01, 100);
    multiply(vp, proj, view);
    if (!invert(invVP, vp)) return;

    g.useProgram(prog);
    g.uniformMatrix4fv(U.invVP, false, invVP);
    g.uniform3fv(U.camPos, eye);
    g.uniform2f(U.res, vw, vh);
    g.uniform1f(U.lo, state.window.lo);
    g.uniform1f(U.hi, state.window.hi);
    g.uniform1f(U.opacity, state.opacity);
    g.uniform1i(U.mode, state.mode === 'mip' ? 1 : 0);
    g.uniform1i(U.invert, state.invert ? 1 : 0);
    g.uniform1i(U.steps, state.steps);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_3D, tex);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  return {
    render,
    setState(patch) {
      Object.assign(state, patch);
      if (patch.window) state.window = { ...state.window, ...patch.window };
    },
    getState: () => ({ ...state, window: { ...state.window } }),
    resize,
    dispose() {
      const g = gl!;
      g.deleteTexture(tex);
      g.deleteBuffer(quad);
      g.deleteProgram(prog);
      const lose = g.getExtension('WEBGL_lose_context');
      lose?.loseContext();
    },
  };
}
