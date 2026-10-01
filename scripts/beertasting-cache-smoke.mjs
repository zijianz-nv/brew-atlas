import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// This acceptance suite never permits an external request, including images.
let playwright;
try { playwright = await import('playwright'); }
catch { playwright = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin, output = path.join(root, 'qa');
const preliminary = process.env.CACHE_LAYOUT_ONLY === '1';
const expectedImages = preliminary ? null : Number(process.env.CACHE_EXPECTED_IMAGES || 635);
const report = {startedAt: new Date().toISOString(), base, preliminary, policy: 'All external requests are blocked. Only already cached files and localhost are read. No original-site image requests or downloads are made.', baseline: {desktopVisiblePhotos: 15, source: 'qa/beertasting-demo-results.json actualPreview.visibleImages'}, checks: [], layouts: [], screenshots: [], external: [], pageErrors: [], localErrors: [], consoleErrors: []};
const localPath = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('..');
const located = b => b && Number.isFinite(b.lat) && Number.isFinite(b.lng);
const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
let browser, page, data, beers, beerById, breweryById, activeCase = 'initialize';
await mkdir(output, {recursive: true});

async function check(name, action) {
  activeCase = name; await action(); report.checks.push({name, passed: true}); console.log(`PASS ${name}`);
}
async function json(name) {const r = await fetch(`${base}/data/${name}.json`); assert(r.ok); return r.json();}
async function open(viewport, flat = false) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, reducedMotion: 'reduce'});
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      report.external.push({case: activeCase, url: url.href, type: request.resourceType()}); return route.abort('failed');
    }
    return route.continue();
  });
  const p = await context.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', e => report.pageErrors.push({case: activeCase, message: e.message}));
  p.on('console', message => {if (message.type() === 'error') report.consoleErrors.push({case: activeCase, message: message.text()});});
  p.on('response', r => {if (new URL(r.url()).origin === origin && r.status() >= 400) report.localErrors.push({url: r.url(), status: r.status()});});
  if (flat) await p.addInitScript(() => {const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) {return /webgl/i.test(type) ? null : original.call(this, type, ...args);};});
  const began = Date.now();
  await p.goto(`${base}/?collection=beertasting`, {waitUntil: 'domcontentloaded'});
  await p.getByLabel('选择数据集', {exact: true}).waitFor();
  await settle(p);
  report.layouts.push({name: `${flat ? 'flat' : 'globe'}-initial-readiness`, viewport, elapsedMs: Date.now() - began});
  return p;
}
async function settle(p = page) {
  await p.waitForFunction(() => [...document.querySelectorAll('.brew-globe-view .globe-bottle')].some(n => {const r = n.getBoundingClientRect(); return r.width && r.height && getComputedStyle(n).visibility !== 'hidden';}));
  await p.waitForTimeout(650);
  await p.waitForFunction(() => [...document.querySelectorAll('.brew-globe-view .globe-bottle')].filter(n => {const r = n.getBoundingClientRect(); return r.width && r.height && getComputedStyle(n).visibility !== 'hidden';}).every(n => {const i = n.querySelector('img'); return i?.complete && i.naturalWidth > 0 && i.naturalHeight > 0 && n.dataset.imageState === 'ready';}));
  await p.mouse.move(0, 0);
}
async function screenshot(name, p = page) {
  await p.mouse.move(0, 0);
  const file = path.join(output, `beertasting-cache-${name}.png`);
  await p.screenshot({path: file, animations: 'disabled', timeout: 15000}); report.screenshots.push(file);
}
async function fitControls(p = page) {
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal document overflow');
  const bad = await p.locator('.facet-tabs button,.dock-main input,.dock-main select,.dock-main>button').evaluateAll(nodes => nodes.filter(n => {const r = n.getBoundingClientRect(); return r.width && r.height && (r.left < -.5 || r.right > innerWidth + .5 || r.top < -.5 || r.bottom > innerHeight + .5);}).map(n => n.getAttribute('aria-label') || n.textContent));
  assert.deepEqual(bad, [], 'Main controls outside viewport');
}
async function layout(name, p = page) {
  await settle(p);
  const s = await p.evaluate(() => {
    const wrapper = document.querySelector('.brew-globe-view');
    const rect = n => {const r = n.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height};};
    const shown = n => {for (let a = n; a; a = a.parentElement) {const css = getComputedStyle(a); if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0) return false;} return true;};
    const visible = n => {const r = n.getBoundingClientRect(); return r.width >= 1 && r.height >= 1 && shown(n);};
    const markers = [...wrapper.querySelectorAll('[data-marker-id]')].filter(shown).map(n => ({id: n.dataset.markerId, memberIds: JSON.parse(n.dataset.memberIds || '[]'), beerCount: Number(n.dataset.beerCount), lat: Number(n.dataset.anchorLat), lng: Number(n.dataset.anchorLng)}));
    const photos = [...wrapper.querySelectorAll('.globe-bottle')].filter(visible).map(n => {const i = n.querySelector('img'); return {beerId: n.dataset.beerId, breweryId: n.dataset.sourceBreweryId, markerId: n.closest('[data-marker-id]')?.dataset.markerId, lat: Number(n.dataset.sourceLat), lng: Number(n.dataset.sourceLng), sourceX: Number(n.dataset.sourceScreenX), sourceY: Number(n.dataset.sourceScreenY), offsetX: Number(n.dataset.displayOffsetX), offsetY: Number(n.dataset.displayOffsetY), src: i?.getAttribute('src'), complete: i?.complete, naturalWidth: i?.naturalWidth, naturalHeight: i?.naturalHeight, imageRect: i ? rect(i) : null, rect: rect(n)};});
    const badges = [...wrapper.querySelectorAll('.globe-bottle-count')].filter(visible).map(n => ({markerId: n.closest('[data-marker-id]')?.dataset.markerId, text: n.textContent, ...rect(n)}));
    const obstacles = [...document.querySelectorAll('.map-summary,.globe-tools,.map-hint,.filter-dock,.topbar,.inspector,.brewery-tray,.compare-dock')].filter(visible).map(n => ({className: n.className, ...rect(n)}));
    return {mode: wrapper.dataset.mapMode, zoom: Number(wrapper.dataset.zoomScale || 1), viewport: [innerWidth, innerHeight], wrapper: rect(wrapper), photos, markers, badges, obstacles};
  });
  const seen = new Set(); let maximumOverlap = 0, maximumLocationError = 0;
  for (const m of s.markers) {
    assert(m.memberIds.every(id => located(breweryById.get(id))), `${name}: invalid brewery`);
    assert(m.memberIds.some(id => {const br = breweryById.get(id); return Math.abs(br.lat - m.lat) < 1e-5 && Math.abs(br.lng - m.lng) < 1e-5;}), `${name}: altered geographic anchor`);
    assert.equal(m.beerCount, beers.filter(b => m.memberIds.includes(b.breweryId)).length, `${name}: count badge differs from source records`);
  }
  for (const p of s.photos) {
    const beer = beerById.get(p.beerId), br = breweryById.get(beer?.breweryId);
    assert(beer?.imageThumbnail && br, `${name}: unrelated beer image`);
    assert.equal(p.src, beer.imageThumbnail, `${name}: map must use cached thumbnail`);
    assert.equal(p.breweryId, br.id); assert.equal(p.lat, br.lat); assert.equal(p.lng, br.lng);
    assert(!seen.has(p.beerId), `${name}: duplicate decorative beer`); seen.add(p.beerId);
    assert(p.complete && p.naturalWidth > 0 && p.naturalHeight > 0, `${name}: incomplete local image`);
    assert(p.naturalWidth <= 320 && p.naturalHeight <= 160, `${name}: thumbnail exceeds cache dimensions`);
    assert(p.rect.width >= 12 && p.rect.height >= 20, `${name}: unreadably tiny photo box`);
    assert(p.rect.left >= Math.max(0, s.wrapper.left) - 1 && p.rect.right <= Math.min(s.viewport[0], s.wrapper.right) + 1 && p.rect.top >= Math.max(0, s.wrapper.top) - 1 && p.rect.bottom <= Math.min(s.viewport[1], s.wrapper.bottom) + 1, `${name}: photo clipped at viewport/map boundary`);
    for (const o of s.obstacles) assert(intersection(p.rect, o) <= 1, `${name}: photo obscures ${o.className}`);
    const error = Math.hypot(p.rect.left + p.rect.width / 2 - s.wrapper.left - p.sourceX - p.offsetX, p.rect.top + p.rect.height / 2 - s.wrapper.top - p.sourceY - p.offsetY);
    assert(error <= 2.3, `${name}: displayed photo differs from source coordinate plus offset (${error})`); maximumLocationError = Math.max(maximumLocationError, error);
  }
  for (let i = 0; i < s.photos.length; i++) for (let j = i + 1; j < s.photos.length; j++) {
    const a = s.photos[i], b = s.photos[j], fraction = intersection(a.rect, b.rect) / Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
    maximumOverlap = Math.max(maximumOverlap, fraction);
    assert(intersection(a.rect, b.rect) <= 1, `${name}: image overlap ${(100 * fraction).toFixed(1)}%, expected no overlap beyond 1 square CSS pixel`);
  }
  for (let i = 0; i < s.badges.length; i++) {
    const b = s.badges[i];
    assert(b.left >= Math.max(0, s.wrapper.left) - 1 && b.right <= Math.min(s.viewport[0], s.wrapper.right) + 1 && b.top >= Math.max(0, s.wrapper.top) - 1 && b.bottom <= Math.min(s.viewport[1], s.wrapper.bottom) + 1, `${name}: count badge clipped`);
    for (const o of s.obstacles) assert(intersection(b, o) <= 1, `${name}: count badge obscures ${o.className}`);
    for (const p of s.photos) assert(intersection(b, p.rect) <= 1, `${name}: count badge covers a beer image`);
    for (const other of s.badges.slice(0, i)) assert(intersection(b, other) <= 1, `${name}: overlapping count badges`);
  }
  const counts = Object.fromEntries([...new Set(s.photos.map(p => p.breweryId))].map(id => [id, s.photos.filter(p => p.breweryId === id).length]));
  const row = {name, ...s, visiblePhotos: s.photos.length, maximumPerBrewery: Math.max(0, ...Object.values(counts)), byBrewery: counts, maximumOverlap, maximumLocationError};
  report.layouts.push(row); await fitControls(p); return row;
}
async function clickExposed(selector, p = page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const hit = await p.locator(selector).evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      const point = [[.5,.5],[.25,.4],[.75,.4],[.5,.2],[.5,.8]].map(([fx,fy]) => ({x: r.x + r.width * fx, y: r.y + r.height * fy})).find(({x,y}) => r.width && r.height && x > 1 && x < innerWidth - 1 && y > 1 && y < innerHeight - 1 && n.contains(document.elementFromPoint(x,y)));
      return point ? {...point, beerId: n.dataset.beerId, markerId: n.closest('[data-marker-id]')?.dataset.markerId} : null;
    }).find(Boolean));
    if (hit) {await p.mouse.click(hit.x, hit.y); return hit;} await p.waitForTimeout(150);
  }
  throw Error(`No exposed click target: ${selector}`);
}
async function closeDetails() {if (await page.locator('.inspector').count()) await page.getByLabel('关闭酒款详情', {exact: true}).click();}
async function reset() {const b = page.getByLabel('清除全部筛选', {exact: true}); if (await b.isEnabled()) await b.click();}
async function panel(name) {const b = page.getByRole('button', {name, exact: true}); if (await b.getAttribute('aria-expanded') !== 'true') await b.click();}
async function closePanel() {if (await page.getByLabel('收起筛选', {exact: true}).count()) await page.getByLabel('收起筛选', {exact: true}).click();}
async function count(n) {await page.waitForFunction(expected => Number(document.querySelector('.library-heading>span')?.textContent.match(/[\d,]+/)?.[0]?.replaceAll(',', '')) === expected, n);}
async function photoBox(selector, expectedSrc, limits = {}) {
  await page.waitForFunction(sel => {const n = document.querySelector(sel), i = n?.querySelector('img'); return n?.dataset.imageState === 'ready' && i?.complete && i.naturalWidth > 0;}, selector);
  const d = await page.locator(selector).first().evaluate(n => {const i = n.querySelector('img'), r = n.getBoundingClientRect(), ir = i.getBoundingClientRect(); return {src: i.getAttribute('src'), naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight, box: {width: r.width, height: r.height}, image: {width: ir.width, height: ir.height}, objectFit: getComputedStyle(i).objectFit};});
  if (expectedSrc) assert.equal(d.src, expectedSrc);
  assert(d.image.width >= 20 && d.image.height >= 20 && d.image.width <= d.box.width + 2 && d.image.height <= d.box.height + 2, `Cropped/oversized photo ${JSON.stringify(d)}`);
  assert.equal(d.objectFit, 'contain');
  if (limits.width) assert(d.naturalWidth <= limits.width && d.naturalHeight <= limits.height);
  report.layouts.push({name: 'photo-box', selector, ...d}); return d;
}

try {
  await check('All successful BeerTasting image variants are present in the served local build', async () => {
    data = await json('beertasting'); beers = data.beers; beerById = new Map(beers.map(b => [b.id,b])); breweryById = new Map(data.breweries.map(b => [b.id,b]));
    assert.equal(beers.length, 1000); assert.equal(beerById.size, 1000);
    const pictured = beers.filter(b => b.image);
    if (expectedImages !== null) assert.equal(pictured.length, expectedImages);
    else assert(pictured.length > 0 && pictured.length <= 635);
    const sizes = {imageThumbnail: 0, image: 0, imageOriginal: 0}, files = new Set();
    for (const b of beers) {
      if (!b.image) {assert(!b.imageThumbnail && !b.imageOriginal); continue;}
      for (const field of Object.keys(sizes)) {
        assert(localPath(b[field]), `${b.id} ${field} must be local`);
        const info = await stat(path.join(root, 'dist', b[field].slice(1))); assert(info.isFile() && info.size > 0);
        sizes[field] += info.size; files.add(b[field]);
      }
    }
    report.catalogue = {beers: beers.length, cachedImages: pictured.length, noImage: beers.length - pictured.length, breweries: data.breweries.length, localVariantFiles: files.size, bytesByVariant: sizes};
  });
  browser = await playwright.chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
  page = await open({width: 1440, height: 900}); let desktop;
  await check('Desktop cached globe shows substantially more than the previous 15-photo homepage without overlapping controls', async () => {
    desktop = await layout('desktop-home'); assert.equal(desktop.mode, 'globe');
    assert(desktop.visiblePhotos >= 24, `Expected a clear increase over 15, saw ${desktop.visiblePhotos}`);
    assert(desktop.maximumPerBrewery > 8, 'Old per-brewery 8-photo ceiling remains'); await screenshot('desktop');
  });
  await check('A bottle opens its own uncropped cached original and record source information', async () => {
    const clicked = await clickExposed('.brew-globe-view .globe-bottle'); const b = beerById.get(clicked.beerId);
    await page.locator('.inspector h2').waitFor(); assert.equal(await page.locator('.inspector h2').innerText(), b.name);
    await photoBox('.inspector-hero .beer-photo', b.imageOriginal); await layout('desktop-detail-open'); await screenshot('detail-original');
    assert(await page.locator('.source-details a').count()); await closeDetails();
  });
  await check('A brewery filter and zoom reveal more actual beers, retaining geographic origins and readable spacing', async () => {
    const target = Object.keys(desktop.byBrewery).sort((a,b) => beers.filter(x => x.breweryId === b && x.image).length - beers.filter(x => x.breweryId === a && x.image).length)[0];
    await panel('酒厂与地区'); await page.getByLabel('按酒厂筛选', {exact: true}).selectOption(target); await closePanel();
    let one = await layout('desktop-one-brewery');
    assert(one.photos.every(p => p.breweryId === target)); assert(one.visiblePhotos > desktop.byBrewery[target], 'Filtering one brewery should expose more of its catalogue');
    const zoomBefore = one.zoom; await page.getByLabel('放大地球', {exact: true}).click();
    const zoomed = await layout('desktop-one-brewery-zoomed'); assert(zoomed.zoom > zoomBefore);
    assert(zoomed.visiblePhotos >= one.visiblePhotos, 'Zooming in unexpectedly reduces visible beers');
    await screenshot('brewery-expanded');
    await clickExposed('.brew-globe-view .globe-bottle-count');
    await page.getByLabel('此酒厂的酒款', {exact: true}).waitFor();
    assert.match(await page.locator('.brewery-tray').innerText(), new RegExp(String(beers.filter(b => b.breweryId === target).length)));
    await layout('desktop-brewery-tray');
    await page.getByLabel('关闭酒厂酒款', {exact: true}).click(); await reset();
  });
  await check('Cached library cards, pagination and the old local image collection remain usable', async () => {
    await page.getByRole('button', {name: '酒库', exact: true}).click(); await count(1000);
    assert.equal(await page.locator('.beer-card').count(), 60);
    const first = beers.find(b => b.image); await page.getByLabel('搜索酒款酒厂或国家').fill(first.name);
    await photoBox('.beer-card .beer-photo', first.image, {width: 800, height: 400}); await screenshot('library');
    await reset(); await page.getByLabel('下一页', {exact: true}).click(); assert.match(await page.locator('.page-position').innerText(), /^61/);
    await panel('更多筛选'); await page.getByLabel('只看有实物图', {exact: true}).check(); await count(report.catalogue.cachedImages);
    await reset(); await closePanel();
    const off = await json('off'); await page.getByLabel('选择数据集').selectOption('off'); await count(off.beers.length);
    await photoBox('.beer-card .beer-photo'); await page.locator('.beer-card-main').first().click();
    await photoBox('.inspector-hero .beer-photo'); await screenshot('old-local-detail'); await closeDetails();
  });
  await page.context().close(); page = await open({width: 1024, height: 768});
  await check('Tablet cached globe and controls fit the intermediate viewport without obscuring beer photos', async () => {
    const s = await layout('tablet-home'); assert.equal(s.mode, 'globe'); assert(s.visiblePhotos >= 16);
    await screenshot('tablet');
  });
  await page.context().close(); page = await open({width: 390, height: 844});
  await check('Mobile globe has a larger photo spread with contained controls and a usable detail', async () => {
    const s = await layout('mobile-home'); assert.equal(s.mode, 'globe'); assert(s.visiblePhotos >= 12); assert(s.maximumPerBrewery > 4);
    await screenshot('mobile'); const clicked = await clickExposed('.brew-globe-view .globe-bottle');
    await photoBox('.inspector-hero .beer-photo', beerById.get(clicked.beerId).imageOriginal); await screenshot('mobile-detail'); await closeDetails();
  });
  await page.context().close(); page = await open({width: 1440, height: 900}, true);
  await check('No-WebGL flat fallback displays an expanded, locally decoded and correctly anchored photo layout', async () => {
    const s = await layout('flat-home'); assert.equal(s.mode, 'flat'); assert(s.visiblePhotos >= 24); assert(s.maximumPerBrewery > 8);
    await screenshot('flat'); const clicked = await clickExposed('.brew-globe-view .globe-bottle');
    await photoBox('.inspector-hero .beer-photo', beerById.get(clicked.beerId).imageOriginal); await closeDetails();
  });
  await check('First-screen, navigation and detail have zero external requests or local failures', async () => {
    assert.deepEqual(report.external, []); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.localErrors, []);
  });
  report.passed = true;
} catch (e) {
  report.passed = false; report.failure = {case: activeCase, message: e.message, stack: e.stack};
  report.checks.push({name: activeCase, passed: false, message: e.message}); console.error(e); process.exitCode = 1;
  if (page && !page.isClosed()) {try {await screenshot('failure');} catch {}}
} finally {
  await browser?.close(); report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'beertasting-cache-results.json'), JSON.stringify(report, null, 2) + '\n');
}
