import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {classifyBeer} from '../src/beer-taxonomy.mjs';

// Functional checks intercept every external request. A final separate desktop
// context may send at most 15 image GETs and waits 25 seconds, without extrapolating.
let playwright;
try { playwright = await import('playwright'); }
catch { playwright = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
const results = [], measurements = [], errors = [], consoleErrors = [], localFailures = [], blockedExternal = [], screenshots = [];
const located = b => b && Number.isFinite(b.lat) && Number.isFinite(b.lng) && Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180;
const report = {startedAt: new Date().toISOString(), base, policy: 'Functional tests intercept every external request. Final desktop-only actual-image preview permits at most 15 image GETs for 25 seconds. Purposeful viewport observation, not an availability estimate for 635 links. No remote image files saved.', results, measurements, screenshots};
const skipRealPreview = process.env.BEERTASTING_SKIP_REAL === '1';
if (skipRealPreview) {
  const prior = JSON.parse(await readFile(path.join(output, 'beertasting-demo-results.json'), 'utf8'));
  report.actualPreview = prior.actualPreview;
  report.actualPreviewPreservedFrom = prior.finishedAt;
  report.policy += ' This regression rerun reuses the earlier bounded actual preview; no new remote GET is permitted.';
  screenshots.push(...(prior.screenshots || []).filter(file => file.endsWith('-desktop-real.png')));
}
await mkdir(output, {recursive: true});
let browser, page, activeCase = 'initialize', source, beers, breweryById, beerById, taxonomy, heldRelease;

async function check(name, fn) {
  activeCase = name;
  await fn();
  results.push({name, passed: true});
  console.log(`PASS ${name}`);
}
async function readData(name) {
  const response = await fetch(`${base}/data/${name}.json`);
  assert(response.ok, `Local data/${name}.json HTTP ${response.status}`);
  return response.json();
}
async function openPage(viewport, query, holdImage) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, reducedMotion: 'reduce'});
  let release;
  const held = new Promise(resolve => { release = resolve; });
  if (holdImage) heldRelease = release;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      blockedExternal.push({url: url.href, type: request.resourceType(), held: url.href === holdImage});
      if (url.href === holdImage) await held;
      try { await route.abort('failed'); } catch {}
      return;
    }
    await route.continue();
  });
  const p = await context.newPage();
  p.setDefaultTimeout(15000);
  p.on('pageerror', error => errors.push({case: activeCase, message: error.message}));
  p.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({case: activeCase, message: message.text(), url: message.location().url});
  });
  p.on('response', response => {
    if (response.url().startsWith(`${origin}/`) && response.status() >= 400) localFailures.push({url: response.url(), status: response.status()});
  });
  await p.goto(`${base}/${query}`, {waitUntil: 'domcontentloaded'});
  await p.getByLabel('选择数据集', {exact: true}).waitFor();
  return p;
}
async function screenshot(name, p = page) {
  await p.mouse.move(0, 0);
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 500))]));
  const file = path.join(output, `beertasting-demo-${name}.png`);
  await p.screenshot({path: file, animations: 'disabled', timeout: 15000});
  screenshots.push(file);
}
async function count(expected, p = page) {
  await p.waitForFunction(n => Number(document.querySelector('.library-heading>span')?.textContent.match(/[\d,]+/)?.[0]?.replaceAll(',', '')) === n && document.querySelectorAll('.beer-card').length === Math.min(60, n), expected);
}
async function reset(p = page) {
  const button = p.getByLabel('清除全部筛选', {exact: true});
  if (await button.isEnabled()) await button.click();
}
async function panel(name, p = page) {
  const button = p.getByRole('button', {name, exact: true});
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
}
async function closePanel(p = page) {
  const close = p.getByLabel('收起筛选', {exact: true});
  if (await close.count()) await close.click();
}
async function closeDetail(p = page) {
  if (await p.locator('.inspector').count()) await p.getByLabel('关闭酒款详情', {exact: true}).click();
}
async function fits(p = page) {
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
  const clipped = await p.locator('.facet-tabs button,.dock-main input,.dock-main select,.dock-main>button').evaluateAll(nodes => nodes.filter(n => {const r = n.getBoundingClientRect(); return r.width && r.height && (r.left < -.5 || r.right > innerWidth + .5 || r.top < -.5 || r.bottom > innerHeight + .5);}).map(n => ({label: n.getAttribute('aria-label') || n.textContent, rect: n.getBoundingClientRect().toJSON()})));
  assert.deepEqual(clipped, [], 'Main bottom controls must fit viewport');
}
async function visibleMapClick(p = page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const point = await p.locator('.brew-globe-view .globe-bottle').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect();
      const hit = [[.5,.5],[.25,.4],[.75,.4],[.5,.2],[.5,.8]].map(([fx, fy]) => ({x: r.x + r.width * fx, y: r.y + r.height * fy})).find(({x, y}) => r.width && r.height && x > 2 && x < innerWidth - 2 && y > 2 && y < innerHeight - 2 && node.contains(document.elementFromPoint(x, y)));
      return hit ? {...hit, beerId: node.dataset.beerId, state: node.dataset.imageState} : null;
    }).find(Boolean));
    if (point) { await p.mouse.click(point.x, point.y); return point; }
    await p.waitForTimeout(200);
  }
  throw Error('No exposed map image button');
}
async function verifyLocalPhoto(selector, p = page) {
  const element = p.locator(selector).first();
  await element.locator('img').waitFor();
  await p.waitForFunction(sel => document.querySelector(sel)?.dataset.imageState === 'ready', selector);
  const dimensions = await element.evaluate(node => {
    const img = node.querySelector('img'), r = node.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return {state: node.dataset.imageState, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, wrapper: {width: r.width, height: r.height}, image: {width: ir.width, height: ir.height}, visible: getComputedStyle(img).opacity, hasStatus: !!node.querySelector('.photo-status')};
  });
  assert(dimensions.complete && dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0);
  assert(dimensions.image.width >= 24 && dimensions.image.height >= 24);
  assert(dimensions.wrapper.width >= 24 && dimensions.wrapper.height >= 24);
  assert(dimensions.image.width <= dimensions.wrapper.width + 2 && dimensions.image.height <= dimensions.wrapper.height + 2, `Decoded image overflows wrapper: ${JSON.stringify(dimensions)}`);
  assert.equal(dimensions.visible, '1');
  assert.equal(dimensions.hasStatus, false);
  measurements.push({name: 'local-ready-photo', selector, ...dimensions});
}

try {
  await check('Local imported catalogue has 1000 records, 635 candidate image links and 14 reference locations', async () => {
    source = await readData('beertasting'); beers = source.beers;
    breweryById = new Map(source.breweries.map(b => [b.id, b]));
    beerById = new Map(beers.map(b => [b.id, b]));
    taxonomy = new Map(beers.map(b => [b.id, classifyBeer(b)]));
    assert.equal(beers.length, 1000); assert.equal(beerById.size, 1000);
    assert(beers.every(b => b.collection === 'beertasting' && breweryById.has(b.breweryId)));
    assert.equal(beers.filter(b => b.image).length, 635);
    const used = source.breweries.filter(br => beers.some(b => b.breweryId === br.id));
    assert.equal(used.filter(located).length, 14);
    report.catalogue = {beers: beers.length, imageLinks: beers.filter(b => b.image).length, breweries: used.length, mappedReferenceLocations: used.filter(located).length, mappedBeers: beers.filter(b => located(breweryById.get(b.breweryId))).length, countriesOrRegions: new Set(used.map(b => b.country).filter(Boolean)).size};
  });
  browser = await playwright.chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
  page = await openPage({width: 1440, height: 900}, '?collection=beertasting');
  await check('Desktop direct collection link and map use imported counts and real brewery reference coordinates', async () => {
    assert.equal(await page.getByLabel('选择数据集').inputValue(), 'beertasting');
    await page.waitForFunction(() => document.querySelectorAll('.brew-globe-view [data-marker-id]').length > 0);
    assert.deepEqual((await page.locator('.map-summary strong').allTextContents()).map(n => Number(n.replaceAll(',', ''))), [1000, 14]);
    await page.waitForTimeout(800);
    const markers = await page.locator('.brew-globe-view [data-marker-id]').evaluateAll(nodes => nodes.map(n => ({id: n.dataset.markerId, memberIds: JSON.parse(n.dataset.memberIds || '[]'), lat: Number(n.dataset.anchorLat), lng: Number(n.dataset.anchorLng), beerCount: Number(n.dataset.beerCount), photos: [...n.querySelectorAll('.globe-bottle')].map(b => ({beerId: b.dataset.beerId, breweryId: b.dataset.sourceBreweryId, lat: Number(b.dataset.sourceLat), lng: Number(b.dataset.sourceLng), state: b.dataset.imageState, placeholder: b.querySelector('.globe-photo-state')?.textContent}))})));
    assert(markers.some(m => m.photos.length > 0));
    for (const m of markers) {
      assert(m.memberIds.every(id => located(breweryById.get(id))));
      assert(m.memberIds.some(id => {const br = breweryById.get(id); return Math.abs(br.lat - m.lat) < 1e-5 && Math.abs(br.lng - m.lng) < 1e-5;}));
      assert.equal(m.beerCount, beers.filter(b => m.memberIds.includes(b.breweryId)).length);
      for (const photo of m.photos) {
        const b = beerById.get(photo.beerId), br = breweryById.get(b?.breweryId);
        assert(b && b.image && br && m.memberIds.includes(br.id));
        assert.equal(photo.breweryId, br.id); assert.equal(photo.lat, br.lat); assert.equal(photo.lng, br.lng);
        assert(['failed', 'loading'].includes(photo.state)); assert(photo.placeholder);
      }
    }
    measurements.push({name: 'desktop-map', mode: await page.locator('.brew-globe-view').getAttribute('data-map-mode'), markers});
    await fits(); await screenshot('desktop');
    const clicked = await visibleMapClick(); await page.locator('.inspector h2').waitFor();
    assert.equal(await page.locator('.inspector h2').innerText(), beerById.get(clicked.beerId).name);
    await page.locator('.inspector-hero .beer-photo[data-image-state="failed"] .photo-status').waitFor();
    await screenshot('detail-fallback'); await closeDetail();
  });
  await check('Desktop library pagination, image-link and map-location filters reflect the actual 1000-row sample', async () => {
    await page.getByRole('button', {name: '酒库', exact: true}).click(); await count(1000);
    assert.deepEqual(await page.locator('.beer-card h3').allTextContents(), beers.slice(0, 60).map(b => b.name));
    await page.getByLabel('下一页', {exact: true}).click(); assert.match(await page.locator('.page-position').innerText(), /^61/);
    await panel('更多筛选'); await page.getByLabel('只看有实物图', {exact: true}).check(); await count(635);
    await page.waitForFunction(() => /^1–/.test(document.querySelector('.page-position')?.textContent || ''));
    await reset(); await page.getByLabel('只看可定位酒款', {exact: true}).check(); await count(report.catalogue.mappedBeers);
    await reset(); await closePanel(); await count(1000); await screenshot('library');
  });
  await check('Style family and child-style filters preserve exact imported record membership', async () => {
    const ipa = beers.filter(b => taxonomy.get(b.id).family === 'ipa'); assert(ipa.length > 0);
    await page.locator('[data-facet="family"][data-value="ipa"]').click(); await count(ipa.length);
    assert.deepEqual(await page.locator('.beer-card h3').allTextContents(), ipa.slice(0, 60).map(b => b.name));
    await panel('种类');
    const substyle = ipa.find(b => taxonomy.get(b.id).substyle)?.id; assert(substyle);
    const subId = taxonomy.get(substyle).substyle.id;
    await page.getByLabel('按子风格筛选', {exact: true}).selectOption(subId);
    const subset = ipa.filter(b => taxonomy.get(b.id).substyle?.id === subId); await count(subset.length);
    assert.deepEqual(await page.locator('.beer-card h3').allTextContents(), subset.slice(0, 60).map(b => b.name));
    measurements.push({name: 'taxonomy-filter', family: 'ipa', count: ipa.length, substyle: subId, substyleCount: subset.length});
    await reset(); await closePanel();
  });
  await check('Country and brewery filters compose; changing country releases the previous brewery', async () => {
    const groups = [...new Set(source.breweries.map(b => b.country).filter(Boolean))].map(country => ({country, breweries: source.breweries.filter(b => b.country === country)}));
    const first = groups.find(g => g.breweries.length > 1) || groups[0], second = groups.find(g => g.country !== first.country);
    await panel('酒厂与地区'); await page.getByLabel('按国家或地区筛选', {exact: true}).selectOption(first.country);
    const pool = beers.filter(b => breweryById.get(b.breweryId).country === first.country); await count(pool.length);
    const brewery = pool[0].breweryId; await page.getByLabel('按酒厂筛选', {exact: true}).selectOption(brewery);
    await count(pool.filter(b => b.breweryId === brewery).length);
    await page.getByLabel('按国家或地区筛选', {exact: true}).selectOption(second.country);
    assert.equal(await page.getByLabel('按酒厂筛选', {exact: true}).inputValue(), 'all');
    await count(beers.filter(b => breweryById.get(b.breweryId).country === second.country).length);
    measurements.push({name: 'place-filter', country: first.country, brewery, countryCount: pool.length, changedCountry: second.country});
    await reset(); await closePanel();
  });
  await check('Search, empty results and BeerTasting details retain source names, ABV and source links', async () => {
    const b = beers.find(b => b.image && b.abv != null && b.sourceUrls?.length); assert(b);
    const query = b.name.toLowerCase();
    const matched = beers.filter(item => {const br = breweryById.get(item.breweryId); return [item.name, item.style, item.styleZh, item.description, ...(item.flavors || []), br.name, br.nameZh, br.city, br.countryZh, br.country].join(' ').toLowerCase().includes(query);});
    await page.getByLabel('搜索酒款酒厂或国家').fill(b.name); await count(matched.length);
    await page.getByRole('button', {name: `查看 ${b.name}`, exact: true}).first().click();
    assert.equal(await page.locator('.inspector h2').innerText(), b.name);
    assert.equal(await page.locator('.inspector .detail-style').innerText(), b.styleZh);
    const expectedABV = `${Number.isInteger(b.abv) ? b.abv : Number(b.abv.toFixed(1))}%`;
    assert.equal(await page.locator('.beer-stats strong').first().innerText(), expectedABV);
    assert.match(await page.locator('.inspector .catalog-note').innerText(), /BeerTasting.*联网/);
    const links = await page.locator('.source-details a').evaluateAll(nodes => nodes.map(n => n.href));
    assert(b.sourceUrls.some(url => links.includes(url)));
    await page.locator('.detail-tabs').getByRole('button', {name: '酒厂', exact: true}).click();
    assert.equal(await page.locator('.brewery-story h3').innerText(), breweryById.get(b.breweryId).name);
    await closeDetail();
    await page.getByLabel('搜索酒款酒厂或国家').fill('zzzz-empty-beertasting-qa-20260918'); await count(0);
    await reset(); await count(1000);
  });
  await check('Existing local bottle images still decode and fit card/detail wrappers in ready state', async () => {
    const off = await readData('off'), b = off.beers.find(item => item.image && !/^https?:/.test(item.image)); assert(b, 'Existing local-image fixture');
    await page.getByLabel('选择数据集').selectOption('off'); await count(off.beers.length);
    await verifyLocalPhoto('.beer-card .beer-photo');
    await page.getByRole('button', {name: `查看 ${b.name}`, exact: true}).first().click();
    await verifyLocalPhoto('.inspector-hero .beer-photo'); await screenshot('local-ready'); await closeDetail();
    await page.getByLabel('选择数据集').selectOption('beertasting'); await count(1000);
  });
  await page.context().close(); page = null;
  const slow = beers.find(b => b.image);
  await check('Mobile beer deep link has an immediate placeholder and a bounded slow-image state', async () => {
    page = await openPage({width: 390, height: 844}, `?beer=${encodeURIComponent(slow.id)}`, slow.image);
    assert.equal(await page.getByLabel('选择数据集').inputValue(), 'beertasting');
    await page.locator('.inspector h2').waitFor(); assert.equal(await page.locator('.inspector h2').innerText(), slow.name);
    const status = page.locator('.inspector-hero .beer-photo .photo-status'); await status.waitFor();
    assert.match(await status.innerText(), /加载中|加载较慢/);
    await page.locator('.inspector-hero .beer-photo[data-image-state="slow"]').waitFor({timeout: 16000});
    assert.match(await status.innerText(), /图片加载较慢/);
    await screenshot('mobile-slow');
    heldRelease(); heldRelease = null;
    await page.locator('.inspector-hero .beer-photo[data-image-state="failed"]').waitFor();
    assert.match(await status.innerText(), /图片暂不可用/);
    await closeDetail();
  });
  await check('Mobile map, library and filters remain usable within the viewport', async () => {
    await fits(); await screenshot('mobile');
    await page.getByRole('button', {name: '酒库', exact: true}).click(); await count(1000);
    await panel('酒厂与地区');
    const country = source.breweries.find(b => b.country)?.country;
    await page.getByLabel('按国家或地区筛选', {exact: true}).selectOption(country);
    await count(beers.filter(b => breweryById.get(b.breweryId).country === country).length);
    await reset(); await closePanel();
    await page.locator('[data-facet="family"][data-value="ipa"]').click(); await count(beers.filter(b => taxonomy.get(b.id).family === 'ipa').length);
    await fits(); await screenshot('mobile-library');
  });
  await check('No uncaught page errors, local asset failures or unexpected external service requests', async () => {
    assert.deepEqual(errors, []); assert.deepEqual(localFailures, []);
    const unexpectedExternal = blockedExternal.filter(r => r.type !== 'image');
    assert.deepEqual(unexpectedExternal, []);
    const unexpectedConsole = consoleErrors.filter(e => !(e.message.includes('net::ERR_FAILED') && e.url && new URL(e.url).origin !== origin));
    assert.deepEqual(unexpectedConsole, []);
  });
  await page.context().close(); page = null;
  if (!skipRealPreview) await check('One bounded actual desktop preview records real image loading separately from simulated fallback', async () => {
    const preview = {budget: {maxExternalImageGETs: 15, observationMs: 25000}, permitted: [], budgetBlocked: [], responses: [], failedRequests: []};
    report.actualPreview = preview;
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, reducedMotion: 'reduce'});
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
        if (request.resourceType() === 'image' && preview.permitted.length < 15 && !preview.permitted.includes(url.href)) {
          preview.permitted.push(url.href); await route.continue();
        } else { preview.budgetBlocked.push({url: url.href, type: request.resourceType()}); await route.abort('failed'); }
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push({case: activeCase, message: error.message}));
    page.on('response', response => {if (preview.permitted.includes(response.url())) preview.responses.push({url: response.url(), status: response.status(), type: response.headers()['content-type']});});
    page.on('requestfailed', request => {if (preview.permitted.includes(request.url())) preview.failedRequests.push({url: request.url(), reason: request.failure()?.errorText});});
    await page.goto(`${base}/?collection=beertasting`, {waitUntil: 'domcontentloaded'});
    await page.locator('.brew-globe-view .globe-bottle').first().waitFor();
    await page.waitForTimeout(25000);
    preview.visibleImages = await page.locator('.brew-globe-view .globe-bottle').evaluateAll(nodes => nodes.map(node => {const img = node.querySelector('img'), r = node.getBoundingClientRect(); return {beerId: node.dataset.beerId, url: img?.src, state: node.dataset.imageState, complete: img?.complete, naturalWidth: img?.naturalWidth, naturalHeight: img?.naturalHeight, renderedWidth: r.width, renderedHeight: r.height, placeholder: node.querySelector('.globe-photo-state')?.textContent};}));
    preview.loaded = preview.visibleImages.filter(i => i.state === 'ready' && i.complete && i.naturalWidth > 0 && i.naturalHeight > 0).length;
    preview.pending = preview.visibleImages.filter(i => i.state === 'loading').length;
    preview.failedOrBudgetBlocked = preview.visibleImages.filter(i => i.state === 'failed').length;
    preview.note = 'Only this 25-second desktop viewport was observed. HTTP 200/natural dimensions alone do not mean complete decoding. Failed states may be the deliberate request budget; no rate is extrapolated to 635 URLs.';
    assert(preview.permitted.length <= 15); assert.deepEqual(errors, []); await fits();
    await screenshot('desktop-real');
  });
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = {case: activeCase, message: error.message, stack: error.stack};
  results.push({name: activeCase, passed: false, message: error.message});
  console.error(error);
  if (page && !page.isClosed()) { try { await screenshot('failure'); } catch {} }
  process.exitCode = 1;
} finally {
  heldRelease?.();
  await browser?.close();
  Object.assign(report, {finishedAt: new Date().toISOString(), errors, localFailures, consoleErrors, externalRequests: {functionalTestsTransmitted: 0, actualPreviewPermittedGETs: report.actualPreview?.permitted.length || 0, functionalInterceptedTotal: blockedExternal.length, functionalUniqueUrls: new Set(blockedExternal.map(r => r.url)).size, held: [...new Set(blockedExternal.filter(r => r.held).map(r => r.url))]}, blockedExternal});
  await writeFile(path.join(output, 'beertasting-demo-results.json'), JSON.stringify(report, null, 2) + '\n');
}
