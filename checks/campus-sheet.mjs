// Real layout and native touch regression, without the unrelated WebGL boot.
// Run: node checks/campus-sheet.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const bundle = await build({
  stdin: {
    contents: `import { createCampusOverlay } from './src/experiences/murcia/campus/section/campusOverlay';
      window.overlay = createCampusOverlay({ hostLayout: true,
        container: document.querySelector('.murcia-ui'), onClose() {},
        onPrevious() {}, onNext() {},
        labels: { leave: 'Volver', expand: 'Ampliar', collapse: 'Reducir', previous: 'Anterior', next: 'Siguiente' } });
      window.longCopy = { title: 'Software a medida', subtitle: 'Herramientas para tu negocio.',
        detail: 'Un proceso claro, con toda la información accesible. '.repeat(45),
        caption: 'FINAL DEL CONTENIDO', measures: ['Procesos', 'Resultados'] };
      window.overlay.show(window.longCopy); window.overlay.revealCaption();`,
    resolveDir: process.cwd(), loader: 'ts',
  }, bundle: true, write: false, format: 'iife',
});
const css = await readFile('src/experiences/murcia/styles/murcia.css', 'utf8');
const browser = await chromium.launch({ channel: process.env.SHEET_BROWSER_CHANNEL });
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div class="murcia-ui"></div>');
    await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;background:#15151b;font-family:Arial} ' + css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const panel = page.locator('.campus-overlay');
    const body = page.locator('.campus-overlay__body');
    const grip = page.locator('.campus-overlay__handle');
    await panel.waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    const compact = await panel.boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
    const handle = await grip.boundingBox();
    const x = viewport.width / 2, y = handle.y + handle.height / 2;
    await touch('touchStart', x, y);
    await touch('touchMove', x, y - 65);
    const during = await panel.boundingBox();
    assert(Math.abs(during.height - compact.height - 65) < 3, 'sheet follows the finger before release');
    assert(Math.abs(during.y + during.height - viewport.height) < 2, 'sheet stays bottom anchored');
    await touch('touchEnd', x, y - 65);
    await page.waitForTimeout(400);
    assert.equal(await panel.getAttribute('data-sheet-stop'), 'expanded');
    assert((await panel.boundingBox()).height > compact.height + 50);
    // A real browser scroll gesture, not assignment to scrollTop.
    const reading = await body.boundingBox();
    await touch('touchStart', x, reading.y + reading.height - 30);
    for (let step = 1; step <= 6; step++) {
      await touch('touchMove', x, reading.y + reading.height - 30 - step * 15);
      await page.waitForTimeout(20);
    }
    await touch('touchEnd', x, reading.y + 30);
    await page.waitForTimeout(250);
    assert(await body.evaluate(el => el.scrollTop) > 0, 'native touch scroll moves the copy');
    await grip.tap();
    await page.waitForTimeout(350);
    assert.equal(await panel.getAttribute('data-sheet-stop'), 'compact');
    await body.evaluate(el => { el.scrollTop = 100; });
    await page.setViewportSize({ ...viewport, height: viewport.height + 30 });
    await page.waitForTimeout(350);
    assert(Math.abs(await body.evaluate(el => el.scrollTop) - 100) < 2, 'resize preserves reading position');
    for (const expanded of [false, true]) {
      if (expanded) { await grip.tap(); await page.waitForTimeout(350); }
      await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const end = await page.locator('.campus-overlay__caption').boundingBox();
      const windowBox = await body.boundingBox();
      assert(end.y >= windowBox.y && end.y + end.height <= windowBox.y + windowBox.height + 1, 'last content is reachable');
      assert(windowBox.y + windowBox.height <= viewport.height + 31, 'scroller end is on screen');
    }
    await page.screenshot({ path: `.cache/campus-sheet-${viewport.width}.png` });
    await page.evaluate(() => {
      window.overlay.hide();
      window.overlay.show({ title: 'Hola', subtitle: '' });
    });
    await page.waitForTimeout(400);
    const close = await page.locator('.campus-overlay__back').boundingBox();
    const title = await page.locator('.campus-overlay__title').boundingBox();
    assert(title.y >= close.y + close.height, 'short copy never overlaps the close control');
    await page.evaluate(() => {
      window.overlay.show(window.longCopy);
      window.overlay.revealCaption();
    });
    await page.waitForTimeout(850);
    assert(await grip.isVisible(), 'long copy restores the handle after changing service');
    console.log(`PASS ${viewport.width}x${viewport.height}: drag, native scroll, resize, full content at both stops`);
    await context.close();
  }
} finally { await browser.close(); }
