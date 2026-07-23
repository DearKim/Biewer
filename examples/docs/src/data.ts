import type { BiewerSource } from '@deepnoid/biewer';

// ---- synthetic series (no external data) ----------------------------------
export type StudyKind = 'current' | 'prior';

export interface Series {
  id: string;
  title: string;
  modality: string;
  frames: number;
  hueBase: number;
  study: StudyKind;
  date: string;
  source?: BiewerSource;
  thumb?: string;
}

export const SERIES: Series[] = [
  { id: 's1', title: 'Brain MR — Axial', modality: 'MR · T1', frames: 24, hueBase: 190, study: 'current', date: '2026-07-21' },
  { id: 's2', title: 'Chest CT — Axial', modality: 'CT', frames: 40, hueBase: 30, study: 'current', date: '2026-07-21' },
  { id: 's3', title: 'Cardiac Cine', modality: 'US · cine', frames: 30, hueBase: 320, study: 'current', date: '2026-07-21' },
  { id: 's4', title: 'Abdomen MR', modality: 'MR · T2', frames: 18, hueBase: 100, study: 'current', date: '2026-07-21' },
  { id: 'p1', title: 'Brain MR — Axial', modality: 'MR · T1', frames: 24, hueBase: 205, study: 'prior', date: '2026-01-12' },
  { id: 'p2', title: 'Chest CT — Axial', modality: 'CT', frames: 40, hueBase: 45, study: 'prior', date: '2026-01-12' },
];

export const CURRENT_SERIES = SERIES.filter((s) => s.study === 'current');
export const PRIOR_SERIES = SERIES.filter((s) => s.study === 'prior');

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, s: Series, i: number): void {
  const hue = (s.hueBase + (i / s.frames) * 40) % 360;
  ctx.fillStyle = `hsl(${hue} 42% 10%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(78,197,220,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += Math.max(24, w / 16)) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  ctx.strokeStyle = `hsl(${hue} 80% 62%)`;
  ctx.lineWidth = Math.max(3, w / 90);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * (0.12 + (i / s.frames) * 0.28), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${Math.round(w / 12)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(`${i + 1} / ${s.frames}`, w / 2, h / 2 + w / 36);
  ctx.font = `${Math.round(w / 26)}px system-ui`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(s.modality, w / 2, h - w / 24);
}

async function toBuffer(c: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
  return blob.arrayBuffer();
}

export async function makeThumb(s: Series, size = 240): Promise<void> {
  if (s.thumb) return;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawFrame(c.getContext('2d')!, size, size, s, 0);
  s.thumb = c.toDataURL('image/png');
}

export async function realizeSeries(s: Series, size = 480): Promise<Series> {
  if (s.source) return s;
  const data: ArrayBuffer[] = [];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < s.frames; i++) {
    drawFrame(ctx, size, size, s, i);
    data.push(await toBuffer(c));
    if (i === 0) s.thumb = c.toDataURL('image/png');
  }
  s.source = { kind: 'buffer', data, name: `${s.id}.png` };
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
export type ExampleKind = 'layout' | 'format' | 'output' | 'compare' | 'tool';
export type ExampleTool = 'zoom' | 'pan' | 'window-level' | null;

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
}

export const EXAMPLE_CATEGORIES = ['Layouts', 'Basics', 'Output modes', 'Compare', 'Tools'] as const;

export const EXAMPLES: Example[] = [
  // --- Layout (viewport freedom) — one example driven by the Grid control ---
  { id: 'layout', category: 'Layouts', title: 'Grid layout', desc: 'Arrange viewports in any grid — pick a preset (1×1 … 4×2) from the Grid dropdown, or draw a custom R×C grid with the picker. The plugin never sees a "layout"; you size the CSS grid and it renders one view per cell.', kind: 'layout', rows: 2, cols: 2, custom: true, series: ['s1', 's2', 's3', 's4'] },

  // --- Basics (format) ---
  { id: 'basic-stack', category: 'Basics', title: 'Basic image stack', desc: 'A stack of images (PNG/JPEG/WebP) as scrollable frames.', kind: 'format', rows: 1, cols: 1, series: ['s1'], format: 'png' },
  { id: 'web-images', category: 'Basics', title: 'Web images (PNG/JPG)', desc: 'Ordinary web images via the browser-native decode path.', kind: 'format', rows: 1, cols: 1, series: ['s3'], format: 'jpg' },
  { id: 'nifti', category: 'Basics', title: 'NIfTI volume', desc: 'Scroll a NIfTI volume along the selected axis.', kind: 'format', rows: 1, cols: 1, series: ['s1'], format: 'nii.gz', planned: true },
  { id: 'dicom', category: 'Basics', title: 'DICOM series', desc: 'A DICOM series (multi-frame or per-instance) as one FrameSource.', kind: 'format', rows: 1, cols: 1, series: ['s2'], format: 'dcm', planned: true },
  { id: 'jpeg-ls', category: 'Basics', title: 'JPEG-LS decode', desc: 'JPEG-LS pixels via a WASM codec worker.', kind: 'format', rows: 1, cols: 1, series: ['s2'], format: 'jls', planned: true },
  { id: 'archive', category: 'Basics', title: 'Archive (zip / gz)', desc: 'Unwrap a zip/gz archive and re-detect the inner format.', kind: 'format', rows: 1, cols: 1, series: ['s4'], format: 'zip', planned: true },

  // --- Output modes ---
  { id: 'slice', category: 'Output modes', title: 'Slice scroll', desc: 'Manual frame navigation (wheel / scrollbar / keyboard), rAF-coalesced.', kind: 'output', rows: 1, cols: 1, series: ['s2'], mode: 'slice' },
  { id: 'cine', category: 'Output modes', title: 'Cine (auto play)', desc: 'Auto-advance frames — play / pause / stop and speed.', kind: 'output', rows: 1, cols: 1, series: ['s3'], mode: 'auto' },
  { id: 'video', category: 'Output modes', title: 'Video (mp4)', desc: 'Seek an mp4 by a time step, or play as cine.', kind: 'output', rows: 1, cols: 1, series: ['s3'], mode: 'auto', format: 'mp4', planned: true },
  { id: 'sync-frames', category: 'Output modes', title: 'Frame-synced views', desc: 'One PlaybackController bound to many views keeps frames in sync.', kind: 'output', rows: 1, cols: 2, series: ['s1', 's2'], mode: 'slice' },

  // --- Compare ---
  { id: 'side-by-side', category: 'Compare', title: 'Side-by-side', desc: 'Two series next to each other.', kind: 'compare', rows: 1, cols: 2, series: ['s1', 's2'] },
  { id: 'follow-up', category: 'Compare', title: 'Follow-up (current vs prior)', desc: 'Current vs a prior study of the same body part; frames stay in sync.', kind: 'compare', rows: 1, cols: 2, series: ['s1', 'p1'] },
  { id: 'drag-place', category: 'Compare', title: 'Drag series to a viewport', desc: 'Drag any series from the right rail onto a specific cell.', kind: 'compare', rows: 2, cols: 2, series: ['s1', null, null, null] },
  { id: 'duplicate', category: 'Compare', title: 'Same series, many views', desc: 'Place one series in several cells (e.g. one zoomed, one W/L).', kind: 'compare', rows: 1, cols: 2, series: ['s1', 's1'] },

  // --- Tools ---
  { id: 'zoom-pan', category: 'Tools', title: 'Zoom & pan', desc: 'Drag to zoom/pan. Headless — the host renders the toolbar.', kind: 'tool', rows: 1, cols: 1, series: ['s1'], tool: 'zoom' },
  { id: 'window-level', category: 'Tools', title: 'Window / Level', desc: 'Drag to adjust window center/width on gray sources.', kind: 'tool', rows: 1, cols: 1, series: ['s2'], tool: 'window-level' },
  { id: 'shared-tools', category: 'Tools', title: 'Shared tools (scope: all)', desc: 'One ToolController broadcasts a single action to every bound view.', kind: 'tool', rows: 2, cols: 2, series: ['s1', 's2', 's3', 's4'], tool: 'zoom' },
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
