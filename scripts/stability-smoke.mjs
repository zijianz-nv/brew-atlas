import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const diagnostic = process.env.STABILITY_DIAGNOSTIC === '1';
const report = { startedAt: new Date().toISOString(), base, diagnostic, policy: 'All external requests are blocked. Strict assertions cover existing beer image node reuse, no repeated loading, still-camera visibility, and real map motion. Short visibility returns during motion are diagnostic because coastline/horizon exits are legitimate. Per-rAF land-mask diagnostics can straddle render/cull callbacks; independent rendered-land geometry is separately checked by land-layout-smoke.mjs.', phases: [], external: [], errors: [], localErrors: [], checks: [] };
let browser, page;
async function begin(name) { await page.evaluate(name => window.__stability.begin(name), name); }
async function end() { const row = await page.evaluate(() => window.__stability.end()); report.phases.push(row); console.log(JSON.stringify({name:row.name,duration:row.duration,replacementNodes:row.replacementNodes,readyToLoading:row.readyToLoading,visibilityTransitions:row.visibilityTransitions,shortVisibilityReturns:row.shortVisibilityReturns,visibleNotReadySamples:row.visibleNotReadySamples,offLandSamples:row.offLandSamples,minVisible:row.minVisible,maxVisible:row.maxVisible,maxPositionChange:row.maxPositionChange})); return row; }
async function pause(ms) { await page.waitForTimeout(ms); }
async function phase(name, action) { await begin(name); await action(); return end(); }
async function screenshot(name) { const file = path.join(root, 'qa', `stability-${name}.png`); await page.screenshot({ path: file }); return file; }

try {
  await mkdir(path.join(root, 'qa'), { recursive: true });
  const response = await fetch(`${base}/data/beertasting.json`); assert(response.ok);
  const data = await response.json();
  report.data = { beers: data.beers.length, images: data.beers.filter(b => b.image).length, breweries: data.breweries.length };
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (/^https?:$/.test(u.protocol) && u.origin !== new URL(base).origin) { report.external.push(u.href); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (new URL(r.url()).origin === new URL(base).origin && r.status() >= 400) report.localErrors.push({ url: r.url(), status: r.status() }); });
  await context.addInitScript(() => {
    let serial = 0, current = null, lastFrame = 0;
    const nodeIds = new WeakMap(), known = new Map();
    const idFor = n => { if (!nodeIds.has(n)) nodeIds.set(n, ++serial); return nodeIds.get(n); };
    const shown = n => { const r = n.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let a = n; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false; } return true; };
    const log = (type, entry) => { if (current && current.events.length < 1200) current.events.push({ type, t: Math.round(performance.now() - current.start), ...entry }); };
    function inspect(n) {
      const id = n.dataset.beerId; if (!id) return;
      const token = idFor(n), img = n.querySelector('img'), state = n.dataset.imageState;
      let k = known.get(id);
      if (!k) { k = { nodes: new Set(), ready: false, lastVisible: null, hiddenAt: null, lastToken: null, lastState: null }; known.set(id, k); }
      if (!k.nodes.has(token)) {
        if (current) {
          current.newNodes++;
          if (k.nodes.size) { current.replacementNodes++; log('replacement', { id, node: token, oldNode: k.lastToken, state, wasReady: k.ready }); }
          if (k.ready && state !== 'ready') { current.readyToLoading++; log('ready-to-loading', { id, node: token, state }); }
        }
        k.nodes.add(token);
      } else if (current && token === k.lastToken && k.lastState === 'ready' && state === 'loading') {
        current.readyToLoading++; log('ready-to-loading', { id, node: token, state });
      }
      if (state === 'ready' && img?.complete && img.naturalWidth) k.ready = true;
      k.lastToken = token; k.lastState = state;
      if (current && img && !/^(\/|data:|blob:)/.test(img.getAttribute('src') || '')) current.nonLocalImageSources.add(img.getAttribute('src'));
    }
    const observer = new MutationObserver(records => {
      for (const m of records) {
        if (m.type === 'attributes') { if (m.target.matches?.('.globe-bottle')) inspect(m.target); continue; }
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches('.globe-bottle')) inspect(n);
          for (const b of n.querySelectorAll('.globe-bottle')) inspect(b);
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-image-state'] });
    function sample(now) {
      if (current && now - lastFrame >= 45) {
        lastFrame = now;
        const w = document.querySelector('.brew-globe-view'), wr = w?.getBoundingClientRect(), nodes = [...document.querySelectorAll('.brew-globe-view .globe-bottle')];
        const visible = [], frameIds = new Set();
        for (const n of nodes) {
          inspect(n);
          const id = n.dataset.beerId, k = known.get(id); frameIds.add(id);
          const isVisible = shown(n);
          if (isVisible) {
            const r = n.getBoundingClientRect(), bounds = { left: r.left - wr.left, top: r.top - wr.top, right: r.right - wr.left, bottom: r.bottom - wr.top };
            const i = n.querySelector('img'), ready = n.dataset.imageState === 'ready' && i?.complete && i.naturalWidth > 0;
            visible.push({ id, node: idFor(n), x: r.left, y: r.top, ready });
            if (!ready) current.visibleNotReadySamples++;
            if (!w._landMask?.intersectsRect(bounds)) { current.offLandSamples++; log('off-land', { id, bounds }); }
            current.seenVisible.add(id);
          }
          if (k.lastVisible !== isVisible) {
            if (current && k.lastVisible !== null) {
              current.visibilityTransitions++;
              if (!isVisible) k.hiddenAt = now;
              else if (k.hiddenAt !== null && now - k.hiddenAt <= 650) { current.shortVisibilityReturns++; log('short-return', { id, duration: Math.round(now - k.hiddenAt), node: idFor(n) }); }
            }
            k.lastVisible = isVisible;
          }
        }
        for (const [id, k] of known) if (!frameIds.has(id) && k.lastVisible) { k.lastVisible = false; k.hiddenAt = now; current.visibilityTransitions++; }
        current.samples++;
        if (!visible.length) current.emptyVisibleSamples++;
        current.minVisible = Math.min(current.minVisible, visible.length); current.maxVisible = Math.max(current.maxVisible, visible.length);
        if (!current.firstPositions) current.firstPositions = visible;
        current.lastPositions = visible;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    window.__stability = {
      begin(name) { for (const n of document.querySelectorAll('.globe-bottle')) inspect(n); for (const k of known.values()) { k.lastVisible = null; k.hiddenAt = null; } current = { name, start: performance.now(), newNodes: 0, replacementNodes: 0, readyToLoading: 0, visibleNotReadySamples: 0, visibilityTransitions: 0, shortVisibilityReturns: 0, offLandSamples: 0, samples: 0, emptyVisibleSamples: 0, minVisible: Infinity, maxVisible: 0, seenVisible: new Set(), nonLocalImageSources: new Set(), events: [] }; },
      end() { const r = current; current = null; const before = new Map((r.firstPositions || []).map(p => [p.id, p])); const moves = (r.lastPositions || []).filter(p => before.has(p.id)).map(p => Math.hypot(p.x - before.get(p.id).x, p.y - before.get(p.id).y)); return { ...r, duration: Math.round(performance.now() - r.start), start: undefined, seenVisible: [...r.seenVisible], nonLocalImageSources: [...r.nonLocalImageSources], maxPositionChange: Math.max(0, ...moves) }; }
    };
  });
  await page.goto(`${base}/?collection=beertasting`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask && [...document.querySelectorAll('.globe-bottle')].some(n => n.dataset.imageState === 'ready'));
  await pause(1800);
  report.build = await page.locator('script[type="module"]').getAttribute('src');
  report.initialImageNodes = await page.locator('.globe-bottle').count();
  console.log(JSON.stringify({build:report.build,initialImageNodes:report.initialImageNodes,data:report.data}));
  await phase('stationary', () => pause(4000));
  await phase('automatic-rotation', async () => { await page.getByLabel('切换自动旋转', { exact: true }).click(); await pause(5500); });
  await page.getByLabel('切换自动旋转', { exact: true }).click(); await pause(1800);
  await phase('dragging', async () => {
    const p = await page.evaluate(() => { const w = document.querySelector('.brew-globe-view'), r = w.getBoundingClientRect(); for (const [fx, fy] of [[.55,.72],[.7,.63],[.38,.72]]) { const x = r.left+r.width*fx, y = r.top+r.height*fy, n = document.elementFromPoint(x,y); if (w.contains(n) && !n.closest('button')) return {x,y}; } return null; });
    assert(p); await page.mouse.move(p.x,p.y); await page.mouse.down();
    for (let i=1;i<=25;i++) { await page.mouse.move(p.x+i*4,p.y-i*.6); await pause(45); }
    await page.mouse.up(); await pause(1800);
  });
  await phase('zooming', async () => { await page.getByLabel('放大地球', { exact: true }).click(); await pause(3200); });
  await phase('stationary-after-interaction', () => pause(3000));
  report.screenshot = await screenshot(diagnostic ? 'baseline' : 'final');
  if (!diagnostic) {
    for (const device of [{name:'mobile',width:390,height:844},{name:'flat',width:1440,height:900,flat:true}]) {
      await page.close(); page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('response', r => { if (new URL(r.url()).origin === new URL(base).origin && r.status() >= 400) report.localErrors.push({url:r.url(),status:r.status()}); });
      await page.setViewportSize({width:device.width,height:device.height});
      if (device.flat) await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type,...args) { return /webgl/i.test(type) ? null : original.call(this,type,...args); }; });
      await page.goto(`${base}/?collection=beertasting`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask && [...document.querySelectorAll('.globe-bottle')].some(n => n.dataset.imageState === 'ready'));
      await pause(1800);
      await phase(`${device.name}-stationary`, () => pause(2500));
      await phase(`${device.name}-zooming`, async () => { await page.getByLabel('放大地球',{exact:true}).click(); await pause(2200); });
      await phase(`${device.name}-stationary-after-zoom`, () => pause(1500));
      (report.additionalScreenshots ||= []).push(await screenshot(device.name));
    }
  }
  assert.equal(report.external.length, 0); assert.equal(report.errors.length, 0); assert.equal(report.localErrors.length, 0);
  for (const p of report.phases) {
    assert.equal(p.nonLocalImageSources.length, 0);
    if (!diagnostic) {
      assert.equal(p.replacementNodes, 0, `${p.name}: existing beer image nodes rebuilt`);
      assert.equal(p.readyToLoading, 0, `${p.name}: previously ready images loaded again`);
      if (p.name.includes('stationary')) { assert.equal(p.visibilityTransitions, 0, `${p.name}: visibility changed with a still camera`); assert.equal(p.visibleNotReadySamples, 0); }
    }
  }
  assert(report.phases.find(p => p.name === 'automatic-rotation').maxPositionChange > 1, 'Automatic rotation did not actually move the map');
  assert(report.phases.find(p => p.name === 'dragging').maxPositionChange > 5, 'Dragging did not actually move the map');
  report.passed = true;
} catch (e) { report.passed = false; report.failure = { message: e.message, stack: e.stack }; console.error(e); process.exitCode = 1; }
finally { await browser?.close(); report.browserClosed = true; report.finishedAt = new Date().toISOString(); await writeFile(path.join(root, 'qa', diagnostic ? 'stability-baseline.json' : 'stability-results.json'), JSON.stringify(report, null, 2)+'\n'); }
