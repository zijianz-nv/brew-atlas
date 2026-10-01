import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDescribedPhoto, beerIntroduction } from '../src/beer-photo-eligibility.mjs';
import { createBeerPhotoIdentityIndex } from '../src/beer-photo-identity.mjs';
import { photoDimensions } from '../src/marker-layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
const diagnostic = process.env.CONTINUITY_DIAGNOSTIC === '1';
const devices = (process.env.CONTINUITY_DEVICES || 'desktop,mobile,flat').split(',');
const onlySearch = process.env.CONTINUITY_ONLY_SEARCH === '1';
assert(devices.length && devices.every(name => ['desktop', 'mobile', 'flat'].includes(name)));
const report = { startedAt: new Date().toISOString(), base, diagnostic, build: null,
  policy: 'Isolated real Chrome, real UI input, external requests blocked. Every animation frame records beer/button/image identity, position, size and fixed display coordinates. Existing display coordinates are reprojected using the actual current camera to separate camera motion from relocation. One render-frame projection lag is allowed; sustained displacement and settled displacement are not. A photo fully absent for at least 700ms may reenter at a new safe position, recorded separately; continuously visible photos may not change geography. Sizes are compared with the actual zoom rather than assuming a fixed frame rate. No app state or source data is injected.',
  checks: [], states: [], phases: [], screenshots: [], errors: [], localErrors: [], external: [], localMapResources: [], limitations: [],
};
let browser, page, active = 'initialize', beerMap, breweryMap, identities;
let photoMetrics = { compact: false, photoZoomBase: 1 };
const frames = [];
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
function verify(condition, message) {
  if (condition) return;
  if (diagnostic) { (report.diagnostics ||= []).push({ case: active, message }); return; }
  assert(condition, message);
}
async function check(name, action) {
  active = name;
  const before = report.diagnostics?.length || 0;
  await action();
  const passed = (report.diagnostics?.length || 0) === before;
  report.checks.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'DIAGNOSTIC FAILURE'} ${name}`);
}
async function settle(ms = 2300) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.brew-globe-view');
    return node?._landMask && typeof node._projectGeo === 'function';
  });
  await page.waitForTimeout(ms);
}
async function screenshot(name) {
  await page.mouse.move(0, 0);
  const file = path.join(output, `continuity-${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function snapshot(name, { duplicates = false, requirePhotos = true } = {}) {
  await page.waitForFunction(() => [...document.querySelectorAll('.globe-bottle')]
    .filter(node => node.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .every(node => { const image = node.querySelector('img'); return node.dataset.imageState === 'ready' && image?.complete && image.naturalWidth > 0; }), null, { timeout: 5000 }).catch(() => {});
  const state = await page.evaluate(() => {
    const wrapper = document.querySelector('.brew-globe-view'), wr = wrapper.getBoundingClientRect();
    const shown = node => node.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const bounds = node => {
      const r = node.getBoundingClientRect();
      return { left: r.left - wr.left, right: r.right - wr.left, top: r.top - wr.top, bottom: r.bottom - wr.top, width: r.width, height: r.height };
    };
    const all = [...wrapper.querySelectorAll('.globe-bottle')];
    const photos = all.filter(shown).map(node => {
      const r = bounds(node), img = node.querySelector('img');
      const lat = Number(node.dataset.displayLat), lng = Number(node.dataset.displayLng);
      return { id: node.dataset.beerId, identity: node.dataset.photoIdentity, breweryId: node.dataset.sourceBreweryId,
        lat, lng, sourceLat: Number(node.dataset.sourceLat), sourceLng: Number(node.dataset.sourceLng), rect: r,
        projection: wrapper._projectGeo(lat, lng), land: wrapper._landMask.intersectsRect(r),
        src: img?.getAttribute('src'), ready: node.dataset.imageState === 'ready' && img?.complete && img.naturalWidth > 0,
        clickable: node.contains(document.elementFromPoint(wr.left + (r.left + r.right) / 2, wr.top + (r.top + r.bottom) / 2)),
      };
    });
    return { mode: wrapper.dataset.mapMode, zoom: Number(wrapper.dataset.zoomScale), layoutRevision: wrapper.dataset.layoutRevision,
      wrapper: { left: wr.left, top: wr.top, width: wr.width, height: wr.height }, photos,
      allPhotos: all.map(node => ({ id: node.dataset.beerId, identity: node.dataset.photoIdentity })),
      markers: [...wrapper.querySelectorAll('[data-marker-id]')].map(node => {
        const marker = node._marker, source = marker && wrapper._projectGeo(marker.lat, marker.lng);
        return { id: node.dataset.markerId, available: marker?.availablePhotoCount, hidden: marker?.hiddenPhotoCount,
          markerPhotoCount: marker?.photos?.length, display: node.style.display, visible: node._visible, layoutVisible: node._layoutVisible,
          lat: marker?.lat, lng: marker?.lng, source, sourceLand: source && wrapper._landMask.containsRect({ left: source.x - .5, right: source.x + .5, top: source.y - .5, bottom: source.y + .5 }),
          photos: marker?.photos?.slice(0, 8).map(photo => ({ id: photo.beer.id, displayLat: photo.displayLat, displayLng: photo.displayLng, sourceX: photo.sourceX, sourceY: photo.sourceY })) };
      }),
      forbidden: wrapper.querySelectorAll('.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor').length,
      controls: [...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')]
        .filter(shown).map(node => ({ name: node.className, ...bounds(node) })),
    };
  });
  report.states.push({ name, ...state });
  if (requirePhotos) verify(state.photos.length > 0, `${name}: no visible described photos`);
  verify(state.forbidden === 0, `${name}: numerical/site/anchor marker returned`);
  const byIdentity = new Map();
  for (const photo of state.allPhotos) {
    const beer = beerMap.get(photo.id);
    verify(!!beer && hasDescribedPhoto(beer), `${name}: ineligible beer image ${photo.id}`);
    verify(photo.identity === identities.identityFor(beer), `${name}: photo identity differs from data index: ${photo.id}`);
    if (!duplicates) verify(!identities.isGeneric(beer), `${name}: generic shared photograph appears without a search`);
    if (byIdentity.has(photo.identity) && !duplicates) verify(false, `${name}: repeated photo identity ${photo.identity}`);
    byIdentity.set(photo.identity, photo.id);
  }
  for (const photo of state.photos) {
    const beer = beerMap.get(photo.id), brewery = breweryMap.get(beer?.breweryId);
    verify(photo.ready, `${name}: image not decoded ${photo.id}`);
    verify(photo.src === (beer?.imageThumbnail || beer?.image) && photo.src?.startsWith('/'), `${name}: nonlocal or incorrect image ${photo.id}`);
    verify(photo.breweryId === beer?.breweryId && photo.sourceLat === brewery?.lat && photo.sourceLng === brewery?.lng, `${name}: source geography changed ${photo.id}`);
    verify(Number.isFinite(photo.lat) && Number.isFinite(photo.lng), `${name}: missing display geography`);
    verify(photo.land, `${name}: image rectangle no longer intersects land ${photo.id}`);
    verify(photo.rect.left >= -.5 && photo.rect.top >= -.5 && photo.rect.right <= state.wrapper.width + .5 && photo.rect.bottom <= state.wrapper.height + .5, `${name}: image leaves viewport`);
    for (const control of state.controls) verify(area(photo.rect, control) <= 1, `${name}: image overlaps ${control.name}`);
  }
  for (let i = 0; i < state.photos.length; i++) for (let j = 0; j < i; j++)
    verify(area(state.photos[i].rect, state.photos[j].rect) <= 1, `${name}: images overlap`);
  return state;
}
async function selectBrewery(brewery) {
  await page.getByRole('button', { name: '酒厂与地区', exact: true }).click();
  await page.getByLabel('按国家或地区筛选', { exact: true }).selectOption(brewery.country);
  await page.getByLabel('按酒厂筛选', { exact: true }).selectOption(brewery.id);
  await page.getByRole('button', { name: '收起筛选', exact: true }).click();
  await settle();
}
async function clickBeer(id) {
  const button = page.locator(`.globe-bottle[data-beer-id="${id}"]`);
  // Opening a detail deliberately focuses its brewery again. After closing the
  // first detail, use normal zoom controls to expose the second coastal bottle.
  for (let tries = 0; tries < 7 && !await button.isVisible(); tries++) {
    await page.getByLabel('放大地球', { exact: true }).click(); await settle();
  }
  await button.click();
  await page.locator('.inspector h2').waitFor();
  const beer = beerMap.get(id);
  assert.equal((await page.locator('.inspector h2').innerText()).trim(), beer.name.trim());
  assert.equal((await page.locator('.tasting-note').innerText()).replace(/\s+/g, ' ').trim(), beerIntroduction(beer).replace(/\s+/g, ' ').trim());
  await page.getByLabel('关闭酒款详情', { exact: true }).click();
  await settle();
}
async function capturePhase(name, action) {
  await page.evaluate(name => window.__continuity.start(name), name);
  await action();
  const phase = await page.evaluate(() => window.__continuity.stop());
  frames.push(phase);
  const errors = [], sizeErrors = [], sizeJumps = [], geoChanges = [], reentries = [], replacements = [], sustainedErrors = [], settledErrors = [];
  const known = new Map(), previous = new Map(), badRuns = new Map();
  const first = phase.frames[0], last = phase.frames.at(-1);
  for (const frame of phase.frames) for (const photo of frame.photos) {
    const old = previous.get(photo.id), initial = known.get(photo.id);
    if (!initial) known.set(photo.id, photo);
    else {
      if (initial.node !== photo.node || initial.imageNode !== photo.imageNode) replacements.push({ id: photo.id, t: frame.t });
      if (old && (Math.abs(old.lat - photo.lat) > 1e-6 || Math.abs(old.lng - photo.lng) > 1e-6)) {
        const event = { id: photo.id, t: frame.t, before: [old.lat, old.lng], after: [photo.lat, photo.lng], hiddenDuration: photo.hiddenDuration };
        if (photo.reanchored && photo.hiddenDuration >= 700) reentries.push(event);
        else geoChanges.push(event);
      }
    }
    if (photo.expected && Number.isFinite(photo.expected.x) && Number.isFinite(photo.expected.y)) {
      const error = Math.hypot(photo.x - photo.expected.x, photo.y - photo.expected.y);
      const lagError = old?.expected ? Math.hypot(photo.x - old.expected.x, photo.y - old.expected.y) : error;
      const best = old && frame.t - old.t < 120 ? Math.min(error, lagError) : error;
      errors.push(best);
      const run = best > 2.5 ? (badRuns.get(photo.id) || 0) + 1 : 0;
      badRuns.set(photo.id, run);
      if (run === 3) sustainedErrors.push({ id: photo.id, t: frame.t, error: best });
      if (frame.t > phase.duration - 650 && best > 2.5) settledErrors.push({ id: photo.id, t: frame.t, error: best });
    }
    const expectedHeight = photoDimensions({ ...photoMetrics, zoom: frame.zoom }).photoHeight;
    const currentSizeError = Math.abs(photo.height - expectedHeight);
    const sizeError = old && frame.t - old.t < 120 ? Math.min(currentSizeError, Math.abs(photo.height - old.expectedHeight)) : currentSizeError;
    sizeErrors.push(sizeError);
    if (sizeError > 1.5) sizeJumps.push({ id: photo.id, t: frame.t, height: photo.height, expectedHeight, oldExpectedHeight: old?.expectedHeight, sizeError });
    previous.set(photo.id, { ...photo, t: frame.t, expectedHeight });
  }
  const firstIds = new Set(first?.photos.map(photo => photo.id)), lastIds = new Set(last?.photos.map(photo => photo.id));
  const summary = { name, duration: phase.duration, frameCount: phase.frames.length,
    before: firstIds.size, after: lastIds.size, newlyVisible: [...lastIds].filter(id => !firstIds.has(id)),
    hidden: [...firstIds].filter(id => !lastIds.has(id)), retained: [...firstIds].filter(id => lastIds.has(id)),
    maximumProjectionResidual: Math.max(0, ...errors), p95ProjectionResidual: percentile(errors, .95),
    maximumSizeResidual: Math.max(0, ...sizeErrors), p95SizeResidual: percentile(sizeErrors, .95),
    replacements: replacements.slice(0, 20), geoChanges: geoChanges.slice(0, 20), sizeJumps: sizeJumps.slice(0, 20),
    hiddenReentries: reentries,
    sustainedErrors: sustainedErrors.slice(0, 20), settledErrors: settledErrors.slice(0, 20), forbidden: phase.forbidden,
  };
  report.phases.push(summary);
  console.log(JSON.stringify({ name, frames: summary.frameCount, before: summary.before, after: summary.after,
    added: summary.newlyVisible.length, hidden: summary.hidden.length, retained: summary.retained.length,
    p95ProjectionResidual: summary.p95ProjectionResidual, p95SizeResidual: summary.p95SizeResidual,
    replacements: replacements.length, geoChanges: geoChanges.length, hiddenReentries: reentries.length,
    sizeJumps: sizeJumps.length, sustainedErrors: sustainedErrors.length, settledErrors: settledErrors.length }));
  verify(summary.frameCount > 12, `${name}: insufficient animation frames`);
  verify(summary.forbidden === 0, `${name}: numerical markers appeared during motion`);
  verify(replacements.length === 0, `${name}: existing button/image nodes were recreated`);
  verify(geoChanges.length === 0, `${name}: existing photos changed display geography`);
  verify(sizeJumps.length === 0, `${name}: photo size changed discontinuously`);
  verify(sustainedErrors.length === 0, `${name}: sustained jump relative to fixed geographic projection`);
  verify(settledErrors.length === 0, `${name}: photos shift away from their projected positions on settlement`);
  return summary;
}

try {
  await mkdir(output, { recursive: true });
  if (process.env.CONTINUITY_RESUME) {
    const resumedFile = path.resolve(root, process.env.CONTINUITY_RESUME);
    const previous = JSON.parse(await readFile(resumedFile, 'utf8'));
    assert.equal(previous.base, base);
    assert(previous.browserClosed && !previous.diagnostic && !previous.errors.length && !previous.external.length && !previous.localErrors.length);
    const preserved = name => onlySearch
      ? name !== 'Local resources and clean browser execution' && !devices.some(device => name.startsWith(`${device}: search`) || name.startsWith(`${device}-duplicate-`))
      : ['desktop', 'mobile', 'flat'].some(device => !devices.includes(device) && name.startsWith(`${device}${name.includes(':') ? ':' : '-'}`));
    report.build = previous.build;
    report.checks.push(...previous.checks.filter(check => preserved(check.name)));
    assert(report.checks.every(check => check.passed), 'Cannot resume a device whose previous checks failed');
    report.states.push(...previous.states.filter(state => preserved(state.name)));
    report.phases.push(...previous.phases.filter(phase => preserved(phase.name)));
    report.screenshots.push(...previous.screenshots.filter(file => onlySearch
      ? !path.basename(file).includes('failure') && !devices.some(device => path.basename(file).startsWith(`continuity-${device}-duplicate-`))
      : ['desktop', 'mobile', 'flat'].some(device => !devices.includes(device) && path.basename(file).startsWith(`continuity-${device}-`))));
    report.limitations.push(...previous.limitations);
    report.localMapResources.push(...previous.localMapResources);
    const previousFrames = JSON.parse(await readFile(resumedFile.replace(/results/, 'frames'), 'utf8'));
    frames.push(...previousFrames.filter(phase => preserved(phase.name)));
    report.resumedFrom = { file: path.relative(root, resumedFile), build: previous.build, preservedDevices: ['desktop', 'mobile', 'flat'].filter(device => !devices.includes(device)), previousFinishedAt: previous.finishedAt,
      scope: onlySearch ? 'remaining-search-checks' : 'remaining-devices',
      reason: 'Continue only remaining checks on the unchanged build; previous successful checks and original per-frame evidence are preserved.' };
  }
  const parts = await Promise.all(['beertasting', 'off', 'world', 'archive', 'openbeer'].map(async name => {
    const response = await fetch(`${base}/data/${name}.json`); assert(response.ok); return response.json();
  }));
  const beers = parts.flatMap(part => part.beers);
  beerMap = new Map(beers.map(beer => [beer.id, beer]));
  breweryMap = new Map(parts.flatMap(part => part.breweries).map(brewery => [brewery.id, brewery]));
  identities = createBeerPhotoIdentityIndex(beers);
  const eligible = beers.filter(hasDescribedPhoto), identityGroups = new Map();
  for (const beer of eligible) { const identity = identities.identityFor(beer); if (!identityGroups.has(identity)) identityGroups.set(identity, []); identityGroups.get(identity).push(beer); }
  const duplicateGroups = [...identityGroups.entries()].filter(([, members]) => members.length > 1);
  const sameBreweryDuplicate = duplicateGroups.flatMap(([identity, members]) => [...new Set(members.map(beer => beer.breweryId))]
    .map(breweryId => ({ identity, brewery: breweryMap.get(breweryId), beers: members.filter(beer => beer.breweryId === breweryId) })))
    .filter(group => group.beers.length >= 2 && group.brewery && Number.isFinite(group.brewery.lat) && Number.isFinite(group.brewery.lng))
    .sort((a, b) => Number(identities.isGeneric(a.beers[0])) - Number(identities.isGeneric(b.beers[0]))
      || (/Toit/.test(b.brewery.name) ? 1 : 0) - (/Toit/.test(a.brewery.name) ? 1 : 0) || b.beers.length - a.beers.length)[0];
  if (sameBreweryDuplicate) {
    const common = sameBreweryDuplicate.beers[0].name.split(/\s+/).filter(word => word.length >= 4
      && sameBreweryDuplicate.beers.every(beer => beer.name.toLowerCase().includes(word.toLowerCase()))).sort((a, b) => b.length - a.length);
    sameBreweryDuplicate.query = common[0] || sameBreweryDuplicate.brewery.name;
  }
  const dense = [...breweryMap.values()].map(brewery => ({ brewery, count: eligible.filter(beer => beer.breweryId === brewery.id).length }))
    .filter(item => Number.isFinite(item.brewery.lat) && Number.isFinite(item.brewery.lng)).sort((a, b) => b.count - a.count)[0];
  assert(dense?.count > 15, 'A real dense brewery is needed to test progressive additions');
  report.data = { records: beers.length, eligible: eligible.length, uniquePhotoIdentities: identityGroups.size,
    duplicateGroups: duplicateGroups.map(([identity, members]) => ({ identity, ids: members.map(beer => beer.id) })) };
  report.fixtures = { dense: { id: dense.brewery.id, name: dense.brewery.name, count: dense.count },
    duplicate: sameBreweryDuplicate && { breweryId: sameBreweryDuplicate.brewery.id, brewery: sameBreweryDuplicate.brewery.name, identity: sameBreweryDuplicate.identity, query: sameBreweryDuplicate.query, ids: sameBreweryDuplicate.beers.map(beer => beer.id) } };
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const config of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'flat', width: 1440, height: 900, flat: true }]) {
    if (!devices.includes(config.name)) continue;
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1,
      isMobile: config.width < 500, hasTouch: config.width < 500, reducedMotion: 'no-preference' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.external.push(url.href); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(() => {
      let serial = 0, recording = null;
      const nodeIds = new WeakMap();
      const idFor = node => { if (!node) return null; if (!nodeIds.has(node)) nodeIds.set(node, ++serial); return nodeIds.get(node); };
      function sample(now) {
        if (recording) {
          const wrapper = document.querySelector('.brew-globe-view'), wr = wrapper?.getBoundingClientRect();
          const photos = [], visibleIds = new Set();
          for (const node of wrapper?.querySelectorAll('.globe-bottle') || []) {
            if (!node.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
            const r = node.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const id = node.dataset.beerId, lat = Number(node.dataset.displayLat), lng = Number(node.dataset.displayLng);
            visibleIds.add(id);
            const hiddenSince = recording.hiddenSince.get(id);
            const hiddenDuration = hiddenSince === undefined ? 0 : now - hiddenSince;
            const oldLocation = recording.locations.get(id);
            const reanchored = !!oldLocation && hiddenDuration >= 700
              && (Math.abs(oldLocation.lat - lat) > 1e-6 || Math.abs(oldLocation.lng - lng) > 1e-6);
            if (reanchored) recording.locations.set(id, { lat, lng });
            recording.hiddenSince.delete(id);
            if (!recording.locations.has(id)) recording.locations.set(id, { lat, lng });
            const original = recording.locations.get(id), expected = wrapper._projectGeo?.(original.lat, original.lng);
            photos.push({ id, node: idFor(node), imageNode: idFor(node.querySelector('img')),
              x: (r.left + r.right) / 2 - wr.left, y: (r.top + r.bottom) / 2 - wr.top, width: r.width, height: r.height,
              lat, lng, expected: expected && { x: expected.x, y: expected.y, visible: expected.visible },
              identity: node.dataset.photoIdentity, ready: node.dataset.imageState === 'ready', reanchored, hiddenDuration });
          }
          for (const id of recording.locations.keys()) if (!visibleIds.has(id) && !recording.hiddenSince.has(id)) recording.hiddenSince.set(id, now);
          const forbidden = wrapper?.querySelectorAll('.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor').length || 0;
          recording.forbidden += forbidden;
          recording.frames.push({ t: now - recording.start, zoom: Number(wrapper?.dataset.zoomScale), revision: wrapper?.dataset.layoutRevision, photos });
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      window.__continuity = {
        start(name) { recording = { name, start: performance.now(), locations: new Map(), hiddenSince: new Map(), frames: [], forbidden: 0 }; },
        stop() { const result = recording; recording = null; return { name: result.name, duration: performance.now() - result.start, frames: result.frames, forbidden: result.forbidden }; },
      };
    });
    if (config.flat) await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : original.call(this, type, ...args); };
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ case: active, message: error.message }));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === origin && response.status() >= 400) report.localErrors.push({ url: url.href, status: response.status() });
      if (url.origin === origin && /(?:earth|world|land|countries|texture)/i.test(url.pathname)) report.localMapResources.push(url.pathname);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await settle();
    const build = await page.locator('script[type=module]').getAttribute('src');
    if (process.env.EXPECTED_BUILD) assert(build.includes(process.env.EXPECTED_BUILD), `Unexpected bundle: ${build}`);
    if (report.build) assert.equal(build, report.build, 'Build changed during test'); else report.build = build;
    if (!onlySearch) {
    await check(`${config.name}: default photographs are unique, local, on land and unobstructed`, async () => {
      const state = await snapshot(`${config.name}-home`);
      photoMetrics = { compact: config.width < 600, photoZoomBase: config.flat ? 1 : state.zoom };
      assert.equal(state.mode, config.flat ? 'flat' : 'globe');
      await screenshot(`${config.name}-home`);
    });
    await check(`${config.name}: overview zoom follows existing anchors and fills new spaces`, async () => {
      const additions = [];
      for (let i = 1; i <= 2; i++) {
        const phase = await capturePhase(`${config.name}-overview-zoom-${i}`, async () => {
          await page.waitForTimeout(120);
          await page.getByLabel('放大地球', { exact: true }).click();
          await page.mouse.move(0, 0); await page.waitForTimeout(2700);
        });
        verify(phase.retained.length > 0, `${config.name}: no existing photograph remained available to measure continuity`);
        additions.push(...phase.newlyVisible);
        await snapshot(`${config.name}-overview-zoom-${i}`);
      }
      verify(new Set(additions).size > 0, `${config.name}: overview zoom never revealed another photograph`);
      await screenshot(`${config.name}-overview-expanded`);
    });
    await page.getByLabel('重置地球视角', { exact: true }).click();
    await settle();
    await selectBrewery(dense.brewery);
    await check(`${config.name}: zoom preserves geographic placement and adds new photographs`, async () => {
      const before = await snapshot(`${config.name}-dense-base`, { requirePhotos: false });
      const additions = [];
      // Narrow coastal land can require additional zoom before a bottle
      // rectangle fits; keep the zero-photo states in the report as evidence.
      for (let i = 1; i <= 6; i++) {
        const result = await capturePhase(`${config.name}-zoom-in-${i}`, async () => {
          await page.waitForTimeout(120);
          await page.getByLabel('放大地球', { exact: true }).click();
          await page.mouse.move(0, 0);
          await page.waitForTimeout(2700);
        });
        additions.push(...result.newlyVisible);
        await snapshot(`${config.name}-zoom-in-${i}`, { requirePhotos: false });
      }
      const after = await snapshot(`${config.name}-dense-expanded`, { requirePhotos: false });
      verify(after.zoom > before.zoom, `${config.name}: zoom button did not change the camera`);
      verify(new Set(additions).size > 0, `${config.name}: no additional photos became visible during zoom`);
      if (!after.photos.length) report.limitations.push(`${config.name}: the coastal brewery produced new photos at an intermediate zoom, but none remained at zoom ${after.zoom}; fixed source coordinates and land-intersection constraints take priority at extreme magnification. All intermediate counts, projections and empty final states are retained in this report.`);
      await screenshot(`${config.name}-expanded`);
      await capturePhase(`${config.name}-zoom-out`, async () => {
        await page.waitForTimeout(120);
        await page.getByLabel('缩小地球', { exact: true }).click();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(2700);
      });
      await snapshot(`${config.name}-zoom-out`, { requirePhotos: false });
    });
    }
    if (sameBreweryDuplicate) await check(`${config.name}: search restores separate beers sharing one image`, async () => {
      await page.getByLabel('选择数据集', { exact: true }).selectOption('pictured');
      await page.getByLabel('重置地球视角', { exact: true }).click();
      await settle();
      await selectBrewery(sameBreweryDuplicate.brewery);
      const defaultState = await snapshot(`${config.name}-duplicate-default`, { requirePhotos: false });
      verify(defaultState.allPhotos.filter(photo => photo.identity === sameBreweryDuplicate.identity).length <= 1, 'Default brewery view repeats a photo');
      if (sameBreweryDuplicate.beers.every(beer => identities.isGeneric(beer)))
        verify(defaultState.allPhotos.every(photo => photo.identity !== sameBreweryDuplicate.identity), 'Default view exposes a reviewed generic image');
      await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill(sameBreweryDuplicate.query);
      await settle();
      let searchState = await snapshot(`${config.name}-duplicate-search`, { duplicates: true, requirePhotos: false });
      for (let tries = 0; tries < 6 && searchState.photos.filter(photo => photo.identity === sameBreweryDuplicate.identity && photo.clickable).length < 2; tries++) {
        await page.getByLabel('放大地球', { exact: true }).click(); await settle();
        searchState = await snapshot(`${config.name}-duplicate-search-zoom-${tries}`, { duplicates: true, requirePhotos: false });
      }
      const restored = searchState.photos.filter(photo => photo.identity === sameBreweryDuplicate.identity && photo.clickable);
      verify(restored.length >= 2, 'Searching did not restore two separate beers sharing an image');
      for (const photo of restored.slice(0, 2)) await clickBeer(photo.id);
      await screenshot(`${config.name}-duplicate-search`);
      await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill('');
      await settle();
      await snapshot(`${config.name}-duplicate-search-cleared`, { requirePhotos: false });
    });
    else report.limitations.push(`${config.name}: no eligible same-brewery duplicate photograph group exists in this data snapshot; actual duplicate-search click behavior could not be exercised.`);
    await context.close();
  }
  await check('Local resources and clean browser execution', async () => {
    assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.localErrors, []);
    assert(report.localMapResources.length > 0);
  });
  report.passed = !report.diagnostics?.length;
} catch (error) {
  report.passed = false;
  report.checks.push({ name: active, passed: false, message: error.message });
  report.failure = { case: active, message: error.message, stack: error.stack };
  console.error(error);
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close(); report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  report.localMapResources = [...new Set(report.localMapResources)];
  await mkdir(output, { recursive: true });
  const suffix = diagnostic ? '-diagnostic' : '';
  await writeFile(path.join(output, `continuity-frames${suffix}.json`), JSON.stringify(frames) + '\n');
  await writeFile(path.join(output, `continuity-results${suffix}.json`), JSON.stringify(report, null, 2) + '\n');
}
