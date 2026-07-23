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
    results.painted && results.frameChanged && results.cells >= 4 && results.duplicate &&
    results.incremental.kept0 && results.incremental.kept1 && results.incremental.kept3 && results.incremental.cell2Replaced &&
    results.howto.mode === 'howto' && results.howto.mentionsHttp && errors.length === 0;
  console.log(JSON.stringify({ ok, results }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('verify failed:', e); process.exit(2); });
