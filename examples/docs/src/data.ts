import type { BiewerSource } from '@deepnoid/biewer';

// ---- real, fetchable sample datasets (all CORS-enabled) --------------------
// NIfTI  : NiiVue demo images (github.io, CORS *)
// DICOM  : pydicom / pydicom-data test files (raw.githubusercontent, CORS *)
// mp4    : MDN CC0 sample video (CORS *)
// images : same-origin public assets served by this docs site
export type StudyKind = 'current' | 'prior';
export type FmtLabel = 'NIfTI' | 'DICOM' | 'MP4' | 'PNG' | 'ZIP';

const NIIVUE = 'https://niivue.github.io/niivue-demo-images';
const PYDICOM = 'https://raw.githubusercontent.com/pydicom/pydicom/main/src/pydicom/data/test_files';
const PYDATA = 'https://raw.githubusercontent.com/pydicom/pydicom-data/master/data_store/data';
// Real endoscopic-surgery cine (from the OHIF clinical sample), re-encoded to a
// small same-origin webm so the video example loads instantly.
const MED_VIDEO = '/samples/endo-cine.webm';
// PNG image stack — real brain MR axial slices (rendered from the MNI152 volume),
// so the image-decode path shows medical content, not logos.
const IMG_STACK = Array.from({ length: 12 }, (_, i) => `/samples/img${i + 1}.png`);

export interface Series {
  id: string;
  title: string;
  modality: string;
  fmt: FmtLabel;
  hueBase: number;            // thumbnail tint (placeholder fallback)
  study: StudyKind;
  date: string;
  rail: boolean;              // shown in the right "series" rail
  source: BiewerSource;       // real, fetchable
  thumbUrl?: string;          // pre-generated real first-frame thumbnail
  thumb?: string;             // resolved thumbnail (data URL or thumbUrl)
}

const thumb = (id: string) => `/samples/thumb-${id}.png`;

// Diverse medical rail: MR / CT / ultrasound / X-ray / endoscopy, across
// NIfTI / DICOM / video / PNG / ZIP / JPEG-LS. Real thumbnails are pre-generated.
export const SERIES: Series[] = [
  // --- current study (rail) ---
  { id: 's1', title: 'Brain MR (MNI152)', modality: 'MR · NIfTI', fmt: 'NIfTI', hueBase: 190, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('s1'), source: { kind: 'url', url: `${NIIVUE}/mni152.nii.gz` } },
  { id: 'ct1', title: 'Abdomen CT', modality: 'CT · NIfTI', fmt: 'NIfTI', hueBase: 40, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('ct1'), source: { kind: 'url', url: `${NIIVUE}/CT_Abdo.nii.gz` } },
  { id: 's2', title: 'MR — multiframe', modality: 'MR · DICOM', fmt: 'DICOM', hueBase: 30, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('s2'), source: { kind: 'url', url: `${PYDATA}/emri_small.dcm` } },
  { id: 'us1', title: 'Ultrasound', modality: 'US · DICOM', fmt: 'DICOM', hueBase: 280, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('us1'), source: { kind: 'url', url: `${PYDATA}/US1_UNCR.dcm` } },
  { id: 's3', title: 'Endoscopy cine', modality: 'Video · webm', fmt: 'MP4', hueBase: 320, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('s3'), source: { kind: 'url', url: MED_VIDEO } },
  { id: 'img', title: 'Brain MR — PNG slices', modality: 'MR · PNG', fmt: 'PNG', hueBase: 200, study: 'current', date: '2026-07-21', rail: true, thumbUrl: thumb('img'), source: { kind: 'url', url: IMG_STACK } },
  // --- prior study (rail, follow-up) ---
  { id: 'p1', title: 'Brain MR (T1)', modality: 'MR · NIfTI', fmt: 'NIfTI', hueBase: 205, study: 'prior', date: '2026-01-12', rail: true, thumbUrl: thumb('p1'), source: { kind: 'url', url: `${NIIVUE}/chris_t1.nii.gz` } },
  { id: 'p2', title: 'Head CT', modality: 'CT · DICOM', fmt: 'DICOM', hueBase: 45, study: 'prior', date: '2026-01-12', rail: true, thumbUrl: thumb('p2'), source: { kind: 'url', url: `${PYDICOM}/CT_small.dcm` } },
  { id: 'xr1', title: 'X-ray', modality: 'XR · DICOM', fmt: 'DICOM', hueBase: 210, study: 'prior', date: '2026-01-12', rail: true, thumbUrl: thumb('xr1'), source: { kind: 'url', url: `${PYDATA}/RG1_UNCR.dcm` } },
  // --- format-demo sources (not in the rail; referenced by Basics examples) ---
  { id: 's4', title: 'Perfusion (pCASL)', modality: 'MR · NIfTI', fmt: 'NIfTI', hueBase: 100, study: 'current', date: '2026-07-21', rail: false, source: { kind: 'url', url: `${NIIVUE}/pcasl.nii.gz` } },
  { id: 'zip', title: 'Brain MR — PNG archive', modality: 'MR · ZIP', fmt: 'ZIP', hueBase: 210, study: 'current', date: '2026-07-21', rail: false, source: { kind: 'url', url: '/samples/stack.zip' } },
  { id: 'jls', title: 'MR — JPEG-LS', modality: 'MR · DICOM/JPEG-LS', fmt: 'DICOM', hueBase: 15, study: 'current', date: '2026-07-21', rail: false, source: { kind: 'url', url: `${PYDATA}/emri_small_jpeg_ls_lossless.dcm` } },
];

export const CURRENT_SERIES = SERIES.filter((s) => s.study === 'current' && s.rail);
export const PRIOR_SERIES = SERIES.filter((s) => s.study === 'prior' && s.rail);

/** Resolve a rail thumbnail: use the pre-generated real first-frame PNG if we
 *  have one, otherwise draw a cheap tinted placeholder (no network/decoding). */
export async function makeThumb(s: Series, size = 200): Promise<void> {
  if (s.thumb) return;
  if (s.thumbUrl) { s.thumb = s.thumbUrl; return; }
  if (typeof document === 'undefined') return;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `hsl(${s.hueBase} 45% 16%)`);
  g.addColorStop(1, `hsl(${s.hueBase} 40% 8%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `hsl(${s.hueBase} 80% 62%)`;
  ctx.lineWidth = size / 40;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${Math.round(size / 8)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s.fmt, size / 2, size / 2);
  s.thumb = c.toDataURL('image/png');
}

/** Sources are already real URLs — nothing to build, just hand them back. */
export async function realizeSeries(s: Series): Promise<Series> {
  return s;
}

// ---- grid: host-owned layout (NOT a plugin tool) --------------------------
// Layout is the HOST's CSS grid. These presets/custom just show how freely a
// host can arrange the single <BiewerView> — the plugin renders one view per cell.
export interface GridPreset { id: string; label: string; rows: number; cols: number; }
// preset dropdown (default set); the popover picker below is unbounded.
export const GRID_PRESETS: GridPreset[] = [
  { id: '1x1', label: '1×1', rows: 1, cols: 1 },
  { id: '1x2', label: '1×2', rows: 1, cols: 2 },
  { id: '2x1', label: '2×1', rows: 2, cols: 1 },
  { id: '2x2', label: '2×2', rows: 2, cols: 2 },
  { id: '3x2', label: '3×2', rows: 3, cols: 2 },
  { id: '4x2', label: '4×2', rows: 4, cols: 2 },
];
// hard ceiling for the popover picker (kept generous; grid grows as you reach the edge).
export const GRID_MAX = { rows: 12, cols: 12 };

// ---- examples --------------------------------------------------------------
export type ExampleKind = 'layout' | 'format' | 'output' | 'compare' | 'tool' | '3d';
export type ExampleTool = 'zoom' | 'pan' | 'window-level' | null;

/** Per-viewport config, so ONE example can mix planes (different axes) + a 3D
 *  cell — e.g. an MPR + 3D multi-angle layout. The host owns this composition;
 *  the plugin just renders whatever each viewport is told to be. */
export interface CellView {
  kind: '2d' | '3d';
  axis?: 'native' | 'axial' | 'coronal' | 'sagittal';
  volMode?: 'dvr' | 'mip';
  label?: string;
}

export interface Example {
  id: string;
  category: string;
  title: string;
  desc: string;
  kind: ExampleKind;
  rows: number;
  cols: number;
  custom?: boolean;            // spreadsheet-style R×C stepper
  series: (string | null)[];
  tool?: ExampleTool;
  mode?: 'slice' | 'auto';
  planned?: boolean;
  format?: string;             // format-kind examples
  volMode?: 'dvr' | 'mip';     // 3d-kind examples
  views?: CellView[];          // per-viewport config (MPR + 3D multi-angle)
}

export const EXAMPLE_CATEGORIES = ['Layouts', 'Basics', '3D', 'Output modes', 'Compare', 'Tools'] as const;

export const EXAMPLES: Example[] = [
  // --- Layout (viewport freedom) — one example driven by the Grid control ---
  { id: 'layout', category: 'Layouts', title: 'Grid layout', desc: 'Arrange viewports in any grid — pick a preset (1×1 … 4×2) from the Grid dropdown, or draw a custom R×C grid with the picker. The plugin never sees a "layout"; you size the CSS grid and it renders one view per cell.', kind: 'layout', rows: 2, cols: 2, custom: true, series: ['s1', 's2', 's3', 's4'] },

  // --- Basics (format) — real fetchable data ---
  { id: 'basic-stack', category: 'Basics', title: 'Basic image stack', desc: 'A stack of brain-MR PNG slices decoded to scrollable frames (browser-native).', kind: 'format', rows: 1, cols: 1, series: ['img'], format: 'png' },
  { id: 'web-images', category: 'Basics', title: 'Web images (PNG/JPG)', desc: 'Web images (brain-MR PNGs) via the browser-native decode path.', kind: 'format', rows: 1, cols: 1, series: ['img'], format: 'png' },
  { id: 'nifti', category: 'Basics', title: 'NIfTI volume', desc: 'A real .nii.gz volume (NiiVue MNI152) — gunzipped and sliced along the chosen axis.', kind: 'format', rows: 1, cols: 1, series: ['s1'], format: 'nii.gz' },
  { id: 'dicom', category: 'Basics', title: 'DICOM series', desc: 'A real uncompressed multiframe DICOM (pydicom emri_small) as one FrameSource.', kind: 'format', rows: 1, cols: 1, series: ['s2'], format: 'dcm' },
  { id: 'archive', category: 'Basics', title: 'Archive (zip / gz)', desc: 'Unwrap a .zip of brain-MR PNG slices (or .gz, as used by .nii.gz) and re-detect the inner format.', kind: 'format', rows: 1, cols: 1, series: ['zip'], format: 'zip' },
  { id: 'jpeg-ls', category: 'Basics', title: 'JPEG-LS (compressed DICOM)', desc: 'A real JPEG-LS lossless DICOM (pydicom emri), decoded from scratch (LOCO-I) — byte-identical to its uncompressed twin.', kind: 'format', rows: 1, cols: 1, series: ['jls'], format: 'jls' },

  // --- 3D (WebGL volume rendering) — the whole decoded volume, no VTK.js ---
  { id: 'mpr-3d', category: '3D', title: 'MPR + 3D (multi-angle)', desc: 'One volume from every angle at once: axial / coronal / sagittal planes (each scrolls independently — wheel) plus an interactive 3D volume render (drag = orbit, wheel = zoom). The host owns the 2×2 grid and tells each viewport its axis or 3D mode; the plugin just renders. (Linked crosshair is a follow-up.)', kind: '3d', rows: 2, cols: 2, series: ['s1', 's1', 's1', 's1'], views: [
    { kind: '2d', axis: 'axial', label: 'Axial' },
    { kind: '2d', axis: 'coronal', label: 'Coronal' },
    { kind: '2d', axis: 'sagittal', label: 'Sagittal' },
    { kind: '3d', volMode: 'dvr', label: '3D' },
  ] },
  { id: 'volume-dvr', category: '3D', title: 'Volume rendering (DVR)', desc: 'A real CT volume ray-cast in 3D — drag to orbit, wheel to zoom. The plugin decodes the whole volume once (createVolume) and renders it with a WebGL2 raycaster (front-to-back compositing). No VTK.js, no framework.', kind: '3d', rows: 1, cols: 1, series: ['ct1'], volMode: 'dvr' },
  { id: 'volume-mip', category: '3D', title: 'Maximum intensity projection', desc: 'The same 3D raycaster in MIP mode — projects the brightest voxel along each ray (angio / bone look). Drag to orbit, wheel to zoom. Toggle DVR ⇄ MIP from the toolbar.', kind: '3d', rows: 1, cols: 1, series: ['s1'], volMode: 'mip' },

  // --- Output modes ---
  { id: 'slice', category: 'Output modes', title: 'Slice scroll', desc: 'Manual frame navigation (wheel / scrollbar / keyboard), rAF-coalesced.', kind: 'output', rows: 1, cols: 1, series: ['s1'], mode: 'slice' },
  { id: 'cine', category: 'Output modes', title: 'Cine (auto play)', desc: 'Auto-advance frames — play / pause / stop and speed. Works on volumes and video.', kind: 'output', rows: 1, cols: 1, series: ['s2'], mode: 'auto' },
  { id: 'video', category: 'Output modes', title: 'Video (mp4 / webm)', desc: 'A real endoscopic-surgery cine sampled to frames; scroll to seek or play as cine. (mp4 and webm share the seek-based decode path.)', kind: 'output', rows: 1, cols: 1, series: ['s3'], mode: 'auto', format: 'mp4' },
  { id: 'sync-frames', category: 'Output modes', title: 'Frame-synced views', desc: 'One PlaybackController bound to many views keeps frames in sync.', kind: 'output', rows: 1, cols: 2, series: ['s1', 'p1'], mode: 'slice' },

  // --- Compare ---
  { id: 'side-by-side', category: 'Compare', title: 'Side-by-side', desc: 'Two series next to each other.', kind: 'compare', rows: 1, cols: 2, series: ['s1', 's2'] },
  { id: 'follow-up', category: 'Compare', title: 'Follow-up (current vs prior)', desc: 'Current vs a prior study of the same body part; frames stay in sync.', kind: 'compare', rows: 1, cols: 2, series: ['s1', 'p1'] },
  { id: 'drag-place', category: 'Compare', title: 'Drag series to a viewport', desc: 'Drag any series from the right rail onto a specific cell.', kind: 'compare', rows: 2, cols: 2, series: ['s1', null, null, null] },
  { id: 'duplicate', category: 'Compare', title: 'Same series, many views', desc: 'Place one series in several cells (e.g. one zoomed, one W/L).', kind: 'compare', rows: 1, cols: 2, series: ['s1', 's1'] },

  // --- Tools ---
  { id: 'zoom-pan', category: 'Tools', title: 'Zoom & pan', desc: 'Drag to zoom/pan. Headless — the host renders the toolbar.', kind: 'tool', rows: 1, cols: 1, series: ['s1'], tool: 'zoom' },
  { id: 'window-level', category: 'Tools', title: 'Window / Level', desc: 'Drag to adjust window center/width on gray sources.', kind: 'tool', rows: 1, cols: 1, series: ['s2'], tool: 'window-level' },
  { id: 'shared-tools', category: 'Tools', title: 'Shared tools (scope: all)', desc: 'One ToolController broadcasts a single action to every bound view.', kind: 'tool', rows: 2, cols: 2, series: ['s1', 's2', 's4', 'p1'], tool: 'zoom' },
  { id: 'measurement', category: 'Tools', title: 'Measurement (ruler/circle/polygon)', desc: 'Draw measurements with undo/redo; host owns save/load.', kind: 'tool', rows: 1, cols: 1, series: ['s1'], tool: null, planned: true },
];

// ---- per-example docs: props / code / AI ask -------------------------------
export const PROP_INFO: Record<string, [string, string]> = {
  source: ['BiewerSource', 'url / file / buffer. An array = image stack / series.'],
  tools: ['ToolController', 'Headless tool controller; bind one to many views.'],
  playback: ['PlaybackController', 'slice/auto output-mode controller.'],
  frame: ['number', 'controlled frame index (with onFrameChange).'],
  onFrameChange: ['(i:number)=>void', 'frame change notification.'],
  videoStep: ['number', 'video slice step in seconds (0.1~N).'],
  axis: ["'native'|'axial'|'coronal'|'sagittal'", 'volume slice axis.'],
  scrollbar: ['boolean', 'built-in slice scrollbar (opt-in).'],
  onSourceReady: ['(info)=>void', 'frameCount / size / meta once normalized.'],
  onProgress: ['(p)=>void', 'fetch / decode progress (host renders the UI).'],
  onError: ['(e)=>void', 'unsupported / decode / fetch errors.'],
  onActivate: ['()=>void', 'this viewport became the active one.'],
  mode: ["'dvr'|'mip'", '3D raycast mode: DVR compositing or max-intensity.'],
  window: ['{lo,hi}', '3D transfer window over normalized [0,1] intensity.'],
  opacity: ['number', 'DVR density gain (higher = more opaque).'],
  invert: ['boolean', 'invert the 3D intensity mapping.'],
  onReady: ['(v:VolumeData)=>void', 'decoded volume dims/spacing once loaded.'],
};

const EXT: Record<string, string> = { png: 'png', jpg: 'jpg', 'nii.gz': 'nii.gz', dcm: 'dcm', jls: 'jls', zip: 'zip', mp4: 'mp4' };

export function propsFor(ex: Example): string[] {
  switch (ex.kind) {
    case 'layout':
    case 'compare': return ['source', 'tools', 'playback', 'onActivate'];
    case 'format': return ['source', 'axis', 'onSourceReady', 'onProgress', 'onError'];
    case 'output': return ex.format === 'mp4'
      ? ['source', 'playback', 'videoStep', 'frame', 'onFrameChange']
      : ['source', 'playback', 'frame', 'onFrameChange', 'scrollbar'];
    case 'tool': return ['source', 'tools'];
    case '3d': return ex.views ? ['source', 'axis', 'mode', 'onReady', 'onError'] : ['source', 'mode', 'window', 'opacity', 'invert', 'onReady'];
    default: return ['source'];
  }
}

export function askFor(ex: Example): string {
  switch (ex.kind) {
    case 'layout':
      return ex.custom
        ? `Using @deepnoid/biewer, build a viewer where the user grows a grid of viewports like a spreadsheet (add rows/columns). The layout is my own CSS grid; render one <BiewerView> per cell and share one ToolController(scope:'all') and one PlaybackController across all cells.`
        : `Using @deepnoid/biewer, arrange ${ex.rows * ex.cols} viewports in a ${ex.rows}×${ex.cols} CSS grid. I own the layout; the plugin renders one view per cell. Share one ToolController(scope:'all') and one PlaybackController.`;
    case 'format':
      return `Using @deepnoid/biewer, load a ${ex.format} source into a single <BiewerView> (source = { kind:'url', url }). Report frameCount via onSourceReady and show a loading state from onProgress. Auth/endpoints are mine via setHttpClient().`;
    case 'output':
      return ex.mode === 'auto'
        ? `Using @deepnoid/biewer, add cine playback (play/pause/stop + speed) to a viewer via a PlaybackController in 'auto' mode.`
        : `Using @deepnoid/biewer, wire slice scrolling (wheel/scrollbar) and keep several views frame-synced by binding one PlaybackController to all of them.`;
    case 'compare':
      return `Using @deepnoid/biewer, build a compare grid (${ex.rows}×${ex.cols}). Let the user drag a series onto any cell. Share one PlaybackController so frames stay in sync and one ToolController(scope:'all') for lockstep tools.`;
    case 'tool':
      return `Using @deepnoid/biewer, expose ${ex.tool ?? 'measurement'} through a headless ToolController and my own toolbar buttons (tools.setActiveTool / tools.apply). scope:'all' applies to every view.`;
    case '3d':
      return ex.views
        ? `Using @deepnoid/biewer, build a 2×2 MPR + 3D layout of ONE volume: three <BiewerView> planes with axis 'axial' / 'coronal' / 'sagittal' (each scrolls independently — bind NO shared PlaybackController so wheel steps that plane only), plus one <BiewerVolume> (createBiewerVolumeView) for interactive 3D. Let me upload my own data — a single file, a .zip, or a DICOM folder — via { kind: 'file', file: File | File[] } (a File[] of single-frame slices is stacked into one ordered volume) and show it in all four viewports. I own the CSS grid; the plugin renders each viewport. Framework-agnostic, no VTK.js.`
        : `Using @deepnoid/biewer, render a medical volume (.nii.gz / DICOM) in 3D with createBiewerVolumeView(el, { source, mode: '${ex.volMode ?? 'dvr'}' }). Drag orbits, wheel zooms. Give me toolbar buttons to toggle DVR ⇄ MIP (setMode), invert (setInvert), and reset the camera (setCamera). It must be framework-agnostic (no VTK.js) and run on WebGL2.`;
    default: return '';
  }
}

export function codeFor(ex: Example, lang: 'core' | 'react' | 'wc'): string {
  const R = ex.rows, C = ex.cols;
  const ext = ex.format ? EXT[ex.format] ?? ex.format : 'png';

  if (ex.kind === 'layout' || ex.kind === 'compare') {
    if (lang === 'react') {
      if (ex.custom) {
        return [
          "const [g, setG] = useState({ rows: 2, cols: 2 });   // spreadsheet-style",
          "const tools = useBiewerTools({ scope: 'all' });",
          "const playback = useBiewerPlayback({ mode: 'slice' });",
          "// +/- steppers call setG to grow/shrink — the plugin never sees a 'layout'.",
          "",
          "<div style={{ display: 'grid', gap: 2, height: '100%',",
          "  gridTemplateColumns: `repeat(${g.cols}, 1fr)`,",
          "  gridTemplateRows: `repeat(${g.rows}, 1fr)` }}>",
          "  {Array.from({ length: g.rows * g.cols }, (_, i) => (",
          "    <BiewerView key={i} source={sources[i]} tools={tools} playback={playback} />",
          "  ))}",
          "</div>",
        ].join('\n');
      }
      return [
        "const tools = useBiewerTools({ scope: 'all' });",
        "const playback = useBiewerPlayback({ mode: 'slice' });",
        "",
        "// Layout is YOUR CSS grid — Biewer renders one view per cell.",
        `<div style={{ display: 'grid', gap: 2, height: '100%',`,
        `  gridTemplateColumns: 'repeat(${C}, 1fr)',`,
        `  gridTemplateRows: 'repeat(${R}, 1fr)' }}>`,
        "  {sources.map((s, i) => (",
        "    <BiewerView key={i} source={s} tools={tools} playback={playback} />",
        "  ))}",
        "</div>",
      ].join('\n');
    }
    if (lang === 'wc') {
      return [
        "import '@deepnoid/biewer/wc';",
        "const tools = createToolController({ scope: 'all' });",
        "const playback = createPlaybackController();",
        "",
        `container.style.display = 'grid';`,
        `container.style.gridTemplateColumns = 'repeat(${C}, 1fr)';`,
        `container.style.gridTemplateRows = 'repeat(${R}, 1fr)';`,
        "for (const src of sources) {",
        "  const el = document.createElement('biewer-view');",
        "  el.tools = tools; el.playback = playback; el.source = src;",
        "  container.appendChild(el);",
        "}",
      ].join('\n');
    }
    return [
      "const tools = createToolController({ scope: 'all' });",
      "const playback = createPlaybackController();",
      `container.style.display = 'grid';`,
      `container.style.gridTemplateColumns = 'repeat(${C}, 1fr)';`,
      `container.style.gridTemplateRows = 'repeat(${R}, 1fr)';`,
      "for (const src of sources) {",
      "  const cell = document.createElement('div');",
      "  container.appendChild(cell);",
      "  createBiewerView(cell, { source: src, tools, playback });",
      "}",
    ].join('\n');
  }

  if (ex.kind === '3d' && ex.views) {
    const vurl = '/studies/case.nii.gz';
    if (lang === 'react') {
      return [
        "import { BiewerView, BiewerVolume } from '@deepnoid/biewer/react';",
        "const src = { kind: 'url', url: '" + vurl + "' };",
        "",
        "// YOUR 2×2 grid — 3 MPR planes + 1 3D. No shared playback → planes",
        "// scroll independently; each <BiewerView> steps its own axis on wheel.",
        "<div style={{ display: 'grid', gap: 2, height: '100%',",
        "  gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>",
        "  <BiewerView source={src} axis=\"axial\" />",
        "  <BiewerView source={src} axis=\"coronal\" />",
        "  <BiewerView source={src} axis=\"sagittal\" />",
        "  <BiewerVolume source={src} mode=\"dvr\" />",
        "</div>",
      ].join('\n');
    }
    if (lang === 'wc') {
      return [
        "import '@deepnoid/biewer/wc';   // <biewer-view> + <biewer-volume>",
        "const src = { kind: 'url', url: '" + vurl + "' };",
        "const mk = (tag, set) => { const e = document.createElement(tag); set(e); grid.appendChild(e); };",
        "",
        "mk('biewer-view',   (e) => { e.setAttribute('axis','axial');    e.source = src; });",
        "mk('biewer-view',   (e) => { e.setAttribute('axis','coronal');  e.source = src; });",
        "mk('biewer-view',   (e) => { e.setAttribute('axis','sagittal'); e.source = src; });",
        "mk('biewer-volume', (e) => { e.setAttribute('mode','dvr');      e.source = src; });",
      ].join('\n');
    }
    return [
      "import { createBiewerView, createBiewerVolumeView } from '@deepnoid/biewer';",
      "const src = { kind: 'url', url: '" + vurl + "' };",
      "",
      "// 3 MPR planes — no shared PlaybackController → independent wheel scroll",
      "createBiewerView(cellA, { source: src, axis: 'axial' });",
      "createBiewerView(cellB, { source: src, axis: 'coronal' });",
      "createBiewerView(cellC, { source: src, axis: 'sagittal' });",
      "// + interactive 3D volume render in the 4th cell",
      "createBiewerVolumeView(cellD, { source: src, mode: 'dvr' });",
    ].join('\n');
  }

  if (ex.kind === '3d') {
    const vurl = '/studies/case.nii.gz';
    const m = ex.volMode ?? 'dvr';
    if (lang === 'react') {
      return [
        "import { BiewerVolume } from '@deepnoid/biewer/react';",
        "",
        "const [mode, setMode] = useState<'dvr' | 'mip'>('" + m + "');",
        "",
        "<BiewerVolume",
        `  source={{ kind: 'url', url: '${vurl}' }}`,
        "  mode={mode}",
        "  onReady={(v) => console.log(v.dims, v.spacing)}",
        "/>",
        "<button onClick={() => setMode(mode === 'dvr' ? 'mip' : 'dvr')}>DVR ⇄ MIP</button>",
      ].join('\n');
    }
    if (lang === 'wc') {
      return [
        "import '@deepnoid/biewer/wc';",
        "const el = document.createElement('biewer-volume');",
        `el.source = { kind: 'url', url: '${vurl}' };`,
        `el.setAttribute('mode', '${m}');            // 'dvr' | 'mip'`,
        "el.addEventListener('bw-ready', (e) => console.log(e.detail.dims));",
        "container.appendChild(el);",
        "// drag orbits, wheel zooms; toggle mode via the attribute/property",
      ].join('\n');
    }
    return [
      "import { createBiewerVolumeView } from '@deepnoid/biewer';",
      "",
      "const view = createBiewerVolumeView(el, {",
      `  source: { kind: 'url', url: '${vurl}' },`,
      `  mode: '${m}',              // 'dvr' | 'mip'`,
      "  onReady: (v) => console.log(v.dims, v.spacing),",
      "});",
      "// drag = orbit, wheel = zoom. Wire your own toolbar buttons:",
      "modeBtn.onclick  = () => view.setMode('mip');",
      "invertBtn.onclick = () => view.setInvert(true);",
      "resetBtn.onclick = () => view.setCamera({ azimuth: 0.6, elevation: 0.35, distance: 2.4 });",
    ].join('\n');
  }

  if (ex.kind === 'format') {
    const url = `/studies/case.${ext}`;
    if (lang === 'react') {
      return [
        "<BiewerView",
        `  source={{ kind: 'url', url: '${url}' }}${ex.format === 'nii.gz' || ex.format === 'dcm' ? "\n  axis=\"axial\"" : ''}`,
        "  onSourceReady={(info) => console.log(info.frameCount, info.meta)}",
        "  onProgress={(p) => setLoading(p.ratio)}",
        "  onError={(e) => console.error(e.code, e.message)}",
        "/>",
      ].join('\n');
    }
    if (lang === 'wc') {
      return [
        "import '@deepnoid/biewer/wc';",
        "const el = document.createElement('biewer-view');",
        `el.source = { kind: 'url', url: '${url}' };`,
        "el.addEventListener('bw-source-ready', (e) => console.log(e.detail.frameCount));",
        "el.addEventListener('bw-error', (e) => console.error(e.detail));",
        "container.appendChild(el);",
      ].join('\n');
    }
    return [
      "import { createBiewerView, setHttpClient, createDefaultHttpClient } from '@deepnoid/biewer';",
      "setHttpClient(createDefaultHttpClient({ baseURL: '/api', getToken }));",
      "",
      "const view = createBiewerView(el, {",
      `  source: { kind: 'url', url: '${url}' },`,
      "  onSourceReady: (info) => console.log(info.frameCount),",
      "  onProgress: (p) => console.log(p.ratio),",
      "});",
    ].join('\n');
  }

  if (ex.kind === 'output') {
    if (lang === 'react') {
      if (ex.mode === 'auto') {
        return [
          "const playback = useBiewerPlayback({ mode: 'auto', speed: 12 });",
          "",
          "<BiewerView source={s} playback={playback}" + (ex.format === 'mp4' ? " videoStep={0.5}" : '') + " />",
          "<button onClick={() => playback.play()}>Play</button>",
          "<button onClick={() => playback.pause()}>Pause</button>",
          "<button onClick={() => playback.stop()}>Stop</button>",
          "<input type=\"range\" onChange={(e) => playback.setSpeed(+e.target.value)} />",
        ].join('\n');
      }
      return [
        "const playback = useBiewerPlayback({ mode: 'slice' });",
        "",
        "// bind the SAME controller to every view → frames stay in sync",
        "{sources.map((s, i) => (",
        "  <BiewerView key={i} source={s} playback={playback} scrollbar />",
        "))}",
        "<input type=\"range\" min={0} max={frameCount - 1}",
        "  onChange={(e) => playback.setFrame(+e.target.value)} />",
      ].join('\n');
    }
    if (lang === 'wc') {
      return [
        "const playback = createPlaybackController({ mode: '" + (ex.mode ?? 'slice') + "' });",
        "el.playback = playback;",
        "el.source = s;",
        ex.mode === 'auto' ? "playback.play();   // cine" : "el.setAttribute('scrollbar', '');",
      ].join('\n');
    }
    return [
      "const playback = createPlaybackController({ mode: '" + (ex.mode ?? 'slice') + "' });",
      "createBiewerView(el, { source: s, playback });",
      ex.mode === 'auto' ? "playback.play();" : "playback.setFrame(10);",
    ].join('\n');
  }

  // tool
  if (lang === 'react') {
    return [
      "const tools = useBiewerTools({ scope: 'all' });",
      "",
      "<BiewerView source={s} tools={tools} />",
      `<button onClick={() => tools.setActiveTool('${ex.tool ?? 'zoom'}')}>${ex.tool ?? 'tool'}</button>`,
      "<button onClick={() => tools.apply({ op: 'reset' })}>Reset</button>",
    ].join('\n');
  }
  if (lang === 'wc') {
    return [
      "const tools = createToolController({ scope: 'all' });",
      "el.tools = tools; el.source = s;",
      `tools.setActiveTool('${ex.tool ?? 'zoom'}');`,
    ].join('\n');
  }
  return [
    "const tools = createToolController({ scope: 'all' });",
    "createBiewerView(el, { source: s, tools });",
    `tools.setActiveTool('${ex.tool ?? 'zoom'}');`,
  ].join('\n');
}

// ---- HOW TO USE: real package setup ---------------------------------------
export interface HowTo { id: string; label: string; ico: string; md: string; }
export const HOW_TO: HowTo[] = [
  {
    id: 'install', label: 'Install & entry points', ico: '⤓',
    md: `# Install
    npm i @deepnoid/biewer
    # React is an optional peer:  npm i react react-dom   (^18 || ^19)

## Entry points
- @deepnoid/biewer        core (vanilla TS): createBiewerView(el, options), createToolController(), createPlaybackController()
- @deepnoid/biewer/react  <BiewerView>, useBiewerTools(), useBiewerPlayback()
- @deepnoid/biewer/wc     <biewer-view> custom element (Vue / Angular / Svelte / plain HTML)
- @deepnoid/biewer/style.css   optional (styles are auto-injected unless injectStyles:false)`,
  },
  {
    id: 'http', label: 'HTTP client (auth)', ico: '⚿',
    md: `# Data comes from YOUR backend
Biewer never defines endpoints. Inject a fetch policy once:

    import { setHttpClient, createDefaultHttpClient } from '@deepnoid/biewer';

    setHttpClient(createDefaultHttpClient({
      baseURL: 'https://api.example.com',
      getToken: () => localStorage.getItem('token') ?? '',
    }));

Then a URL source just works:  source = { kind: 'url', url: '/studies/a.nii.gz' }`,
  },
  {
    id: 'worker', label: 'Worker factory (bundlers)', ico: '⚙',
    md: `# Web Worker URLs
Heavy decoding runs in workers. When your bundler pre-bundles the plugin, hand it the worker URLs:

    import { setWorkerFactory } from '@deepnoid/biewer';
    import decodeWorkerUrl from '@deepnoid/biewer/workers/decodeWorker.js?url';

    setWorkerFactory({ decode: () => new Worker(decodeWorkerUrl, { type: 'module' }) });`,
  },
  {
    id: 'decoder', label: 'Custom decoder', ico: '◈',
    md: `# Add a format the core doesn't ship
    import { registerDecoder } from '@deepnoid/biewer';

    registerDecoder({
      name: 'tiff',
      sniff: (bytes) => bytes[0] === 0x49 && bytes[1] === 0x49,   // 'II' little-endian TIFF
      decode: async (bytes, ctx) => myTiffToFrameSource(bytes, ctx),
    });
Later-registered decoders win, so hosts can override built-ins.`,
  },
  {
    id: 'react', label: 'React adapter', ico: '⚛',
    md: `# React
    import { BiewerView, useBiewerTools, useBiewerPlayback } from '@deepnoid/biewer/react';

    const tools = useBiewerTools({ scope: 'all' });
    const playback = useBiewerPlayback({ mode: 'slice' });

    <BiewerView source={src} tools={tools} playback={playback} onFrameChange={setFrame} />

Controllers are stable for the component's lifetime; bind the same instance to many <BiewerView>.`,
  },
  {
    id: 'wc', label: 'Web Component', ico: '⬢',
    md: `# Web Component (Vue / Angular / Svelte / HTML)
    import '@deepnoid/biewer/wc';           // registers <biewer-view>

    <biewer-view id="v"></biewer-view>

    const el = document.getElementById('v');
    el.tools = sharedToolController;         // object props via JS
    el.playback = sharedPlaybackController;
    el.source = { kind: 'url', url: '/clip.mp4' };
    el.addEventListener('bw-frame-change', (e) => console.log(e.detail));`,
  },
];
