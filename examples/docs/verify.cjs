// Headless check: home → studio (per-example docs, host-owned layouts incl.
// custom R×C grid, drag&drop duplicates, HOW-TO setup).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.URL || 'http://localhost:5190/';

async function firstCanvasStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.stage biewer-view canvas');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonzero = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] || d[i + 1] || d[i + 2]) nonzero++; sum = (sum + d[i] + d[i + 1] + d[i + 2]) % 2147483647; }
    return { nonzero, sum };
  });
}
const cellCanvases = (page) => page.evaluate(() => document.querySelectorAll('.stage biewer-view canvas').length);
const cellDivs = (page) => page.evaluate(() => document.querySelectorAll('.stage .cell').length);

// WebGL 3D canvas: draw onto a 2D canvas to read pixels (preserveDrawingBuffer:true).
async function volStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#stage biewer-volume canvas');
    if (!c || !c.width) return null;
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let bright = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] + d[i + 1] + d[i + 2];
      if (lum > 60) bright++;               // above the ~38 dark background
      sum = (sum + lum) % 2147483647;
    }
    return { bright, sum, w: c.width, h: c.height };
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const results = {};

  // HOME
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('.hero-icon svg') && document.querySelector('.hero h1'), { timeout: 15000 });
  results.home = await page.evaluate(() => ({ logo: document.querySelectorAll('.hero-icon svg rect').length >= 5, features: document.querySelectorAll('.feature').length, body: document.body.className }));
  await page.screenshot({ path: 'verify-home.png' });

  // STUDIO
  await page.evaluate(() => { location.hash = '#/studio'; });
  await page.waitForFunction(() => document.querySelector('.stage biewer-view canvas'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1000));

  results.catalog = await page.evaluate(() => ({
    groups: document.querySelectorAll('#left .nav-group').length,          // 5 example cats + how-to
    layoutsCat: [...document.querySelectorAll('#left .nav-group h3')].some((h) => h.textContent === 'Layouts'),
    planned: document.querySelectorAll('#left .badge-plan').length,
    items: document.querySelectorAll('#left .nav-item').length,
    noLayoutTool: ![...document.querySelectorAll('#toolbar .lbl')].some((l) => l.textContent === 'Layout'),
  }));

  // per-example docs differ: pick "Zoom & pan" (tool) then "NIfTI volume" (format), compare code
  async function exampleCode(title) {
    return page.evaluate((t) => {
      const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes(t));
      it && it.click();
      // switch to Languages tab
      const lt = [...document.querySelectorAll('.comments .tab')].find((b) => b.textContent.trim() === 'Languages');
      lt && lt.click();
      const pre = document.querySelector('.comments .md-box pre');
      return { code: pre ? pre.textContent : '', props: [...document.querySelectorAll('.comments .proptbl code')].length };
    }, title);
  }
  const zoomDoc = await exampleCode('Zoom & pan');
  const niftiDoc = await exampleCode('NIfTI volume');
  results.perExampleDocs = zoomDoc.code.includes('setActiveTool') && niftiDoc.code.includes('.nii.gz') && zoomDoc.code !== niftiDoc.code;

  // Grid control is present on EVERY example (not just Layout) — check a tool example
  results.gridEverywhere = await page.evaluate(() => {
    const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('Zoom & pan'));
    it && it.click();
    return !!document.querySelector('.toolbar .grid-preset') && !!document.querySelector('.toolbar .gp-icon');
  });

  // single Layout example drives the grid: preset dropdown + icon popover picker
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('Grid layout')); it && it.click(); });
  await new Promise((r) => setTimeout(r, 200));
  results.gridControls = await page.evaluate(() => ({
    presetOptions: document.querySelectorAll('.grid-preset option').length, // >= 6
    hasIcon: !!document.querySelector('.gp-icon'),
    popoverHiddenInitially: getComputedStyle(document.querySelector('.gp-pop')).display === 'none',
  }));
  // preset dropdown → 4×2 (8 cells)
  results.presetApply = await page.evaluate(() => {
    const sel = document.querySelector('.grid-preset');
    sel.value = '4x2'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return document.querySelectorAll('.stage .cell').length; // 8
  });
  // icon → open popover; hover the edge to grow past 4×4; then a REAL mouse
  // gesture (enter → mousedown → mouseup → click) on the SAME cell must apply.
  results.picker = await page.evaluate(() => {
    document.querySelector('.gp-icon').click();
    const pop = document.querySelector('.gp-pop');
    const opened = getComputedStyle(pop).display !== 'none';
    const fire = (cell, type) => cell.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    const hover = (r, c) => { const cell = pop.querySelector(`.gp-cell[data-r="${r}"][data-c="${c}"]`); if (!cell) return false; fire(cell, 'mouseenter'); return true; };
    const seq = [[3, 3], [4, 4], [5, 5], [6, 5]];
    let grewPast4 = true;
    for (const [r, c] of seq) if (!hover(r, c)) grewPast4 = false;
    const maxR = Math.max(...[...pop.querySelectorAll('.gp-cell')].map((x) => +x.dataset.r));
    // full press-release gesture on the target (this fails if the board rebuilds mid-press)
    const target = pop.querySelector('.gp-cell[data-r="6"][data-c="5"]');
    if (target) { fire(target, 'mouseenter'); fire(target, 'mousedown'); fire(target, 'mouseup'); target.click(); }
    return { opened, grewPast4: grewPast4 && maxR >= 6, cells: document.querySelectorAll('.stage .cell').length };
  });

  // REAL DICOM decode + paint (emri_small, content on every frame) + slice step
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('DICOM series')); it && it.click(); });
  await page.waitForFunction(() => {
    const c = document.querySelector('.stage biewer-view canvas'); if (!c) return false;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i]) nz++;
    return nz > 1000;
  }, { timeout: 20000 });
  const painted = await firstCanvasStats(page);
  results.painted = !!painted && painted.nonzero > 1000;
  await page.evaluate(() => window.__biewer.playback.step(3));
  await new Promise((r) => setTimeout(r, 500));
  const afterStep = await firstCanvasStats(page);
  results.frameChanged = !!afterStep && !!painted && afterStep.sum !== painted.sum;

  // window/level on a gray (DICOM) source: a big W/L change must repaint pixels
  const beforeWL = await firstCanvasStats(page);
  await page.evaluate(() => window.__biewer.tools.apply({ op: 'windowLevel', wc: 20, ww: 40 }));
  await new Promise((r) => setTimeout(r, 400));
  const afterWL = await firstCanvasStats(page);
  results.windowLevel = !!afterWL && !!beforeWL && afterWL.sum !== beforeWL.sum;
  await page.evaluate(() => window.__biewer.tools.apply({ op: 'reset' })); // restore auto W/L

  // JPEG-LS: real compressed DICOM decodes from scratch and paints
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('JPEG-LS')); it && it.click(); });
  results.jpegls = await page.evaluate((to) => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const cell = document.querySelector('.stage .cell');
      const cv = cell && cell.querySelector('canvas');
      const err = cell && cell.querySelector('.bw-status--error');
      if (err) { clearInterval(iv); res({ ok: false, err: err.textContent }); return; }
      if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i]) nz++; if (nz > 1000) { clearInterval(iv); res({ ok: true, nz }); return; } }
      if (Date.now() - t0 > to) { clearInterval(iv); res({ ok: false, err: 'timeout' }); }
    }, 300);
  }), 25000);

  // 3D volume rendering (WebGL raycaster): a real CT volume decodes + paints,
  // orbiting the camera changes pixels, and DVR→MIP re-renders differently.
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('Volume rendering')); it && it.click(); });
  await page.waitForFunction(() => {
    const c = document.querySelector('#stage biewer-volume canvas');
    if (!c || !c.width) return false;
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    tmp.getContext('2d').drawImage(c, 0, 0);
    const d = tmp.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let bright = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) bright++;
    return bright > 300;
  }, { timeout: 40000 });
  const vol0 = await volStats(page);
  results.volume3dPaint = !!vol0 && vol0.bright > 300;
  // orbit the camera → pixels must change
  await page.evaluate(() => { const el = document.querySelector('#stage biewer-volume'); el.getView().setCamera({ azimuth: 2.3, elevation: 0.7 }); });
  await new Promise((r) => setTimeout(r, 500));
  const vol1 = await volStats(page);
  results.volume3dRotate = !!vol1 && !!vol0 && vol1.sum !== vol0.sum;
  // DVR → MIP via the 3D toolbar → re-render differs
  await page.evaluate(() => { const b = [...document.querySelectorAll('#toolbar .tbtn')].find((x) => x.textContent.trim() === 'MIP'); b && b.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const vol2 = await volStats(page);
  results.volume3dMip = !!vol2 && !!vol1 && vol2.sum !== vol1.sum;
  await page.screenshot({ path: 'verify-volume3d.png' });

  // MPR + 3D multi-angle: one volume as 3 orthogonal planes (different axes →
  // different pixels) + 1 interactive 3D volume, all painted in a 2×2 grid.
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('MPR + 3D')); it && it.click(); });
  await page.waitForFunction(() => {
    const planes = [...document.querySelectorAll('#stage biewer-view canvas')];
    if (planes.length !== 3 || !document.querySelector('#stage biewer-volume canvas')) return false;
    return planes.every((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i]) nz++; return nz > 500; });
  }, { timeout: 40000 });
  results.mpr = await page.evaluate(() => {
    const planes = [...document.querySelectorAll('#stage biewer-view canvas')];
    const sums = planes.map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i]) % 2147483647; return s; });
    return {
      planes: planes.length,
      distinctAxes: new Set(sums).size === sums.length, // axial/coronal/sagittal differ
      hasVolume: !!document.querySelector('#stage biewer-volume canvas'),
      labels: [...document.querySelectorAll('#stage .cell .badge')].map((b) => b.textContent.replace('×', '').split(' · ')[0]).join(','),
    };
  });
  // the 3D cell in the MPR layout also paints (WebGL)
  const mprVol = await volStats(page);
  results.mprVolume = !!mprVol && mprVol.bright > 300;
  await page.screenshot({ path: 'verify-mpr-3d.png' });

  // Layout example: 2×2 grid actually mounts 4 viewports (DOM canvas count)
  await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('Grid layout')); it && it.click(); });
  await page.waitForFunction(() => document.querySelectorAll('.stage biewer-view canvas').length >= 4, { timeout: 20000 });
  results.cells = await cellCanvases(page);

  // drag&drop duplicate allowed (existing cell stays)
  results.duplicate = await page.evaluate(() => { window.__biewer.placeAt(0, 's1'); window.__biewer.placeAt(1, 's1'); const s = window.__biewer.state.selected; return s[0] === 's1' && s[1] === 's1'; });

  // NO full reload on drop: untouched cells keep their SAME <canvas> element.
  await page.evaluate(() => {
    window.__biewer.setGrid(2, 2);
    window.__biewer.placeAt(0, 's1'); window.__biewer.placeAt(1, 's2');
    window.__biewer.placeAt(2, 's3'); window.__biewer.placeAt(3, 's4');
  });
  await page.waitForFunction(() => document.querySelectorAll('.stage biewer-view canvas').length === 4, { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('.stage .cell')].forEach((c, i) => { const cv = c.querySelector('canvas'); if (cv) cv.dataset.tag = 'T' + i; }));
  await page.evaluate(() => window.__biewer.placeAt(2, 'p1')); // change only cell 2
  await new Promise((r) => setTimeout(r, 600));
  results.incremental = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.stage .cell')];
    const tag = (i) => { const cv = cells[i].querySelector('canvas'); return cv ? cv.dataset.tag : null; };
    return { kept0: tag(0) === 'T0', kept1: tag(1) === 'T1', kept3: tag(3) === 'T3', cell2Replaced: tag(2) !== 'T2' };
  });

  // HOW TO USE = real setup
  results.howto = await page.evaluate(() => {
    const it = [...document.querySelectorAll('#left .nav-item')].find((b) => /HTTP client/.test(b.textContent));
    it && it.click();
    const pre = document.querySelector('.comments .md-box pre');
    return { mode: window.__biewer.state.commentsMode, mentionsHttp: pre ? /setHttpClient/.test(pre.textContent) : false };
  });
  // real hardware-style click via page.mouse on the picker (closest to a user)
  results.realMouse = await (async () => {
    await page.evaluate(() => { const it = [...document.querySelectorAll('#left .nav-item')].find((b) => b.textContent.includes('Grid layout')); it && it.click(); });
    await new Promise((r) => setTimeout(r, 150));
    await page.click('.gp-icon');
    await new Promise((r) => setTimeout(r, 150));
    // hover outward so a 3×3 cell exists, then move to it and real-click
    const box = await page.evaluate(() => {
      const pop = document.querySelector('.gp-pop');
      [[2, 2], [3, 3]].forEach(([r, c]) => { const x = pop.querySelector(`.gp-cell[data-r="${r}"][data-c="${c}"]`); x && x.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); });
      const cell = pop.querySelector('.gp-cell[data-r="3"][data-c="3"]');
      const b = cell.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.click(box.x, box.y);
    await new Promise((r) => setTimeout(r, 300));
    return page.evaluate(() => ({ grid: `${window.__biewer.state.grid.rows}x${window.__biewer.state.grid.cols}`, cells: document.querySelectorAll('.stage .cell').length }));
  })();
  await page.screenshot({ path: 'verify-studio.png' });

  await browser.close();
  results.pageErrors = errors;
  const ok = results.home.logo && results.home.features >= 6 && results.home.body === 'route-home' &&
    results.catalog.groups >= 6 && results.catalog.layoutsCat && results.catalog.noLayoutTool && results.catalog.planned >= 1 &&
    results.perExampleDocs && results.gridEverywhere &&
    results.gridControls.presetOptions >= 6 && results.gridControls.hasIcon && results.gridControls.popoverHiddenInitially &&
    results.presetApply === 8 && results.picker.opened && results.picker.grewPast4 && results.picker.cells === 30 &&
    results.realMouse.grid === '3x3' && results.realMouse.cells === 9 &&
    results.painted && results.frameChanged && results.windowLevel && results.jpegls.ok && results.cells >= 4 && results.duplicate &&
    results.volume3dPaint && results.volume3dRotate && results.volume3dMip &&
    results.mpr.planes === 3 && results.mpr.distinctAxes && results.mpr.hasVolume && results.mprVolume &&
    results.incremental.kept0 && results.incremental.kept1 && results.incremental.kept3 && results.incremental.cell2Replaced &&
    results.howto.mode === 'howto' && results.howto.mentionsHttp && errors.length === 0;
  console.log(JSON.stringify({ ok, results }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('verify failed:', e); process.exit(2); });
