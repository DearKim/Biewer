import './styles.css';
import '@deepnoid/biewer/wc';
import { createToolController, createPlaybackController } from '@deepnoid/biewer';
import type { ToolController, PlaybackController, BiewerTool } from '@deepnoid/biewer';
import type { BiewerViewElement } from '@deepnoid/biewer/wc';
import {
  SERIES, CURRENT_SERIES, PRIOR_SERIES, EXAMPLES, EXAMPLE_CATEGORIES, HOW_TO, PROP_INFO, GRID_MAX, GRID_PRESETS,
  codeFor, propsFor, askFor, realizeSeries, makeThumb, type Series, type Example,
} from './data';

// ---------------------------------------------------------------------------
const tools: ToolController = createToolController({ scope: 'all' });
const playback: PlaybackController = createPlaybackController({ mode: 'slice', speed: 12 });

const state = {
  grid: { rows: 1, cols: 2 },
  selected: ['s1', 'p1'] as (string | null)[],
  activeExample: 'follow-up',
  commentsMode: 'example' as 'example' | 'howto',
  howtoId: 'install',
  tab: 'props' as 'props' | 'languages' | 'skills',
  lang: 'core' as 'core' | 'react' | 'wc',
};
const cellCount = () => state.grid.rows * state.grid.cols;
let nudgedMiddle = false; // whether we've jumped a freshly-loaded volume to its middle slice

/** Volumes/cine open on the MIDDLE frame (frame 0 is often an empty edge slice).
 *  Fires once per example/placement, as soon as a source's frameCount is known —
 *  driven by the playback subscription so it works for both fresh and kept views. */
function maybeNudgeMiddle(): void {
  if (nudgedMiddle) return;
  const s = playback.getState();
  if (s.frameCount > 2) {
    nudgedMiddle = true;
    playback.setFrame(Math.floor(s.frameCount / 2));
  }
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const seriesById = (id: string): Series => SERIES.find((s) => s.id === id)!;
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fitSelection(n: number): void {
  state.selected = Array.from({ length: n }, (_, i) => state.selected[i] ?? null);
}
/** grow/shrink the selection, filling NEW cells from a cycling series pool so a
 *  resized grid looks populated (used by the Grid control on the layout example). */
function fitSelectionFilled(n: number): void {
  const pool = state.selected.filter((x): x is string => !!x);
  const base = pool.length ? pool : SERIES.map((s) => s.id);
  state.selected = Array.from({ length: n }, (_, i) => state.selected[i] ?? base[i % base.length]);
}
function copyButton(getText: () => string): HTMLButtonElement {
  const b = el('button', 'copy-btn', 'Copy') as HTMLButtonElement;
  b.onclick = async () => {
    const done = (t: string, ok = true) => { b.textContent = t; b.classList.toggle('ok', ok); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('ok'); }, 1500); };
    try { await navigator.clipboard.writeText(getText()); done('Copied ✓'); }
    catch { done('Ctrl+C', false); }
  };
  return b;
}

// ===========================================================================
// HOME
// ===========================================================================
const LOGO_SVG = `
<svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Biewer">
  <rect width="1024" height="1024" rx="224" fill="#0F6E56"/>
  <rect id="scan-line" x="80" y="510" width="864" height="4" rx="2" fill="#4EC5DC" opacity="0.6"/>
  <rect id="bar-0" x="152" y="442" width="80" height="140" rx="20" fill="#FFFFFF"/>
  <rect id="bar-1" x="312" y="312" width="80" height="400" rx="20" fill="#FFFFFF"/>
  <rect id="bar-2" x="472" y="156" width="80" height="712" rx="20" fill="#FFFFFF"/>
  <rect id="bar-3" x="632" y="312" width="80" height="400" rx="20" fill="#FFFFFF"/>
  <rect id="bar-4" x="792" y="442" width="80" height="140" rx="20" fill="#FFFFFF"/>
  <circle id="reticle-ring" cx="512" cy="512" r="380" stroke="#4EC5DC" stroke-width="10" opacity="0.9"/>
  <circle id="pulse-ring" cx="512" cy="512" r="380" stroke="#4EC5DC" stroke-width="6" fill="none"/>
  <g class="cardinal">
    <line x1="100" y1="512" x2="140" y2="512" stroke="#4EC5DC" stroke-width="10" stroke-linecap="round"/>
    <line x1="884" y1="512" x2="924" y2="512" stroke="#4EC5DC" stroke-width="10" stroke-linecap="round"/>
    <line x1="512" y1="100" x2="512" y2="140" stroke="#4EC5DC" stroke-width="10" stroke-linecap="round"/>
    <line x1="512" y1="884" x2="512" y2="924" stroke="#4EC5DC" stroke-width="10" stroke-linecap="round"/>
  </g>
  <circle id="focal-ring" cx="512" cy="512" r="42" fill="#0F6E56" stroke="#4EC5DC" stroke-width="8"/>
  <circle id="focal-dot" cx="512" cy="512" r="10" fill="#4EC5DC"/>
</svg>`;

const FEATURES: Array<[string, string, string]> = [
  ['◈', 'Any format', 'Images (webp / jpeg / png / jpeg-ls), medical volumes (NIfTI / DICOM), video (mp4) and archives (zip / gz) all normalize into one FrameSource.'],
  ['⚛', 'Any framework', 'A vanilla-TS core with React and a standard <biewer-view> Web Component — one element covers Vue, Angular, Svelte and plain HTML.'],
  ['⏯', 'Slice & cine', 'Scroll frames (slice) or auto-play (cine). Bind one PlaybackController to many views and they move together.'],
  ['✥', 'Headless tools', 'Zoom / pan / rotate / flip / invert / window-level as a headless controller. You render the toolbar; scope:"all" broadcasts to every view.'],
  ['▦', 'Layout is yours', 'Biewer ships a single view. 1×1, 2×2, R×C or any grid is your CSS — no viewType presets baked into the plugin.'],
  ['⚙', 'Worker-powered', 'Decoding and resampling run in Web Workers with rAF-coalesced input, so heavy volumes never freeze the UI.'],
];
const FORMAT_CHIPS = ['webp', 'jpeg', 'png', 'jpeg-ls', 'nifti', 'dicom', 'mp4', 'zip', 'gz'];

function renderHome(): void {
  $('#app').innerHTML = `
  <div class="home">
    <section class="hero">
      <div class="hero-grid-bg"></div>
      <div class="hero-inner">
        <div class="hero-copy">
          <div class="eyebrow">Universal image viewer · plugin</div>
          <h1>Render <span class="grad">any image</span>,<br/>in any framework.</h1>
          <p class="lede">Biewer is a framework-agnostic viewer plugin. It decodes images, medical
            volumes, video and archives into a single frame model — and gives you slice / cine playback
            and headless tools.</p>
          <p class="sub">Layout, toolbar UI and data policy stay yours. Ships as a vanilla-TS core with
            React and Web Component adapters.</p>
          <div class="cta-row">
            <a class="btn primary" href="#/studio">Open the viewer studio →</a>
            <a class="btn ghost" href="#/studio" data-tab="languages">View the code</a>
          </div>
          <div class="installs">
            <code>npm i @deepnoid/biewer</code>
            <code>import '@deepnoid/biewer/wc'</code>
          </div>
        </div>
        <div class="hero-icon">${LOGO_SVG}</div>
      </div>
    </section>
    <section class="features">
      <h2>One viewer, every surface</h2>
      <p class="sub2">The plugin owns output. Everything else stays with your product.</p>
      <div class="feature-grid">
        ${FEATURES.map(([i, h, p]) => `<div class="feature"><div class="fi">${i}</div><h3>${h}</h3><p>${escapeHtml(p)}</p></div>`).join('')}
      </div>
    </section>
    <section class="trusted">
      <h2>Every format, one path</h2>
      <div class="chips" style="margin-top:20px">${FORMAT_CHIPS.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      <p class="note">All inputs are decoded into a single FrameSource — so views, tools and playback
        never need to know the format. Open the studio to try live layouts and per-example code.</p>
      <div class="cta-row" style="justify-content:center;margin-top:24px"><a class="btn primary" href="#/studio">Explore the studio →</a></div>
    </section>
  </div>`;
}

// ===========================================================================
// STUDIO
// ===========================================================================
function renderStudio(): void {
  $('#app').innerHTML = `
  <div class="studio">
    <aside id="left"></aside>
    <main id="center">
      <div id="toolbar" class="toolbar"></div>
      <div id="stage" class="stage"></div>
      <div id="playback" class="playback"></div>
      <div id="meta" class="meta"></div>
      <div id="comments" class="comments"></div>
    </main>
    <aside id="right"></aside>
  </div>`;
  renderLeft();
  renderRight();
  renderToolbar();
  renderPlayback();
  renderComments();
  void rebuildStage();
}

// ---- left nav ----
function renderLeft(): void {
  const root = $('#left');
  root.innerHTML = '';
  for (const cat of EXAMPLE_CATEGORIES) {
    const g = el('div', 'nav-group');
    g.appendChild(el('h3', undefined, cat));
    for (const ex of EXAMPLES.filter((e) => e.category === cat)) {
      const b = el('button', 'nav-item' + (state.commentsMode === 'example' && state.activeExample === ex.id ? ' active' : '')) as HTMLButtonElement;
      b.innerHTML = `<span class="ex-title">${ex.title}</span>` + (ex.planned ? '<span class="badge-plan">M2</span>' : '');
      b.title = ex.desc;
      b.onclick = () => applyExample(ex);
      g.appendChild(b);
    }
    root.appendChild(g);
  }
  root.appendChild(el('div', 'nav-sep'));
  const docs = el('div', 'nav-group');
  docs.appendChild(el('h3', undefined, 'How to use'));
  for (const it of HOW_TO) {
    const b = el('button', 'nav-item' + (state.commentsMode === 'howto' && state.howtoId === it.id ? ' active' : '')) as HTMLButtonElement;
    b.innerHTML = `<span class="ico">${it.ico}</span><span class="ex-title">${it.label}</span>`;
    b.onclick = () => {
      state.commentsMode = 'howto';
      state.howtoId = it.id;
      renderLeft();
      renderComments();
      document.querySelector('#comments')?.scrollIntoView({ behavior: 'smooth' });
    };
    docs.appendChild(b);
  }
  root.appendChild(docs);
}

function applyExample(ex: Example): void {
  state.activeExample = ex.id;
  state.commentsMode = 'example';
  nudgedMiddle = false;
  state.grid = { rows: ex.rows, cols: ex.cols };
  state.selected = Array.from({ length: ex.rows * ex.cols }, (_, i) => ex.series[i] ?? null);
  if (ex.tool !== undefined) tools.setActiveTool(ex.tool);
  if (ex.mode) playback.setMode(ex.mode);
  renderLeft();
  renderRight();
  renderToolbar();
  renderComments();
  void rebuildStage().then(maybeNudgeMiddle); // kept views already know their frameCount
}

// ---- right rail ----
function serieButton(s: Series): HTMLButtonElement {
  const cells = state.selected.reduce<number[]>((a, x, i) => (x === s.id ? [...a, i + 1] : a), []);
  const posLabel = cells.length === 0 ? '' : cells.length === 1 ? `#${cells[0]}` : `×${cells.length}`;
  const b = el('button', 'serie' + (cells.length ? ' selected' : '')) as HTMLButtonElement;
  b.draggable = true;
  b.dataset.seriesId = s.id;
  b.innerHTML =
    `<span class="thumb-wrap"><img class="thumb" ${s.thumb ? `src="${s.thumb}"` : ''} alt="" /><span class="dur">${s.fmt}</span></span>` +
    `<span class="info"><span class="t">${s.title}</span><span class="m">${s.modality} · ${s.date}</span></span>` +
    (posLabel ? `<span class="pos" title="in viewport ${cells.join(', ')}">${posLabel}</span>` : '');
  b.addEventListener('dragstart', (e) => { e.dataTransfer!.setData('text/biewer-series', s.id); e.dataTransfer!.effectAllowed = 'copy'; b.classList.add('dragging'); });
  b.addEventListener('dragend', () => b.classList.remove('dragging'));
  return b;
}
function renderRight(): void {
  const root = document.querySelector('#right');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(el('p', 'rail-hint', '↔ Drag a series onto any viewport. The same series can go in many viewports; duplicates are fine.'));
  const group = (title: string, list: Series[]) => {
    root.appendChild(el('h3', undefined, title));
    for (const s of list) root.appendChild(serieButton(s));
  };
  group('Current study · ' + CURRENT_SERIES[0].date, CURRENT_SERIES);
  group('Prior study · Follow-up', PRIOR_SERIES);
}
function placeAt(cell: number, id: string): void {
  fitSelection(cellCount());
  state.selected[cell] = id;
  nudgedMiddle = false; // a freshly dropped volume should also start mid-slice
  afterPlacement();
}
function clearCell(cell: number): void {
  if (state.selected[cell] == null) return;
  state.selected[cell] = null;
  afterPlacement();
}
function afterPlacement(): void {
  state.activeExample = ''; // manual edits detach from a named example (custom grid stays)
  renderLeft();
  renderRight();
  renderComments();
  void rebuildStage().then(maybeNudgeMiddle);
}

// ---- toolbar (Tools only; layout is NOT a plugin tool) ----
const TOOL_BTNS: Array<{ t?: BiewerTool; op?: string; label: string }> = [
  { t: 'zoom', label: 'Zoom' },
  { t: 'pan', label: 'Pan' },
  { t: 'window-level', label: 'W/L' },
  { op: 'rotate', label: 'Rotate' },
  { op: 'flipH', label: 'Flip' },
  { op: 'invert', label: 'Invert' },
  { op: 'reset', label: 'Reset' },
];
function setGrid(rows: number, cols: number): void {
  state.grid = { rows: Math.max(1, Math.min(GRID_MAX.rows, rows)), cols: Math.max(1, Math.min(GRID_MAX.cols, cols)) };
  fitSelectionFilled(cellCount());
  renderToolbar();
  renderRight();
  void rebuildStage();
}
/** Grid controls: a preset dropdown + an icon that opens a spreadsheet-style
 *  picker. The picker grows dynamically as you hover the edge (unbounded up to
 *  GRID_MAX), like Excel/Word's insert-table grid. */
function gridControls(): HTMLElement {
  const wrap = el('div', 'grid-ctl');

  // 1) preset dropdown (default sizes)
  const sel = el('select', 'mode grid-preset') as HTMLSelectElement;
  const cur = `${state.grid.rows}x${state.grid.cols}`;
  const known = GRID_PRESETS.some((p) => p.id === cur);
  sel.innerHTML =
    GRID_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('') +
    (known ? '' : `<option value="${cur}">${state.grid.rows}×${state.grid.cols}</option>`);
  sel.value = cur;
  sel.onchange = () => {
    const p = GRID_PRESETS.find((x) => x.id === sel.value);
    if (p) setGrid(p.rows, p.cols);
  };
  wrap.appendChild(sel);

  // 2) icon → popover picker
  const iconBtn = el('button', 'tbtn gp-icon') as HTMLButtonElement;
  iconBtn.title = 'Pick a custom grid';
  iconBtn.setAttribute('aria-label', 'Pick a custom grid');
  iconBtn.innerHTML = gridIconSvg();
  const pop = buildPickerPopover();
  iconBtn.onclick = (e) => { e.stopPropagation(); togglePopover(pop, iconBtn); };
  wrap.append(iconBtn, pop);
  return wrap;
}

function gridIconSvg(): string {
  return `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
    <line x1="1.5" y1="6" x2="14.5" y2="6"/><line x1="1.5" y1="10.5" x2="14.5" y2="10.5"/>
    <line x1="6" y1="1.5" x2="6" y2="14.5"/><line x1="10.5" y1="1.5" x2="10.5" y2="14.5"/>
  </svg>`;
}

let openPopover: HTMLElement | null = null;
function togglePopover(pop: HTMLElement, anchor: HTMLElement): void {
  const show = pop.style.display === 'none' || !pop.style.display;
  closePopover();
  if (show) {
    pop.style.display = 'block';
    openPopover = pop;
    (pop as HTMLElement & { _render?: () => void })._render?.();
    // reposition under the anchor
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    pop.style.top = `${r.bottom + 6}px`;
  }
}
function closePopover(): void {
  if (openPopover) { openPopover.style.display = 'none'; openPopover = null; }
}
document.addEventListener('click', () => closePopover());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

/** Excel-style dynamic picker: renders (max(hover,current)+1) rows/cols so it
 *  extends when you reach the edge. Unbounded up to GRID_MAX. */
function buildPickerPopover(): HTMLElement {
  const pop = el('div', 'gp-pop');
  pop.style.display = 'none';
  pop.addEventListener('click', (e) => e.stopPropagation());
  const label = el('div', 'gp-label');
  const board = el('div', 'gp-board');
  pop.append(label, board);

  let hoverR = state.grid.rows;   // 1-based preview extent
  let hoverC = state.grid.cols;
  let builtR = 0, builtC = 0;     // current DOM board size

  // desired board size = one past the hover, clamped to GRID_MAX
  const desired = () => ({
    R: Math.min(GRID_MAX.rows, Math.max(state.grid.rows, hoverR) + 1),
    C: Math.min(GRID_MAX.cols, Math.max(state.grid.cols, hoverC) + 1),
  });

  // paint only toggles classes on existing cells — no DOM rebuild (so a press
  // between mousedown/mouseup is never invalidated → click always fires).
  const paint = () => {
    for (const node of Array.from(board.children) as HTMLElement[]) {
      const r = +node.dataset.r!, c = +node.dataset.c!;
      node.classList.toggle('on', r <= hoverR && c <= hoverC);
    }
    label.textContent = `${hoverR} × ${hoverC}`;
  };

  // build rebuilds the DOM ONLY when the board size actually changes (edge grow).
  const build = () => {
    const { R, C } = desired();
    if (R === builtR && C === builtC) { paint(); return; }
    builtR = R; builtC = C;
    board.style.gridTemplateColumns = `repeat(${C}, 16px)`;
    board.innerHTML = '';
    for (let r = 1; r <= R; r++) {
      for (let c = 1; c <= C; c++) {
        const cell = el('button', 'gp-cell') as HTMLButtonElement;
        cell.dataset.r = String(r); cell.dataset.c = String(c);
        cell.title = `${r} × ${c}`;
        cell.addEventListener('mouseenter', () => { hoverR = r; hoverC = c; build(); });
        cell.addEventListener('click', (e) => { e.stopPropagation(); setGrid(r, c); closePopover(); });
        board.appendChild(cell);
      }
    }
    paint();
  };

  (pop as HTMLElement & { _render?: () => void })._render = () => {
    hoverR = state.grid.rows; hoverC = state.grid.cols; builtR = 0; builtC = 0; build();
  };
  build();
  return pop;
}
function renderToolbar(): void {
  const root = $('#toolbar');
  root.innerHTML = '';
  // Grid control is available on EVERY example — viewport count is always the
  // host's choice, so any scenario can be arranged in any grid.
  const g = el('div', 'grp');
  g.appendChild(el('span', 'lbl', 'Grid'));
  g.appendChild(gridControls());
  g.appendChild(el('span', 'hint-inline', 'host CSS grid — not a plugin tool'));
  root.appendChild(g);
  root.appendChild(el('div', 'sep'));
  const toolGrp = el('div', 'grp');
  toolGrp.appendChild(el('span', 'lbl', 'Tools'));
  for (const spec of TOOL_BTNS) {
    const active = spec.t && tools.activeTool === spec.t;
    const b = el('button', 'tbtn' + (active ? ' active' : ''), spec.label) as HTMLButtonElement;
    b.dataset.tool = spec.t ?? '';
    b.onclick = () => {
      if (spec.t) tools.setActiveTool(tools.activeTool === spec.t ? null : spec.t);
      else if (spec.op === 'rotate') tools.apply({ op: 'rotate', degrees: 90 });
      else if (spec.op) tools.apply({ op: spec.op as 'flipH' | 'invert' | 'reset' });
    };
    toolGrp.appendChild(b);
  }
  root.appendChild(toolGrp);
}

// ---- stage (reconciled — only changed cells rebuild, others keep their live view) ----
async function rebuildStage(): Promise<void> {
  const stage = document.querySelector('#stage') as HTMLElement | null;
  if (!stage) return;
  const { rows, cols } = state.grid;
  const n = rows * cols;
  stage.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  stage.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  fitSelection(n);
  // grow/shrink cell wrappers (drop handlers bound once per wrapper)
  while (stage.children.length > n) stage.removeChild(stage.lastElementChild!);
  for (let i = stage.children.length; i < n; i++) {
    const cell = el('div', 'cell');
    makeDropTarget(cell, i);
    stage.appendChild(cell);
  }
  // reconcile each cell: rebuild ONLY when its series id actually changed
  for (let i = 0; i < n; i++) renderCell(stage.children[i] as HTMLElement, i);
  renderMeta();
}

/** Update one viewport cell in place. Keeps the live <biewer-view> (no dispose,
 *  no re-decode) when the series id is unchanged. */
function renderCell(cell: HTMLElement, i: number): void {
  const id = state.selected[i] ?? '';
  const cur = cell.dataset.seriesId; // undefined = never rendered ('' = rendered empty)
  if (cur !== undefined && cur === id) return; // unchanged → leave the live view alone
  cell.dataset.seriesId = id;
  cell.innerHTML = ''; // removing the old <biewer-view> disconnects it → core dispose()
  cell.classList.toggle('empty', !id);
  if (!id) {
    cell.appendChild(el('span', 'empty-hint', 'Drop a series here →'));
    return;
  }
  const s = seriesById(id);
  const badge = el('span', 'badge', `${s.title} · ${s.study === 'prior' ? 'prior' : s.date}`);
  const x = el('button', 'badge-x', '×') as HTMLButtonElement;
  x.title = 'Remove from this viewport';
  x.onclick = (ev) => { ev.stopPropagation(); clearCell(i); };
  badge.appendChild(x);
  cell.appendChild(badge);
  const view = document.createElement('biewer-view') as BiewerViewElement;
  view.tools = tools;
  view.playback = playback;
  // a freshly-decoded source reports frameCount here → jump volumes to mid-slice
  view.addEventListener('bw-source-ready', () => maybeNudgeMiddle());
  cell.appendChild(view);
  void realizeSeries(s).then((rs) => {
    if (cell.dataset.seriesId !== id) return; // cell changed again before decode finished
    view.source = rs.source!;
    renderRight();
    updatePlayback(playback.getState());
  });
}
function makeDropTarget(cell: HTMLElement, index: number): void {
  cell.dataset.cell = String(index);
  cell.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('text/biewer-series')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; cell.classList.add('dragover'); }
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
  cell.addEventListener('drop', (e) => {
    e.preventDefault(); cell.classList.remove('dragover');
    const id = e.dataTransfer?.getData('text/biewer-series');
    if (id) placeAt(index, id);
  });
}

// ---- playback ----
function renderPlayback(): void {
  const root = $('#playback');
  root.innerHTML = '';
  const mode = el('select', 'mode') as HTMLSelectElement;
  mode.innerHTML = `<option value="slice">slice</option><option value="auto">auto</option>`;
  mode.value = playback.getState().mode;
  mode.onchange = () => playback.setMode(mode.value as 'slice' | 'auto');
  root.appendChild(mode);
  const ctrls = el('div', 'ctrls');
  const mk = (glyph: string, fn: () => void, role?: string) => { const b = el('button', 'pbtn', glyph) as HTMLButtonElement; b.onclick = fn; if (role) b.dataset.role = role; return b; };
  ctrls.appendChild(mk('▶', () => (playback.getState().playing ? playback.pause() : playback.play()), 'play'));
  ctrls.appendChild(mk('⏹', () => playback.stop()));
  root.appendChild(ctrls);
  const scrub = el('div', 'scrub');
  const range = el('input') as HTMLInputElement;
  range.type = 'range'; range.min = '0'; range.value = '0'; range.dataset.role = 'scrub';
  range.oninput = () => playback.setFrame(Number(range.value));
  scrub.appendChild(range);
  root.appendChild(scrub);
  const speed = el('select', 'mode') as HTMLSelectElement;
  speed.innerHTML = [6, 12, 24, 30].map((f) => `<option value="${f}">${f} fps</option>`).join('');
  speed.value = '12'; speed.onchange = () => playback.setSpeed(Number(speed.value));
  root.appendChild(speed);
  const time = el('span', 'time', '0 / 0'); time.dataset.role = 'time';
  root.appendChild(time);
  updatePlayback(playback.getState());
}
function fmt(sec: number): string { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
function updatePlayback(s = playback.getState()): void {
  const range = document.querySelector('#playback [data-role=scrub]') as HTMLInputElement | null;
  const time = document.querySelector('#playback [data-role=time]') as HTMLElement | null;
  const play = document.querySelector('#playback [data-role=play]') as HTMLElement | null;
  if (range) { range.max = String(Math.max(0, s.frameCount - 1)); range.value = String(s.frame); }
  if (play) play.textContent = s.playing ? '⏸' : '▶';
  if (time) time.textContent = s.mode === 'auto' ? `${fmt(s.frame / s.speed)} / ${fmt(s.frameCount / s.speed)}` : `frame ${s.frame + 1} / ${s.frameCount}`;
}

// ---- meta ----
function renderMeta(): void {
  const root = document.querySelector('#meta');
  if (!root) return;
  const gridLabel = `${state.grid.rows}×${state.grid.cols}`;
  const ex = EXAMPLES.find((e) => e.id === state.activeExample);
  root.innerHTML = '';
  if (ex) {
    root.appendChild(el('h1', undefined, ex.title + (ex.planned ? ' <span class="badge-plan">planned · M2</span>' : '')));
    root.appendChild(el('div', 'sub', `${ex.category} · ${gridLabel} grid · host-owned layout`));
    root.appendChild(el('div', 'desc', ex.desc + (ex.planned ? ` <br/><span class="plan-note">This format/tool lands in a later milestone — shown here with a synthetic image stack so the flow is real.</span>` : '')));
  } else {
    const titles = state.selected.filter((x): x is string => !!x).map((id) => seriesById(id).title);
    root.appendChild(el('h1', undefined, 'Free editing'));
    root.appendChild(el('div', 'sub', `${gridLabel} grid · ${titles.length} series · pick an example on the left to see its usage code`));
    root.appendChild(el('div', 'desc', 'Drag series onto viewports and resize the grid freely. The layout is your CSS grid — Biewer only renders each single view.'));
  }
}

// ---- comments: example docs (Props/Languages/Skills) OR how-to setup ----
function renderComments(): void {
  const root = document.querySelector('#comments');
  if (!root) return;
  root.innerHTML = '';
  if (state.commentsMode === 'howto') { renderHowTo(root as HTMLElement); return; }
  renderExampleDocs(root as HTMLElement);
}

function mdBox(name: string, text: string): HTMLElement {
  const box = el('div', 'md-box');
  const bar = el('div', 'md-bar');
  bar.appendChild(el('span', 'md-name', name));
  bar.appendChild(copyButton(() => text));
  box.appendChild(bar);
  box.appendChild(el('pre', 'code md', escapeHtml(text)));
  return box;
}

function renderExampleDocs(root: HTMLElement): void {
  const ex = EXAMPLES.find((e) => e.id === state.activeExample);
  const tabs = el('div', 'tabs');
  const TABS: Array<[typeof state.tab, string]> = [['props', 'Props'], ['languages', 'Languages'], ['skills', 'Skills']];
  for (const [id, label] of TABS) {
    const b = el('button', 'tab' + (state.tab === id ? ' active' : ''), label) as HTMLButtonElement;
    b.onclick = () => { state.tab = id; renderComments(); };
    tabs.appendChild(b);
  }
  root.appendChild(tabs);

  if (!ex) {
    root.appendChild(el('p', 'skill-intro', 'Free editing — pick an example on the left to see the exact code, props and AI prompt for that scenario.'));
    return;
  }
  const pane = el('div', 'tabpane active');
  pane.appendChild(el('p', 'skill-intro', `How to build “${ex.title}” with Biewer.`));

  if (state.tab === 'props') {
    const t = el('table', 'proptbl');
    t.innerHTML = '<tr><th>Prop</th><th>Type</th><th>Role in this example</th></tr>' +
      propsFor(ex).map((k) => { const info = PROP_INFO[k]; return info ? `<tr><td><code>${k}</code></td><td>${escapeHtml(info[0])}</td><td>${info[1]}</td></tr>` : ''; }).join('');
    pane.appendChild(t);
  } else if (state.tab === 'languages') {
    const btns = el('div', 'langbtns');
    (['core', 'react', 'wc'] as const).forEach((lng) => {
      const b = el('button', 'langbtn' + (state.lang === lng ? ' active' : ''), lng === 'wc' ? 'Web Component' : lng) as HTMLButtonElement;
      b.onclick = () => { state.lang = lng; renderComments(); };
      btns.appendChild(b);
    });
    pane.appendChild(btns);
    pane.appendChild(mdBox(`${ex.id}.${state.lang === 'wc' ? 'html' : state.lang === 'react' ? 'tsx' : 'ts'}`, codeFor(ex, state.lang)));
  } else {
    pane.appendChild(el('p', 'skill-intro', 'Hand this to an AI assistant (Claude, Cursor, Copilot…) to build this exact example.'));
    pane.appendChild(mdBox(`ask-${ex.id}.md`, askFor(ex)));
  }
  root.appendChild(pane);
}

function renderHowTo(root: HTMLElement): void {
  root.appendChild(el('p', 'skill-intro', 'Using @deepnoid/biewer in your own app — setup and adapters.'));
  const btns = el('div', 'langbtns');
  for (const it of HOW_TO) {
    const b = el('button', 'langbtn' + (state.howtoId === it.id ? ' active' : ''), it.label) as HTMLButtonElement;
    b.onclick = () => { state.howtoId = it.id; renderLeft(); renderComments(); };
    btns.appendChild(b);
  }
  root.appendChild(btns);
  const active = HOW_TO.find((h) => h.id === state.howtoId) ?? HOW_TO[0];
  root.appendChild(mdBox(`${active.id}.md`, active.md));
}

// ===========================================================================
// routing
// ===========================================================================
function route(): void {
  const hash = location.hash || '#/';
  const isStudio = hash.startsWith('#/studio');
  document.body.className = isStudio ? 'route-studio' : 'route-home';
  document.querySelectorAll('.yt-header nav a[data-route]').forEach((a) => {
    const active = (a.getAttribute('data-route') === 'studio' && isStudio) || (a.getAttribute('data-route') === 'home' && !isStudio);
    a.classList.toggle('active', active);
  });
  if (isStudio) renderStudio();
  else { renderHome(); window.scrollTo(0, 0); }
}
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[data-tab]') as HTMLElement | null;
  if (a) { state.commentsMode = 'example'; state.tab = a.getAttribute('data-tab') as typeof state.tab; }
});

playback.subscribe((s) => updatePlayback(s));
tools.subscribe(() => {
  document.querySelectorAll('#toolbar .tbtn[data-tool]').forEach((b) => {
    const e2 = b as HTMLElement;
    e2.classList.toggle('active', !!e2.dataset.tool && e2.dataset.tool === tools.activeTool);
  });
});
window.addEventListener('hashchange', route);
void Promise.all(SERIES.map((s) => makeThumb(s))).then(() => renderRight());
route();

(window as unknown as { __biewer: unknown }).__biewer = { tools, playback, state, route, placeAt, setGrid, applyExample };
