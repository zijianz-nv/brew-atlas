import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDescribedPhoto } from '../src/beer-photo-eligibility.mjs';
import { createBeerPhotoIdentityIndex } from '../src/beer-photo-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qa');
const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173', origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
const before = process.env.COASTAL_BEFORE === '1';
const edgeOnly = process.env.COASTAL_EDGE_ONLY === '1';
const diagnostic = process.env.COASTAL_DIAGNOSTIC === '1';
const devices = (process.env.COASTAL_DEVICES || 'desktop,mobile,flat').split(',');
const fixtureNames = (process.env.COASTAL_FIXTURES || 'ellon,masterGao,newZealand,japan').split(',');
const tag = process.env.COASTAL_TAG || ''; assert(!tag || /^[a-z0-9-]+$/.test(tag));
const suffix = (before ? 'before' : 'after') + (edgeOnly ? '-edge' : '') + (diagnostic ? '-diagnostic' : '') + (tag ? `-${tag}` : '');
const report = { startedAt: new Date().toISOString(), base, baseline: before, diagnostic, build: null, complete: false,
  policy: 'Isolated real Chrome, ordinary country/brewery filters and zoom controls; external requests blocked. Before and after use the same real source coordinates. Every settled rectangle must intersect land and avoid controls/other images. Visible anchors may not move; an image hidden for at least 700ms may reenter at a new safe location. Counts need not increase at every zoom, but specified coastal empty states must gain real images after the fix.',
  checks: [], states: [], phases: [], screenshots: [], external: [], errors: [], localErrors: [], findings: [],
};
let browser, page, active = 'initialize', beers, beerMap, breweryMap, identities;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
function km(a, b) {
  const rad = Math.PI / 180, dlat = (a.lat - b.lat) * rad, dlng = (a.lng - b.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function check(condition, message, { fill = false } = {}) {
  if (condition) return;
  if (before || diagnostic) { report.findings.push({ state: active, kind: fill ? 'missing-photo' : 'geometry-or-continuity', message }); return; }
  throw new Error(message);
}
async function settle(ms = 2300) {
  await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask && document.querySelector('.brew-globe-view')?._projectGeo);
  await page.waitForTimeout(ms);
}
async function capture(name) {
  await page.mouse.move(0, 0);
  const file = path.join(out, `coastal-fill-${suffix}-${name}.png`);
  await page.screenshot({ path: file }); report.screenshots.push(file);
}
async function state(name, brewery, { requirePhotos = false, screenshot = false } = {}) {
  active = name;
  await page.waitForFunction(() => [...document.querySelectorAll('.globe-bottle')]
    .filter(node => node.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .every(node => { const image = node.querySelector('img'); return node.dataset.imageState === 'ready' && image?.complete && image.naturalWidth > 0; }), null, { timeout: 4000 }).catch(() => {});
  const row = await page.evaluate(({ lat, lng }) => {
    const wrapper = document.querySelector('.brew-globe-view'), wr = wrapper.getBoundingClientRect(), mask = wrapper._landMask;
    const shown = node => node.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left - wr.left, right: r.right - wr.left, top: r.top - wr.top, bottom: r.bottom - wr.top, width: r.width, height: r.height }; };
    const all = [...wrapper.querySelectorAll('.globe-bottle')];
    const source = wrapper._projectGeo(lat, lng);
    return { mode: wrapper.dataset.mapMode, zoom: Number(wrapper.dataset.zoomScale), layoutRevision: wrapper.dataset.layoutRevision,
      wrapper: { width: wr.width, height: wr.height }, source, sourceCoordinates: { lat, lng },
      geographicSourceLand: typeof mask.geographicContains === 'function' ? mask.geographicContains(lng, lat) : null,
      sourceLand: mask.containsRect({ left: source.x - .5, right: source.x + .5, top: source.y - .5, bottom: source.y + .5 }),
      sourceInViewport: source.x >= 0 && source.y >= 0 && source.x <= wr.width && source.y <= wr.height,
      allPhotos: all.map(node => ({ id: node.dataset.beerId, identity: node.dataset.photoIdentity })),
      photos: all.filter(shown).map(node => {
        const r = rect(node), image = node.querySelector('img');
        return { id: node.dataset.beerId, breweryId: node.dataset.sourceBreweryId, rect: r,
          sourceLat: Number(node.dataset.sourceLat), sourceLng: Number(node.dataset.sourceLng),
          lat: Number(node.dataset.displayLat), lng: Number(node.dataset.displayLng), photoScale: Number(node.dataset.photoScale || 1),
          land: mask.intersectsRect(r), src: image?.getAttribute('src'), ready: node.dataset.imageState === 'ready' && image?.complete && image.naturalWidth > 0 };
      }),
      markers: [...wrapper.querySelectorAll('[data-marker-id]')].map(node => ({ id: node.dataset.markerId, available: node._marker?.availablePhotoCount,
        assigned: node._marker?.photos.length, hidden: node._marker?.hiddenPhotoCount, visible: node._visible, layoutVisible: node._layoutVisible })),
      forbidden: wrapper.querySelectorAll('.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor').length,
      controls: [...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')]
        .filter(shown).map(node => ({ name: node.className, ...rect(node) })),
    };
  }, brewery);
  const source = { lat: brewery.lat, lng: brewery.lng };
  row.photos.forEach(photo => { photo.offsetKm = km(source, photo); });
  const summary = { name, breweryId: brewery.id, brewery: brewery.name, country: brewery.country, ...row, visiblePhotos: row.photos.length,
    heights: [...new Set(row.photos.map(photo => photo.rect.height))], maxOffsetKm: Math.max(0, ...row.photos.map(photo => photo.offsetKm)) };
  report.states.push(summary);
  console.log(JSON.stringify({ name, zoom: row.zoom, visible: row.photos.length, sourceLand: row.sourceLand, heights: summary.heights, maxOffsetKm: summary.maxOffsetKm }));
  check(!row.forbidden, `${name}: numbers/site dots returned`);
  const seen = new Set();
  for (const photo of row.allPhotos) {
    const beer = beerMap.get(photo.id);
    check(beer && hasDescribedPhoto(beer), `${name}: ineligible image`);
    check(photo.identity === identities.identityFor(beer) && !identities.isGeneric(beer), `${name}: default generic/incorrect photo identity`);
    check(!seen.has(photo.identity), `${name}: repeated default photo identity`); seen.add(photo.identity);
  }
  for (const photo of row.photos) {
    const beer = beerMap.get(photo.id);
    check(photo.breweryId === brewery.id && beer.breweryId === brewery.id, `${name}: image moved from another brewery`);
    check(photo.sourceLat === source.lat && photo.sourceLng === source.lng, `${name}: source coordinates changed`);
    check(photo.land, `${name}: image rectangle enters water`);
    check(photo.offsetKm <= 300.1, `${name}: photo moved too far from its real source (${photo.offsetKm}km)`);
    check(photo.src === (beer.imageThumbnail || beer.image) && photo.src.startsWith('/'), `${name}: incorrect/nonlocal image`);
    check(photo.ready, `${name}: visible image not decoded`);
    check(photo.rect.left >= -.5 && photo.rect.top >= -.5 && photo.rect.right <= row.wrapper.width + .5 && photo.rect.bottom <= row.wrapper.height + .5, `${name}: photo outside viewport`);
    for (const control of row.controls) check(overlap(photo.rect, control) <= 1, `${name}: image covers ${control.name}`);
  }
  for (let i = 0; i < row.photos.length; i++) for (let j = 0; j < i; j++) check(overlap(row.photos[i].rect, row.photos[j].rect) <= 1, `${name}: images overlap`);
  if (screenshot) await capture(name);
  if (requirePhotos) check(row.photos.length > 0, `${name}: source still has no visible image`, { fill: true });
  return summary;
}
async function choose(brewery) {
  // Complete reset before changing filters: flat focus intentionally preserves
  // its current zoom, so racing a previous zoom/reset gives a different case.
  await page.getByLabel('重置地球视角', { exact: true }).click(); await settle();
  await page.getByRole('button', { name: '酒厂与地区', exact: true }).click();
  await page.getByLabel('按国家或地区筛选', { exact: true }).selectOption(brewery.country);
  await page.getByLabel('按酒厂筛选', { exact: true }).selectOption(brewery.id);
  await page.getByRole('button', { name: '收起筛选', exact: true }).click(); await settle();
}
async function zoom(direction) {
  await page.getByLabel(direction > 0 ? '放大地球' : '缩小地球', { exact: true }).click();
  await page.mouse.move(0, 0); await settle();
}
async function begin(name) { await page.evaluate(name => window.__coastal.start(name), name); }
async function end() {
  const phase = await page.evaluate(() => window.__coastal.stop()); report.phases.push(phase);
  check(phase.replacements.length === 0, `${phase.name}: photo/button nodes rebuilt`);
  check(phase.visibleGeoChanges.length === 0, `${phase.name}: continuously visible photo changed geography`);
  check(phase.sustainedProjectionErrors.length === 0, `${phase.name}: sustained displacement from the geographic anchor`);
  report.checks.push({ name: phase.name, passed: true });
}
async function viewportEdge(brewery) {
  const original = await state('flat-viewport-edge-before', brewery, { screenshot: true });
  const w = original.wrapper.width, h = original.wrapper.height, s = original.source;
  const options = [{ dx: 0, dy: -2 - s.y }, { dx: w + 2 - s.x, dy: 0 }, { dx: -2 - s.x, dy: 0 }, { dx: 0, dy: h + 2 - s.y }];
  let plan;
  for (const move of options) {
    const target = original.photos.find(photo => {
      const r = { left: photo.rect.left + move.dx, right: photo.rect.right + move.dx, top: photo.rect.top + move.dy, bottom: photo.rect.bottom + move.dy };
      return r.left >= 8 && r.right <= w - 8 && r.top >= 8 && r.bottom <= h - 8 && original.controls.every(control => overlap(r, control) <= 1);
    });
    if (target) { plan = { ...move, id: target.id }; break; }
  }
  check(!!plan, 'flat viewport edge: no real image can remain on screen while its source leaves', { fill: true });
  if (!plan) return;
  const start = await page.evaluate(({ dx, dy }) => {
    const wrapper = document.querySelector('.brew-globe-view'), r = wrapper.getBoundingClientRect();
    const loX = Math.max(16, 16 - dx), hiX = Math.min(r.width - 16, r.width - 16 - dx);
    const loY = Math.max(16, 16 - dy), hiY = Math.min(r.height - 16, r.height - 16 - dy);
    for (const fx of [.75, .5, .25]) for (const fy of [.75, .5, .25]) {
      const x = r.left + loX + (hiX - loX) * fx, y = r.top + loY + (hiY - loY) * fy;
      const node = document.elementFromPoint(x, y);
      if (node && wrapper.contains(node) && !node.closest('button,.filter-dock,.map-summary,.globe-tools')) return { x, y };
    }
    return null;
  }, plan);
  assert(start, 'No valid background position for a normal map drag');
  await begin('flat-source-outside-viewport');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let step = 1; step <= 24; step++) {
    await page.mouse.move(start.x + plan.dx * step / 24, start.y + plan.dy * step / 24); await page.waitForTimeout(15);
  }
  await page.mouse.up(); await page.mouse.move(0, 0); await settle();
  const result = await state('flat-viewport-edge-after', brewery, { screenshot: true });
  report.viewportEdge = { plan, beforeSource: original.source, afterSource: result.source, afterSourceInViewport: result.sourceInViewport,
    expectedBeerId: plan.id, retained: result.photos.some(photo => photo.id === plan.id) };
  check(!result.sourceInViewport, 'Real drag did not move source outside the viewport');
  check(report.viewportEdge.retained, 'An image with a valid projected rectangle vanished with its offscreen source', { fill: true });
  await end();
}

try {
  await mkdir(out, { recursive: true });
  const parts = await Promise.all(['beertasting', 'world', 'off', 'archive', 'openbeer'].map(async key => {
    const response = await fetch(`${base}/data/${key}.json`); assert(response.ok); return response.json();
  }));
  beers = parts.flatMap(part => part.beers); beerMap = new Map(beers.map(beer => [beer.id, beer]));
  breweryMap = new Map(parts.flatMap(part => part.breweries).map(brewery => [brewery.id, brewery]));
  identities = createBeerPhotoIdentityIndex(beers);
  const fixtures = { ellon: breweryMap.get('brewdog-ellon'), masterGao: [...breweryMap.values()].find(b => /Master Gao/.test(b.name)),
    newZealand: [...breweryMap.values()].find(b => b.name === '8 Wired Brewing Co.'), japan: [...breweryMap.values()].find(b => b.name === 'Baird Beer') };
  assert(Object.values(fixtures).every(Boolean));
  report.fixtures = fixtures;
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const config of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'flat', width: 1440, height: 900, flat: true }]) {
    if (!devices.includes(config.name) || edgeOnly && !config.flat) continue;
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1,
      isMobile: config.width < 500, hasTouch: config.width < 500, reducedMotion: 'no-preference' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.external.push(url.href); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(() => {
      let recording = null, serial = 0; const nodes = new WeakMap();
      const token = node => { if (!nodes.has(node)) nodes.set(node, ++serial); return nodes.get(node); };
      function sample(now) {
        if (recording) {
          const wrapper = document.querySelector('.brew-globe-view'), wr = wrapper?.getBoundingClientRect(), ids = new Set();
          for (const node of wrapper?.querySelectorAll('.globe-bottle') || []) {
            if (!node.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
            const id = node.dataset.beerId, lat = Number(node.dataset.displayLat), lng = Number(node.dataset.displayLng), r = node.getBoundingClientRect(); ids.add(id);
            const actual = { x: (r.left + r.right) / 2 - wr.left, y: (r.top + r.bottom) / 2 - wr.top };
            const old = recording.known.get(id), value = { lat, lng, node: token(node), image: token(node.querySelector('img')), actual, lastSeen: now, height: r.height };
            if (old) {
              const hiddenDuration = old.hiddenSince === undefined ? 0 : now - old.hiddenSince;
              if (old.node !== value.node || old.image !== value.image) recording.replacements.push({ id, t: now - recording.start });
              if (Math.abs(old.lat - lat) > 1e-6 || Math.abs(old.lng - lng) > 1e-6) {
                const event = { id, t: now - recording.start, hiddenDuration, from: [old.lat, old.lng], to: [lat, lng] };
                (hiddenDuration >= 700 ? recording.hiddenReentries : recording.visibleGeoChanges).push(event);
              }
              const expected = wrapper._projectGeo(lat, lng), error = Math.hypot(actual.x - expected.x, actual.y - expected.y);
              const lag = old.expected && now - old.lastSeen < 120 ? Math.hypot(actual.x - old.expected.x, actual.y - old.expected.y) : error;
              const residual = Math.min(error, lag); value.expected = expected;
              value.badRun = residual > 2.5 ? (old.badRun || 0) + 1 : 0;
              if (value.badRun === 3) recording.sustainedProjectionErrors.push({ id, residual, t: now - recording.start });
              recording.maxProjectionResidual = Math.max(recording.maxProjectionResidual, residual);
              recording.maximumHeightStep = Math.max(recording.maximumHeightStep, Math.abs(value.height - old.height));
            } else value.expected = wrapper._projectGeo(lat, lng);
            recording.known.set(id, value);
          }
          for (const [id, value] of recording.known) if (!ids.has(id) && value.hiddenSince === undefined) value.hiddenSince = now;
          recording.frameCount++;
          recording.samples.push({ t: now - recording.start, zoom: Number(wrapper?.dataset.zoomScale), visible: ids.size, ids: [...ids] });
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      window.__coastal = { start(name) { recording = { name, start: performance.now(), known: new Map(), frameCount: 0, maxProjectionResidual: 0,
        maximumHeightStep: 0, replacements: [], visibleGeoChanges: [], hiddenReentries: [], sustainedProjectionErrors: [], samples: [] }; },
      stop() { const result = recording; recording = null; return { ...result, duration: performance.now() - result.start, start: undefined, known: undefined }; } };
    });
    if (config.flat) await context.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : original.call(this, type, ...args); }; });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ state: active, message: error.message }));
    page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) report.localErrors.push({ url: response.url(), status: response.status() }); });
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await settle();
    const build = await page.locator('script[type=module]').getAttribute('src');
    if (process.env.EXPECTED_BUILD) assert(build.includes(process.env.EXPECTED_BUILD), `Unexpected build ${build}`);
    if (report.build) assert.equal(build, report.build); else report.build = build;
    const homeZoom = await page.locator('.brew-globe-view').evaluate(wrapper => Number(wrapper.dataset.zoomScale));
    if (edgeOnly || fixtureNames.includes('ellon')) await choose(fixtures.ellon);
    if (edgeOnly) {
      for (let i = 0; i < 3; i++) await zoom(1);
      await viewportEdge(fixtures.ellon); await context.close(); continue;
    }
    if (fixtureNames.includes('ellon')) {
    await begin(`${config.name}-ellon-zoom-sequence`);
    await state(`${config.name}-ellon-focused`, fixtures.ellon, { requirePhotos: true, screenshot: true });
    for (let i = 1; i <= 6; i++) {
      await zoom(1);
      await state(`${config.name}-ellon-zoom-${i}`, fixtures.ellon, { requirePhotos: true, screenshot: [2, 4, 6].includes(i) });
    }
    for (let i = 1; i <= 3; i++) { await zoom(-1); await state(`${config.name}-ellon-return-${i}`, fixtures.ellon, { requirePhotos: true, screenshot: i === 3 }); }
    await end();
    if (config.flat) await viewportEdge(fixtures.ellon);
    }

    if (fixtureNames.includes('masterGao')) {
    await choose(fixtures.masterGao);
    let currentZoom = await page.locator('.brew-globe-view').evaluate(wrapper => Number(wrapper.dataset.zoomScale));
    for (let i = 0; i < 10 && currentZoom > homeZoom * 1.1; i++) {
      await zoom(-1); currentZoom = await page.locator('.brew-globe-view').evaluate(wrapper => Number(wrapper.dataset.zoomScale));
    }
    await begin(`${config.name}-master-gao-return`);
    await state(`${config.name}-master-gao-far`, fixtures.masterGao, { requirePhotos: true, screenshot: true });
    for (let i = 0; i < 3; i++) await zoom(1);
    await state(`${config.name}-master-gao-near`, fixtures.masterGao, { requirePhotos: true });
    for (let i = 0; i < 3; i++) await zoom(-1);
    await state(`${config.name}-master-gao-returned`, fixtures.masterGao, { requirePhotos: true, screenshot: true }); await end();
    }

    for (const key of ['newZealand', 'japan']) {
      if (!fixtureNames.includes(key)) continue;
      const brewery = fixtures[key]; await choose(brewery); await begin(`${config.name}-${key}-island`);
      await state(`${config.name}-${key}-focused`, brewery, { screenshot: true });
      for (let i = 0; i < 2; i++) await zoom(1);
      await state(`${config.name}-${key}-near`, brewery, { requirePhotos: true, screenshot: true });
      for (let i = 0; i < 2; i++) await zoom(-1);
      await state(`${config.name}-${key}-returned`, brewery); await end();
    }
    await context.close();
    report.progress = { lastCompletedDevice: config.name, states: report.states.length, phases: report.phases.length, updatedAt: new Date().toISOString() };
    await writeFile(path.join(out, `coastal-fill-${suffix}-results.json`), JSON.stringify(report, null, 2) + '\n');
  }
  assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.localErrors, []);
  report.passed = before || report.findings.length === 0;
} catch (error) {
  report.passed = false; report.failure = { state: active, message: error.message, stack: error.stack };
  console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) await capture('failure').catch(() => {});
} finally {
  await browser?.close(); report.browserClosed = true; report.complete = true; report.finishedAt = new Date().toISOString();
  await mkdir(out, { recursive: true });
  if (!before) {
    try {
      const baseline = JSON.parse(await readFile(path.join(out, 'coastal-fill-before-results.json'), 'utf8'));
      const edgeBaseline = await readFile(path.join(out, 'coastal-fill-before-edge-results.json'), 'utf8').then(JSON.parse).catch(() => null);
      report.comparison = report.states.map(state => {
        const old = baseline.states.find(item => item.name === state.name) || edgeBaseline?.states.find(item => item.name === state.name);
        const source = old?.sourceCoordinates || Object.values(baseline.fixtures || {}).find(item => item.id === old?.breweryId);
        return { name: state.name, before: old?.visiblePhotos ?? null,
          after: state.visiblePhotos, beforeZoom: old?.zoom ?? null, afterZoom: state.zoom,
          sameZoom: old ? Math.abs(old.zoom - state.zoom) < 1e-6 : null,
          sourceUnchanged: source ? old.breweryId === state.breweryId && source.lat === state.sourceCoordinates.lat && source.lng === state.sourceCoordinates.lng : null };
      });
    } catch {}
  }
  await writeFile(path.join(out, `coastal-fill-${suffix}-results.json`), JSON.stringify(report, null, 2) + '\n');
}
