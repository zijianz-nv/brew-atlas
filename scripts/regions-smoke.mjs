import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173', origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Only inspect the local demo');
const output = path.join(root, 'qa');
const report = { startedAt: new Date().toISOString(), base,
  policy: 'Isolated Chrome, external network blocked. Fixtures are actual newly collected source IDs; filters, search, zoom and selection use real UI. No injected data, app state, coordinates or camera. City reference locations, not production-site claims. Selected regional checks are not an audit of every image.',
  checks: [], layouts: [], regions: [], screenshots: [], external: [], pageErrors: [], localErrors: [] };
let browser, page, data, byBeer, byBrewery, sourceById, activeCase = 'initialize';
const areaOverlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const countrySpecs = [
  ['GE', /Black Lion/i], ['NZ', /Renaissance/i], ['CN', /Master Gao/i], ['IN', /Toit/i],
  ['BW', /Okavango/i], ['TZ', /Kilimanjaro/i], ['GH', /Tale African/i], ['MA', /Brasseries du Maroc/i],
];

async function check(name, fn) {
  activeCase = name;
  try { await fn(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) {
    report.checks.push({ name, passed: false, message: error.message, stack: error.stack }); console.error(`FAIL ${name}: ${error.message}`);
    if (page && !page.isClosed()) await capture(`failure-${report.checks.length}`).catch(() => {});
  }
}
async function capture(name) {
  const file = path.join(output, `regions-${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled' }); report.screenshots.push(file);
}
async function settle() {
  if (await page.locator('.brew-globe-view').count()) await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask);
  await page.waitForTimeout(2300); // Allow real camera transitions and 700 ms coastal reveal hysteresis.
}
async function panel() {
  const button = page.getByRole('button', { name: '酒厂与地区', exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}
async function closePanel() {
  const button = page.getByRole('button', { name: '收起筛选', exact: true });
  if (await button.count()) await button.click();
}
async function cleanup() {
  for (const label of ['关闭酒款详情', '关闭酒厂酒款']) {
    const button = page.getByLabel(label, { exact: true }); if (await button.count()) await button.click();
  }
  await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill('');
  await panel();
  const reset = page.getByRole('button', { name: '清除全部筛选', exact: true });
  if (await reset.isEnabled()) await reset.click();
  await closePanel();
}
async function selectBrewery(brewery, { search = false } = {}) {
  await panel();
  await page.getByLabel('按国家或地区筛选', { exact: true }).selectOption(brewery.country);
  await page.getByLabel('按酒厂筛选', { exact: true }).selectOption(brewery.id);
  await closePanel();
  if (search) await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill(brewery.name.trim());
  await settle();
}
async function mapState() {
  return page.evaluate(() => {
    const shown = node => {
      const r = node.getBoundingClientRect(); if (!r.width || !r.height) return false;
      for (let p = node; p; p = p.parentElement) {
        const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const rect = n => { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const wrapper = document.querySelector('.brew-globe-view'), wr = rect(wrapper), mask = wrapper._landMask;
    const all = [...wrapper.querySelectorAll('.globe-bottle')];
    const photos = all.filter(shown).map(node => {
      const r = rect(node), img = node.querySelector('img'), ir = img ? rect(img) : null;
      const localRect = { left: r.left - wr.left, right: r.right - wr.left, top: r.top - wr.top, bottom: r.bottom - wr.top };
      return { beerId: node.dataset.beerId, breweryId: node.dataset.sourceBreweryId, ...r,
        land: Boolean(mask?.intersectsRect(localRect)), src: img?.getAttribute('src'),
        ready: node.dataset.imageState === 'ready' && Boolean(img?.complete && img.naturalWidth > 0),
        naturalWidth: img?.naturalWidth, naturalHeight: img?.naturalHeight,
        objectFit: img && getComputedStyle(img).objectFit, imageRect: ir,
        clickable: node.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)) };
    });
    const obstacles = [...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')].filter(shown).map(node => ({ className: node.className, ...rect(node) }));
    const markers = [...wrapper.querySelectorAll('[data-marker-id]')].map(node => ({
      markerId: node.dataset.markerId, beerCount: Number(node.dataset.beerCount),
      memberIds: node._marker?.members?.map(m => m.id) || [],
      sites: [...node.querySelectorAll('.globe-site-dot,.globe-bottle-count')].filter(shown).map(button => ({ ...rect(button), text: button.textContent }))
    }));
    return { mode: wrapper.dataset.mapMode, zoomScale: Number(wrapper.dataset.zoomScale), wrapper: wr, viewport: { width: innerWidth, height: innerHeight }, photos,
      allBeerIds: all.map(n => n.dataset.beerId), markers, obstacles,
      summaryCount: Number(document.querySelector('.map-summary p strong')?.textContent.replace(/[,，]/g, '')) };
  });
}
async function geometry(name, { country, breweryId, requirePhoto = false } = {}) {
  const state = await mapState(); report.layouts.push({ name, ...state });
  assert.equal(state.mode, 'globe');
  assert.equal(new Set(state.allBeerIds).size, state.allBeerIds.length, 'Duplicate connected beer buttons');
  for (const id of state.allBeerIds) {
    const beer = byBeer.get(id); assert(beer, `Unrecognized map beer ${id}`);
    if (country) assert.equal(byBrewery.get(beer.breweryId).countryCode, country, 'Stale country image remained after filtering');
    if (breweryId) assert.equal(beer.breweryId, breweryId, 'Stale brewery image remained after filtering');
  }
  if (requirePhoto) assert(state.photos.length > 0, 'No visible local beer photo after bounded UI zoom');
  for (const p of state.photos) {
    const beer = byBeer.get(p.beerId);
    assert.equal(p.breweryId, beer.breweryId, 'Map photo source brewery identity differs');
    assert(p.land, `Photo rectangle does not intersect land mask: ${p.beerId}`);
    assert(p.left >= state.wrapper.left - .5 && p.right <= state.wrapper.right + .5 && p.top >= state.wrapper.top - .5 && p.bottom <= state.wrapper.bottom + .5, 'Photo left map viewport');
    assert(p.left >= -.5 && p.right <= state.viewport.width + .5 && p.top >= -.5 && p.bottom <= state.viewport.height + .5, 'Photo left screen');
    assert(p.ready, `Local thumbnail not decoded: ${p.beerId}`);
    assert.equal(p.src, beer.imageThumbnail || beer.image);
    assert(p.src.startsWith('/images/beertasting/'), 'Thumbnail uses remote image');
    assert.equal(p.objectFit, 'contain', 'Photo does not preserve the entire image');
    assert(p.imageRect.width <= p.width + 1 && p.imageRect.height <= p.height + 1, 'Image element extends outside photo');
    for (const obstacle of state.obstacles) assert(areaOverlap(p, obstacle) <= 1, `Photo overlaps ${obstacle.className}`);
  }
  for (let i = 0; i < state.photos.length; i++) for (let j = i + 1; j < state.photos.length; j++) assert(areaOverlap(state.photos[i], state.photos[j]) <= 1, 'Two photo rectangles overlap');
  return state;
}
async function detail(beer) {
  const raw = sourceById.get(beer.sourceRecord.id); assert(raw, 'Clicked beer was not in the new regional source records');
  await page.locator('.inspector h2').waitFor();
  assert.equal((await page.locator('.inspector h2').innerText()).trim(), beer.name.trim(), 'Detail selected a different source beer');
  const sourceHref = await page.locator('.inspector .source-details a').first().getAttribute('href');
  assert.equal(sourceHref, raw.url, 'Detail source URL differs from actual source ID record');
  assert(beer.sourceIds.includes(raw.id)); assert.equal(beer.id, `beertasting-${raw.id}`);
  assert.equal(beer.rating, raw.rating); assert.equal(beer.ratingsCount, raw.ratings_count);
  let ratingText = null;
  if (Number.isFinite(raw.rating) && raw.rating >= 0 && raw.rating <= 5 && Number.isInteger(raw.ratings_count) && raw.ratings_count > 0) {
    ratingText = await page.locator('.inspector .beer-rating').innerText(); assert(ratingText.includes(raw.rating.toFixed(2)));
    const count = ratingText.match(/([\d,，]+)\s*条评价/); assert(count);
    assert.equal(Number(count[1].replace(/[,，]/g, '')), raw.ratings_count);
  } else assert.equal(await page.locator('.inspector .beer-rating').count(), 0, 'Missing source rating was invented');
  let photo = null;
  if (beer.image) {
    await page.waitForFunction(() => { const n = document.querySelector('.inspector-hero .beer-photo img'); return n?.complete && n.naturalWidth > 0; });
    photo = await page.locator('.inspector-hero .beer-photo img').evaluate(img => {
      const r = img.getBoundingClientRect(), p = img.closest('.beer-photo').getBoundingClientRect();
      return { src: img.getAttribute('src'), objectFit: getComputedStyle(img).objectFit,
        width: r.width, height: r.height, parentWidth: p.width, parentHeight: p.height,
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    });
    assert.equal(photo.src, beer.imageOriginal || beer.image); assert(photo.src.startsWith('/images/beertasting/'));
    assert.equal(photo.objectFit, 'contain'); assert(photo.width <= photo.parentWidth + 1 && photo.height <= photo.parentHeight + 1, 'Original photo overflows wrapper');
  }
  return { beerId: beer.id, sourceId: raw.id, sourceUrl: sourceHref, name: beer.name, rating: beer.rating, ratingsCount: beer.ratingsCount, ratingText, photo };
}
async function runRegion(device, fixture) {
  const { country, brewery } = fixture;
  await cleanup(); await panel();
  await page.getByLabel('按国家或地区筛选', { exact: true }).selectOption(brewery.country);
  await closePanel(); await settle();
  const countryState = await geometry(`${device}-${country}-country`, { country });
  const countryTotal = data.beers.filter(b => byBrewery.get(b.breweryId).countryCode === country).length;
  assert.equal(countryState.summaryCount, countryTotal, 'Country filter count differs');
  await selectBrewery(brewery, { search: true });
  const breweryTotal = data.beers.filter(b => b.breweryId === brewery.id).length;
  let state, zoomClicks = 0; const zoomSteps = [];
  do {
    await page.getByLabel('放大地球', { exact: true }).click(); zoomClicks++; await settle(); state = await mapState();
    zoomSteps.push({ click: zoomClicks, zoomScale: state.zoomScale, visiblePhotos: state.photos.length });
  } while (!state.photos.some(p => p.ready && p.clickable) && zoomClicks < 8);
  state = await geometry(`${device}-${country}-brewery-zoom`, { country, breweryId: brewery.id, requirePhoto: true });
  assert.equal(state.summaryCount, breweryTotal, 'Brewery/search count differs');
  if (['CN', 'NZ', 'BW', 'TZ', 'GH', 'MA'].includes(country)) await capture(`${device}-${country}`);
  const clicked = state.photos.find(p => p.clickable && sourceById.has(byBeer.get(p.beerId).sourceRecord.id)); assert(clicked, 'No clickable new regional beer photo');
  await page.mouse.click((clicked.left + clicked.right) / 2, (clicked.top + clicked.bottom) / 2);
  const detailResult = await detail(byBeer.get(clicked.beerId));
  await settle(); await geometry(`${device}-${country}-detail`, { country, breweryId: brewery.id });
  report.regions.push({ device, country, countryTotal, brewery: brewery.name, breweryId: brewery.id, breweryTotal, zoomClicks, zoomSteps, visiblePhotos: state.photos.length, detail: detailResult });
}
async function noImagePune(device) {
  const brewery = data.breweries.find(b => /Great State Aleworks/i.test(b.name)); assert(brewery, 'Actual Pune fixture missing');
  const beers = data.beers.filter(b => b.breweryId === brewery.id); assert(beers.length > 0); assert(beers.every(b => !b.image && sourceById.has(b.sourceRecord.id)));
  await cleanup(); await selectBrewery(brewery);
  const state = await geometry(`${device}-Pune-no-image`, { country: 'IN', breweryId: brewery.id });
  assert.equal(state.summaryCount, beers.length); assert.equal(state.photos.length, 0);
  const marker = state.markers.find(m => m.memberIds.includes(brewery.id)); assert(marker); assert.equal(marker.beerCount, beers.length); assert(marker.sites.length > 0, 'No-image brewery lost map count button');
  await page.getByRole('button', { name: '酒库', exact: true }).click(); await selectBrewery(brewery);
  const heading = await page.locator('.library-heading span').innerText(); assert.equal(Number(heading.replace(/[^\d]/g, '')), beers.length);
  const cardNames = await page.locator('.beer-card h3').allTextContents();
  assert.deepEqual(cardNames.map(n => n.trim()).sort(), beers.map(b => b.name.trim()).sort(), 'No-image beers disappeared from the library');
  await page.getByRole('button', { name: `查看 ${beers[0].name}`, exact: true }).click();
  const detailResult = await detail(beers[0]);
  report.regions.push({ device, country: 'IN', specialCase: 'No candidate images: retain source rows, map count and library', brewery: brewery.name, count: beers.length, detail: detailResult });
}

try {
  await mkdir(output, { recursive: true });
  const sources = JSON.parse(await readFile(path.join(root, 'research/beertasting-regions-2026-09-18/beers.json'), 'utf8'));
  sourceById = new Map(sources.records.map(b => [b.id, b]));
  const response = await fetch(`${base}/data/beertasting.json`); assert(response.ok); data = await response.json();
  byBeer = new Map(data.beers.map(b => [b.id, b])); byBrewery = new Map(data.breweries.map(b => [b.id, b]));
  report.data = { beers: data.beers.length, images: data.beers.filter(b => b.image).length, breweries: data.breweries.length, regionalSourceIds: sourceById.size, regionalBatch: sources.batch };
  // Fail early if the server still serves the old build. Do not silently test old data.
  for (const id of sourceById.keys()) assert(byBeer.has(`beertasting-${id}`), `Build does not yet contain new source ID ${id}`);
  const fixtures = countrySpecs.map(([country, preferred]) => {
    const breweries = data.breweries.filter(br => br.countryCode === country && data.beers.some(b => b.breweryId === br.id && b.image && sourceById.has(b.sourceRecord.id)));
    const brewery = breweries.find(b => preferred.test(b.name)) || breweries[0]; assert(brewery, `No new cached-image brewery for ${country}`); return { country, brewery };
  });
  report.fixtures = fixtures.map(f => ({ country: f.country, brewery: f.brewery.name, breweryId: f.brewery.id }));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const device of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, deviceScaleFactor: 1, isMobile: device.name === 'mobile', hasTouch: device.name === 'mobile', reducedMotion: 'reduce' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (['http:', 'https:'].includes(u.protocol) && u.origin !== origin) { report.external.push({ case: activeCase, url: u.href }); return route.abort(); } return route.continue(); });
    page = await context.newPage(); page.setDefaultTimeout(18000);
    page.on('pageerror', e => report.pageErrors.push({ case: activeCase, message: e.message }));
    page.on('response', r => { if (new URL(r.url()).origin === origin && r.status() >= 400) report.localErrors.push({ case: activeCase, url: r.url(), status: r.status() }); });
    await page.goto(`${base}/?collection=beertasting`, { waitUntil: 'domcontentloaded' }); await page.getByLabel('选择数据集', { exact: true }).waitFor(); await settle();
    report.build = await page.locator('script[type="module"]').getAttribute('src');
    for (const fixture of fixtures) await check(`${device.name}: ${fixture.country} real country/brewery/search/zoom/detail`, () => runRegion(device.name, fixture));
    await check(`${device.name}: Pune with no candidate images retains count, library and exact source detail`, () => noImagePune(device.name));
    await context.close();
  }
  await check('No external image requests, failed local assets or uncaught browser errors', async () => { assert.deepEqual(report.external, []); assert.deepEqual(report.localErrors, []); assert.deepEqual(report.pageErrors, []); });
  report.passed = report.checks.every(c => c.passed);
} catch (error) { report.passed = false; report.failure = { case: activeCase, message: error.message, stack: error.stack }; console.error(error); }
finally {
  await browser?.close(); report.browserClosed = true; report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'regions-results.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.passed) process.exitCode = 1;
}
