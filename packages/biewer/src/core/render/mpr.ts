// WebGL2 affine MPR — render one arbitrary plane of a volume by sampling the 3D
// texture through the voxel→world affine. Given a plane (world origin + two
// world span vectors), each fragment maps screen→world→voxel→texcoord and reads
// the volume. This reslices ANY orientation (axial/coronal/sagittal or oblique)
// correctly, and shares the same 3D texture concept as the VR raycaster.
import type { VolumeData } from '../types';
import { type Mat4, type Vec3, identity, invert } from './mat4';

export interface MPRPlane {
  origin: Vec3;                 // world position of screen top-left (s=0,t=0)
  u: Vec3;                      // world vector across screen width (s: 0→1)
  v: Vec3;                      // world vector down screen height (t: 0→1)
  window: { lo: number; hi: number };
  invert: boolean;
}

export interface MPRRenderer {
  render(plane: MPRPlane): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  dispose(): void;
}

/** World-space bounds of the volume (from the 8 voxel-cube corners). */
export function volumeWorldBounds(v: VolumeData): { min: Vec3; max: Vec3; center: Vec3 } {
  const M = v.voxelToWorld ?? new Float32Array([v.spacing[0], 0, 0, 0, 0, v.spacing[1], 0, 0, 0, 0, v.spacing[2], 0, 0, 0, 0, 1]);
  const [nx, ny, nz] = v.dims;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const i = c & 1 ? nx - 1 : 0, j = c & 2 ? ny - 1 : 0, k = c & 4 ? nz - 1 : 0;
    const x = M[0] * i + M[4] * j + M[8] * k + M[12];
    const y = M[1] * i + M[5] * j + M[9] * k + M[13];
    const z = M[2] * i + M[6] * j + M[10] * k + M[14];
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
  }
  return { min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

const VERT = `#version 300 es
in vec2 aQuad;
out vec2 vST;
void main(){ vST = aQuad; gl_Position = vec4(aQuad.x * 2.0 - 1.0, 1.0 - aQuad.y * 2.0, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vST;
out vec4 frag;
uniform sampler3D uTex;
uniform mat4 uWorldToVoxel;
uniform vec3 uDims;
uniform vec3 uOrigin;
uniform vec3 uU;
uniform vec3 uV;
uniform float uLo;
uniform float uHi;
uniform int uInvert;
void main(){
  vec3 world = uOrigin + vST.s * uU + vST.t * uV;
  vec3 voxel = (uWorldToVoxel * vec4(world, 1.0)).xyz;
  vec3 tc = (voxel + 0.5) / uDims;
  if(any(lessThan(tc, vec3(0.0))) || any(greaterThan(tc, vec3(1.0)))){ frag = vec4(0.02, 0.03, 0.035, 1.0); return; }
  float s = texture(uTex, tc).r;
  float w = clamp((s - uLo) / max(1e-4, uHi - uLo), 0.0, 1.0);
  if(uInvert == 1) w = 1.0 - w;
  frag = vec4(vec3(w), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('MPR shader compile failed: ' + log); }
  return sh;
}

export function createMPRRenderer(canvas: HTMLCanvasElement, volume: VolumeData): MPRRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) {
    const e: Error & { code?: string } = new Error('이 브라우저는 WebGL2를 지원하지 않아 MPR 리슬라이스를 사용할 수 없습니다');
    e.code = 'DECODE_FAILED';
    throw e;
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'aQuad');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('MPR program link failed: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.STATIC_DRAW); // covers [0,1]^2 with one big tri
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // normalize intensity → R8 3D texture
  const [nx, ny, nz] = volume.dims;
  const norm = new Uint8Array(nx * ny * nz);
  const range = volume.max - volume.min || 1;
  const src = volume.data;
  for (let i = 0; i < norm.length; i++) { let x = (src[i] - volume.min) / range; x = x < 0 ? 0 : x > 1 ? 1 : x; norm[i] = (x * 255) | 0; }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, nx, ny, nz, 0, gl.RED, gl.UNSIGNED_BYTE, norm);

  const w2v = invert(new Float32Array(16), volume.voxelToWorld ?? identity(new Float32Array(16))) ?? identity(new Float32Array(16) as Mat4);

  const U = {
    w2v: gl.getUniformLocation(prog, 'uWorldToVoxel'),
    dims: gl.getUniformLocation(prog, 'uDims'),
    origin: gl.getUniformLocation(prog, 'uOrigin'),
    u: gl.getUniformLocation(prog, 'uU'),
    v: gl.getUniformLocation(prog, 'uV'),
    lo: gl.getUniformLocation(prog, 'uLo'),
    hi: gl.getUniformLocation(prog, 'uHi'),
    invert: gl.getUniformLocation(prog, 'uInvert'),
    tex: gl.getUniformLocation(prog, 'uTex'),
  };
  gl.uniformMatrix4fv(U.w2v, false, w2v);
  gl.uniform3f(U.dims, nx, ny, nz);
  gl.uniform1i(U.tex, 0);

  let vw = 1, vh = 1;
  return {
    render(plane) {
      gl.useProgram(prog);
      gl.uniform3fv(U.origin, plane.origin);
      gl.uniform3fv(U.u, plane.u);
      gl.uniform3fv(U.v, plane.v);
      gl.uniform1f(U.lo, plane.window.lo);
      gl.uniform1f(U.hi, plane.window.hi);
      gl.uniform1i(U.invert, plane.invert ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(cssW, cssH, dpr) {
      vw = Math.max(1, Math.round(cssW * dpr)); vh = Math.max(1, Math.round(cssH * dpr));
      canvas.width = vw; canvas.height = vh; gl.viewport(0, 0, vw, vh);
    },
    dispose() {
      gl.deleteTexture(tex); gl.deleteBuffer(quad); gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
