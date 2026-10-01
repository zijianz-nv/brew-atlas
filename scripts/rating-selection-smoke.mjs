import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBeerPhotoRank } from '../src/beer-ranking.mjs';

const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173', origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use only the local demo');
const output = path.join(root, 'qa');
const report = { startedAt: new Date().toISOString(), base,
  policy: 'Isolated real Google Chrome; every external request aborted. Source data and real UI only; no synthetic beers or source edits. First visible photo follows layout order, not incidental DOM order. Image-cache assertions inspect the same DOM image and map-only src assignments/load events.',
  checks: [], errors: [], external: [], localErrors: [] };
let browser, page, data, byBeer, byBrewery, activeCase = 'initialize';

async function check(name, fn) {
  activeCase = name;
  try {
    const result = await fn();
    if (result?.skipped) { report.checks.push({ name, skipped: true, reason: result.reason }); console.log(`SKIP ${name}: ${result.reason}`); }
    else { report.checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  }
  catch (error) {
    report.checks.push({ name, passed: false, message: error.message, stack: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `rating-selection-failure-${report.checks.length}.png`) }).catch(() => {});
  }
}
async function settle() {
  await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask);
  await page.waitForTimeout(2300); // Camera animation and 700 ms coastal reveal hysteresis.
}
async function visiblePhotos() {
  return page.evaluate(() => {
    const shown = n => {
      if (!n) return false;
      const r = n.getBoundingClientRect(); if (!r.width || !r.height) return false;
      for (let a = n; a; a = a.parentElement) {
        const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return false;
      }
      return true;
    };
    return [...document.querySelectorAll('.brew-globe-view [data-marker-id]')].flatMap(element => {
      const marker = element._marker;
      return (marker?.photos || []).flatMap((photo, layoutIndex) => {
        const node = [...element.querySelectorAll('.globe-bottle')].find(n => n.dataset.beerId === photo.beer.id);
        if (!shown(node)) return [];
        const r = node.getBoundingClientRect(), image = node.querySelector('img');
        return [{ beerId: photo.beer.id, breweryId: photo.sourceId, markerId: marker.id, layoutIndex,
          x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height,
          ready: node.dataset.imageState === 'ready' && image?.complete && image.naturalWidth > 0,
          clickable: node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) }];
      });
    });
  });
}
async function clickBeer(id) {
  let target;
  for (let attempt = 0; attempt < 30; attempt++) {
    target = (await visiblePhotos()).find(p => p.beerId === id && p.clickable);
    if (target) break;
    await page.waitForTimeout(150);
  }
  assert(target, `No exposed real map photo for ${id}`);
  await page.mouse.click(target.x, target.y);
  await page.locator('.inspector h2').waitFor();
}
async function assertDetail(beer) {
  assert.equal(await page.locator('.inspector h2').innerText(), beer.name, 'Detail selected the wrong beer');
  const rating = page.locator('.inspector .beer-rating');
  if (Number.isFinite(beer.rating) && beer.rating >= 0 && beer.rating <= 5 && Number.isSafeInteger(beer.ratingsCount) && beer.ratingsCount > 0) {
    const text = await rating.innerText();
    assert(text.includes(beer.rating.toFixed(2)), 'Displayed source rating differs');
    const count = text.match(/([\d,，]+)\s*条评价/);
    assert(count); assert.equal(Number(count[1].replace(/[,，]/g, '')), beer.ratingsCount, 'Displayed ratings_count differs');
    assert.equal(beer.rating, beer.sourceRecord.rating);
    assert.equal(beer.ratingsCount, beer.sourceRecord.ratings_count);
    return { beerId: beer.id, name: beer.name, rating: beer.rating, ratingsCount: beer.ratingsCount, text };
  }
  assert.equal(await rating.count(), 0, 'Unrated beer received an invented rating');
  return { beerId: beer.id, name: beer.name, rating: null };
}
async function closeDetail() {
  if (await page.getByLabel('关闭酒款详情', { exact: true }).count()) await page.getByLabel('关闭酒款详情', { exact: true }).click();
  await settle();
}
async function searchBeer(beer) {
  await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill(beer.name);
  await settle();
}

try {
  await mkdir(output, { recursive: true });
  const response = await fetch(`${base}/data/beertasting.json`); assert(response.ok); data = await response.json();
  byBeer = new Map(data.beers.map(b => [b.id, b])); byBrewery = new Map(data.breweries.map(b => [b.id, b]));
  report.data = { beers: data.beers.length, breweries: data.breweries.length, images: data.beers.filter(b => b.image).length };
  const candidates = new Map(data.breweries.map(br => [br.id, data.beers.filter(b => b.breweryId === br.id && b.image).sort(compareBeerPhotoRank)]));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (['http:', 'https:'].includes(u.protocol) && u.origin !== origin) {
      report.external.push({ case: activeCase, url: u.href }); return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    const writes = new Map(), loads = new Map(), native = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const imageBeer = img => img.closest('.globe-bottle')?.dataset.beerId;
    const increment = (map, id) => { if (id) map.set(id, (map.get(id) || 0) + 1); };
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...native, set(value) { increment(writes, imageBeer(this)); return native.set.call(this, value); } });
    const setAttribute = HTMLImageElement.prototype.setAttribute;
    HTMLImageElement.prototype.setAttribute = function(name, value) { if (String(name).toLowerCase() === 'src') increment(writes, imageBeer(this)); return setAttribute.call(this, name, value); };
    document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement) increment(loads, imageBeer(event.target)); }, true);
    window.__ratingSelection = { writes, loads, saved: null };
  });
  page = await context.newPage(); page.setDefaultTimeout(18000);
  page.on('pageerror', error => report.errors.push({ case: activeCase, message: error.message }));
  page.on('response', r => { if (new URL(r.url()).origin === origin && r.status() >= 400) report.localErrors.push({ url: r.url(), status: r.status() }); });
  await page.goto(`${base}/?collection=beertasting`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('选择数据集', { exact: true }).waitFor(); await settle();
  report.build = await page.locator('script[type="module"]').getAttribute('src');
  assert.equal(await page.locator('.brew-globe-view').getAttribute('data-map-mode'), 'globe', 'Chrome must use real globe rendering');

  await check('Far-view first visible representative is the highest ranked cached beer of each visible brewery', async () => {
    const photos = await visiblePhotos(); assert(photos.length > 0, 'No visible photographs on the initial map');
    const first = new Map(); for (const photo of photos) if (!first.has(photo.breweryId)) first.set(photo.breweryId, photo);
    report.representatives = [...first.values()].map(photo => {
      const expected = candidates.get(photo.breweryId)[0], actual = byBeer.get(photo.beerId);
      return { ...photo, brewery: byBrewery.get(photo.breweryId).name, actual: { id: actual.id, rating: actual.rating, count: actual.ratingsCount }, expected: { id: expected.id, rating: expected.rating, count: expected.ratingsCount }, cachedCandidates: candidates.get(photo.breweryId).length };
    });
    assert(first.size >= 2, 'Far view should represent multiple breweries');
    for (const entry of report.representatives) { assert(entry.ready); assert.equal(entry.actual.id, entry.expected.id, `${entry.brewery}: top cached photo not used as first visible representative`); }
  });

  await check('Map clicks show exact source ratings and a second beer uses the current callback', async () => {
    const first = (await visiblePhotos()).find(p => p.clickable && byBeer.get(p.beerId).ratingsCount >= 10);
    assert(first); await clickBeer(first.beerId);
    report.details = [await assertDetail(byBeer.get(first.beerId))]; await closeDetail();
    const second = (await visiblePhotos()).find(p => p.clickable && p.beerId !== first.beerId);
    assert(second, 'No different beer exposed after the first selection');
    await clickBeer(second.beerId); report.details.push(await assertDetail(byBeer.get(second.beerId)));
    assert.notEqual(report.details[0].beerId, report.details[1].beerId); await closeDetail();
  });

  await check('Same-brewery photo → site → photo filtering clears stale children and reuses the decoded image', async () => {
    const searchable = data.beers.map(b => { const br = byBrewery.get(b.breweryId); return { beer: b, text: [b.name, b.style, b.styleZh, b.description, ...(b.flavors || []), br?.name, br?.nameZh, br?.city, br?.countryZh, br?.country].join(' ').toLowerCase() }; });
    const unique = beer => searchable.filter(row => row.text.includes(beer.name.toLowerCase())).length === 1;
    const breweries = data.breweries.filter(br => br.lat > 40 && br.lat < 54 && br.lng > -5 && br.lng < 20)
      .sort((a, b) => Number(/Bierol/.test(b.name)) - Number(/Bierol/.test(a.name)));
    let fixture;
    for (const brewery of breweries) {
      const withPhoto = candidates.get(brewery.id).find(unique), withoutPhoto = data.beers.find(b => b.breweryId === brewery.id && !b.image && unique(b));
      if (withPhoto && withoutPhoto) { fixture = { brewery, withPhoto, withoutPhoto }; break; }
    }
    assert(fixture, 'No mainland same-brewery unique-name fixture');
    report.transition = { brewery: fixture.brewery.name, breweryId: fixture.brewery.id, withPhoto: fixture.withPhoto.id, withoutPhoto: fixture.withoutPhoto.id, photoName: fixture.withPhoto.name, siteName: fixture.withoutPhoto.name };
    await page.keyboard.press('Escape'); await page.getByLabel('选择数据集', { exact: true }).selectOption('beertasting'); await searchBeer(fixture.withPhoto);
    const selector = `.globe-bottle[data-beer-id="${fixture.withPhoto.id}"]`;
    assert((await visiblePhotos()).some(p => p.beerId === fixture.withPhoto.id), 'Single-name photo fixture not visible');
    report.transition.before = await page.locator(selector).evaluate(node => {
      const state = window.__ratingSelection, image = node.querySelector('img');
      state.saved = { node, image, marker: node.closest('[data-marker-id]'), id: node.dataset.beerId };
      return { markerId: state.saved.marker.dataset.markerId, writes: state.writes.get(state.saved.id) || 0, loads: state.loads.get(state.saved.id) || 0, src: image.getAttribute('src'), ready: image.complete && image.naturalWidth > 0 };
    });
    assert(report.transition.before.ready);
    await searchBeer(fixture.withoutPhoto);
    report.transition.site = await page.evaluate(breweryId => {
      const marker = [...document.querySelectorAll('.brew-globe-view [data-marker-id]')].find(n => n._marker?.members.some(m => m.id === breweryId));
      const state = window.__ratingSelection;
      return marker ? { sameMarker: marker === state.saved.marker, className: marker.className, beerCount: marker.dataset.beerCount,
        availablePhotoCount: marker.dataset.availablePhotoCount, staleImages: marker.querySelectorAll('img,.globe-bottle,.globe-bottle-stack,.globe-bottle-count').length,
        siteButtons: marker.querySelectorAll('.globe-site-dot').length, oldPhotoConnected: state.saved.node.isConnected,
        allMapPhotoIds: [...document.querySelectorAll('.brew-globe-view .globe-bottle')].map(n => n.dataset.beerId) } : null;
    }, fixture.brewery.id);
    assert(report.transition.site); assert(report.transition.site.sameMarker, 'Marker identity rebuilt during photo-to-site conversion');
    assert.match(report.transition.site.className, /globe-site-marker/); assert.equal(report.transition.site.beerCount, '1');
    assert.equal(report.transition.site.availablePhotoCount, '0'); assert.equal(report.transition.site.staleImages, 0);
    assert.equal(report.transition.site.siteButtons, 1); assert.equal(report.transition.site.oldPhotoConnected, false);
    assert.deepEqual(report.transition.site.allMapPhotoIds, []);
    await searchBeer(fixture.withPhoto);
    report.transition.after = await page.locator(selector).evaluate(node => {
      const state = window.__ratingSelection, marker = node.closest('[data-marker-id]'), image = node.querySelector('img');
      return { sameButton: node === state.saved.node, sameImage: image === state.saved.image, sameMarker: marker === state.saved.marker,
        writes: state.writes.get(state.saved.id) || 0, loads: state.loads.get(state.saved.id) || 0,
        src: image.getAttribute('src'), ready: node.dataset.imageState === 'ready' && image.complete && image.naturalWidth > 0,
        staleSiteButtons: marker.querySelectorAll('.globe-site-dot').length, duplicateBeerNodes: [...document.querySelectorAll('.brew-globe-view .globe-bottle')].filter(n => n.dataset.beerId === state.saved.id).length };
    });
    const { before, after } = report.transition;
    assert(after.sameButton && after.sameImage && after.sameMarker, 'Decoded image or marker replaced'); assert(after.ready);
    assert.equal(after.staleSiteButtons, 0); assert.equal(after.duplicateBeerNodes, 1);
    assert.equal(after.src, before.src); assert.equal(after.writes, before.writes, 'Image src assigned again'); assert.equal(after.loads, before.loads, 'Map image loaded again');
    await clickBeer(fixture.withPhoto.id); report.transition.returnDetail = await assertDetail(fixture.withPhoto);
    assert.equal(await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).inputValue(), fixture.withPhoto.name, 'Current click used stale filters and reset the search');
    await closeDetail();
  });

  await check('Native cluster picker, when a co-located cluster is available', async () => {
    await page.getByLabel('清空搜索', { exact: true }).click(); await page.getByLabel('重置地球视角', { exact: true }).click(); await settle();
    const colocated = await page.evaluate(() => [...document.querySelectorAll('.brew-globe-view [data-marker-id]')].filter(n => n._marker?.kind === 'cluster' && n._marker.members.every(p => Math.abs(p.lat - n._marker.lat) + Math.abs(p.lng - n._marker.lng) < .005)).map(n => ({ markerId: n.dataset.markerId, members: n._marker.members.map(p => ({ id: p.id, name: p.brewery.nameZh || p.brewery.name })) })));
    if (!colocated.length) { report.clusterPicker = { exercised: false, reason: 'Current real BeerTasting fixture has no visible co-located cluster that directly opens the native picker; no synthetic coordinates injected.' }; return { skipped: true, reason: report.clusterPicker.reason }; }
    const cluster = colocated[0];
    await page.locator(`[data-marker-id="${cluster.markerId}"] .globe-bottle-count,[data-marker-id="${cluster.markerId}"] .globe-site-dot`).click();
    const picker = page.getByLabel('此区域的酒厂', { exact: true }); await picker.waitFor();
    const buttons = picker.locator('li button'); assert((await buttons.count()) > 0);
    await buttons.first().click(); await page.getByLabel('此酒厂的酒款', { exact: true }).waitFor();
    assert.equal(await picker.count(), 0); report.clusterPicker = { exercised: true, markerId: cluster.markerId };
  });
  await check('No external requests, local asset errors or uncaught browser errors', async () => {
    assert.deepEqual(report.external, []); assert.deepEqual(report.localErrors, []); assert.deepEqual(report.errors, []);
  });
  await page.screenshot({ path: path.join(output, 'rating-selection-final.png'), animations: 'disabled' });
  report.passed = report.checks.every(check => check.passed || check.skipped);
} catch (error) { report.passed = false; report.failure = { case: activeCase, message: error.message, stack: error.stack }; console.error(error); }
finally {
  await browser?.close(); report.browserClosed = true; report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'rating-selection-results.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.passed) process.exitCode = 1;
}
