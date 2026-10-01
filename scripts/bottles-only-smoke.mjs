import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDescribedPhoto, hasBeerIntroduction, beerIntroduction } from '../src/beer-photo-eligibility.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const { chromium } = runtime('playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Only a local demo may be tested');
const forbiddenSelectors = '.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor';
const report = {
  startedAt: new Date().toISOString(), base,
  policy: 'Own isolated real Chrome contexts; all external requests aborted. No source/data changes or app-state injection. Real picture/detail/brewery/filter controls. Flat mode is exercised by disabling WebGL before page load. Forbidden marker DOM is checked even when hidden and watched during transitions.',
  checks: [], states: [], screenshots: [], external: [], errors: [], localErrors: [],
  forbiddenImageRequests: [], localMapResources: [], build: null,
};
let browser, page, active = 'initialize', beerMap, breweryMap, forbiddenImagePaths;

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
async function check(name, action) {
  active = name;
  await action();
  report.checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function settle() {
  await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask);
  await page.waitForTimeout(2300); // Camera/layout completion and coastal reveal hysteresis.
}
async function screenshot(name) {
  await page.mouse.move(0, 0);
  const file = path.join(output, `bottles-only-${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function assertForbiddenAbsent(name) {
  assert.equal(await page.locator(`.brew-globe-view :is(${forbiddenSelectors})`).count(), 0,
    `${name}: numeric/site/anchor nodes remain in the map DOM`);
  const transient = await page.evaluate(() => window.__bottlesOnly.forbiddenNodes);
  assert.deepEqual(transient, [], `${name}: forbidden markers appeared during a transition`);
}
async function state(name, { requirePhotos = true } = {}) {
  await settle();
  await assertForbiddenAbsent(name);
  const current = await page.evaluate(() => {
    const wrapper = document.querySelector('.brew-globe-view');
    const wr = wrapper.getBoundingClientRect();
    const rect = node => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const shown = node => {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      for (let p = node; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const photos = [...wrapper.querySelectorAll('.globe-bottle')].filter(shown).map(node => {
      const r = rect(node), image = node.querySelector('img');
      return {
        id: node.dataset.beerId, breweryId: node.dataset.sourceBreweryId, rect: r,
        sourceX: Number(node.dataset.sourceScreenX), sourceY: Number(node.dataset.sourceScreenY),
        src: image?.getAttribute('src'), ready: node.dataset.imageState === 'ready' && image?.complete && image.naturalWidth > 0,
        land: wrapper._landMask.intersectsRect({ left: r.left - wr.left, top: r.top - wr.top, right: r.right - wr.left, bottom: r.bottom - wr.top }),
        fit: image && getComputedStyle(image).objectFit,
        clickable: node.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)),
      };
    });
    const controls = [...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')]
      .filter(shown).map(node => ({ name: node.className, ...rect(node) }));
    return { mode: wrapper.dataset.mapMode, zoom: Number(wrapper.dataset.zoomScale), wrapper: rect(wrapper),
      viewport: { width: innerWidth, height: innerHeight }, photos, controls,
      allPhotoIds: [...wrapper.querySelectorAll('.globe-bottle')].map(node => node.dataset.beerId),
      imageSources: [...document.images].map(image => image.getAttribute('src')),
      hint: document.querySelector('.map-hint')?.textContent || '',
    };
  });
  report.states.push({ name, ...current });
  if (requirePhotos) assert(current.photos.length > 0, `${name}: expected a real described photograph`);
  assert(!/点数量|点击数量|圆点显示/.test(current.hint), `${name}: map instructions still refer to removed controls`);
  for (const id of current.allPhotoIds) assert(hasDescribedPhoto(beerMap.get(id)), `${name}: undescribed image exists in map DOM: ${id}`);
  for (const src of current.imageSources) if (src) assert(!forbiddenImagePaths.has(new URL(src, base).pathname), `${name}: ineligible image in page DOM`);
  for (const photo of current.photos) {
    const beer = beerMap.get(photo.id);
    assert(beer && hasDescribedPhoto(beer));
    assert.equal(photo.breweryId, beer.breweryId, `${name}: wrong source brewery`);
    assert.equal(photo.src, beer.imageThumbnail || beer.image, `${name}: wrong source image`);
    assert(photo.src.startsWith('/'), `${name}: a map photo is not local`);
    assert(photo.ready, `${name}: photo is not decoded`);
    assert(photo.land, `${name}: the image rectangle must intersect land`);
    assert.equal(photo.fit, 'contain');
    assert(photo.rect.left >= Math.max(0, current.wrapper.left) - .5
      && photo.rect.right <= Math.min(current.viewport.width, current.wrapper.right) + .5
      && photo.rect.top >= Math.max(0, current.wrapper.top) - .5
      && photo.rect.bottom <= Math.min(current.viewport.height, current.wrapper.bottom) + .5, `${name}: image leaves viewport`);
    for (const control of current.controls) assert(overlap(photo.rect, control) <= 1, `${name}: image overlaps ${control.name}`);
  }
  for (let i = 0; i < current.photos.length; i++) for (let j = 0; j < i; j++)
    assert(overlap(current.photos[i].rect, current.photos[j].rect) <= 1, `${name}: image rectangles overlap`);
  return current;
}
async function selectBrewery(brewery) {
  await page.getByRole('button', { name: '酒厂与地区', exact: true }).click();
  await page.getByLabel('按国家或地区筛选', { exact: true }).selectOption(brewery.country);
  await page.getByLabel('按酒厂筛选', { exact: true }).selectOption(brewery.id);
  assert.equal(await page.getByLabel('按酒厂筛选', { exact: true }).inputValue(), brewery.id);
  await page.getByRole('button', { name: '收起筛选', exact: true }).click();
}
async function clickPhoto(current) {
  const photo = current.photos.find(item => item.clickable);
  assert(photo, 'No real exposed bottle can be clicked');
  await page.mouse.click((photo.rect.left + photo.rect.right) / 2, (photo.rect.top + photo.rect.bottom) / 2);
  const beer = beerMap.get(photo.id);
  await page.locator('.inspector h2').waitFor();
  assert.equal((await page.locator('.inspector h2').innerText()).trim(), beer.name.trim());
  assert.equal((await page.locator('.tasting-note').innerText()).replace(/\s+/g, ' ').trim(), beerIntroduction(beer).replace(/\s+/g, ' ').trim());
  await page.waitForFunction(() => { const image = document.querySelector('.inspector-hero .beer-photo img'); return image?.complete && image.naturalWidth > 0; });
  assert.equal(await page.locator('.inspector-hero .beer-photo img').getAttribute('src'), beer.imageOriginal || beer.image);
  return beer;
}
async function dragMap(compact) {
  const start = await page.evaluate(() => {
    const wrapper = document.querySelector('.brew-globe-view'), r = wrapper.getBoundingClientRect();
    const obstacles = [...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.globe-bottle')]
      .map(node => node.getBoundingClientRect());
    for (const [xf, yf] of [[.52, .48], [.45, .54], [.6, .45], [.35, .6], [.62, .62]]) {
      const x = r.left + r.width * xf, y = r.top + r.height * yf;
      if (obstacles.some(o => x >= o.left - 4 && x <= o.right + 4 && y >= o.top - 4 && y <= o.bottom + 4)) continue;
      if (document.elementFromPoint(x, y)?.closest('.brew-globe-view')) return { x, y };
    }
    return null;
  });
  assert(start, 'No unobstructed map position for a real drag');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (compact ? 36 : 65), start.y + 8, { steps: 14 });
  await page.mouse.up();
  await settle();
}

try {
  await mkdir(output, { recursive: true });
  const parts = await Promise.all(['beertasting', 'off', 'world', 'archive', 'openbeer'].map(async name => {
    const response = await fetch(`${base}/data/${name}.json`); assert(response.ok); return response.json();
  }));
  const beers = parts.flatMap(part => part.beers);
  beerMap = new Map(beers.map(beer => [beer.id, beer]));
  breweryMap = new Map(parts.flatMap(part => part.breweries).map(brewery => [brewery.id, brewery]));
  const eligiblePaths = new Set(beers.filter(hasDescribedPhoto).flatMap(beer => [beer.image, beer.imageThumbnail, beer.imageOriginal].filter(Boolean)));
  forbiddenImagePaths = new Set(beers.filter(beer => beer.image && !hasDescribedPhoto(beer))
    .flatMap(beer => [beer.image, beer.imageThumbnail, beer.imageOriginal].filter(Boolean)).filter(src => !eligiblePaths.has(src)));
  const fixture = [...breweryMap.values()].find(brewery => /Master Gao/.test(brewery.name)
    && beers.some(beer => beer.breweryId === brewery.id && hasDescribedPhoto(beer)))
    || [...breweryMap.values()].find(brewery => /Toit/.test(brewery.name)
      && beers.some(beer => beer.breweryId === brewery.id && hasDescribedPhoto(beer)));
  assert(fixture, 'A real inland described-photo fixture is required');
  const undescribed = beers.find(beer => beer.collection === 'beertasting' && beer.image && !hasBeerIntroduction(beer)
    && beers.filter(other => other.name.trim() === beer.name.trim()).length === 1);
  report.fixture = { brewery: fixture.name, breweryId: fixture.id, undescribedBeerId: undescribed?.id };
  report.data = { records: beers.length, eligibleImages: beers.filter(hasDescribedPhoto).length, breweries: breweryMap.size };
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const config of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'flat', width: 1440, height: 900, flat: true }]) {
    const compact = config.width < 500;
    const context = await browser.newContext({ viewport: { width: config.width, height: config.height },
      deviceScaleFactor: 1, isMobile: compact, hasTouch: compact, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.external.push(url.href); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(() => {
      const selector = '.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor';
      const forbiddenNodes = [];
      const inspect = node => {
        if (node.nodeType !== 1) return;
        const found = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
        for (const item of found) if (item.closest('.brew-globe-view')) forbiddenNodes.push({ className: item.className, beerId: item.dataset.beerId || null });
      };
      new MutationObserver(records => { for (const mutation of records) {
        if (mutation.type === 'attributes') inspect(mutation.target);
        else for (const node of mutation.addedNodes) inspect(node);
      } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      window.__bottlesOnly = { forbiddenNodes };
    });
    if (config.flat) await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : original.call(this, type, ...args); };
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ case: active, message: error.message }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === origin && forbiddenImagePaths.has(url.pathname)) report.forbiddenImageRequests.push({ case: active, url: url.href });
      if (url.origin === origin && /(?:earth|world|land|countries|texture)/i.test(url.pathname)) report.localMapResources.push(url.pathname);
    });
    page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) report.localErrors.push({ url: response.url(), status: response.status() }); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await settle();
    const build = await page.locator('script[type=module]').getAttribute('src');
    if (process.env.EXPECTED_BUILD) assert(build.includes(process.env.EXPECTED_BUILD), `Unexpected bundle: ${build}`);
    if (report.build) assert.equal(build, report.build, 'Build changed during QA'); else report.build = build;
    await check(`${config.name}: default map contains only described local bottles`, async () => {
      const current = await state(`${config.name}-home`);
      assert.equal(current.mode, config.flat ? 'flat' : 'globe');
      await screenshot(`${config.name}-home`);
    });
    await page.getByLabel('选择数据集', { exact: true }).selectOption('beertasting');
    await selectBrewery(fixture);
    await check(`${config.name}: zoom and actual drag never recreate numbers or dots`, async () => {
      await state(`${config.name}-brewery-base`);
      await page.getByLabel('放大地球', { exact: true }).click();
      const zoomed = await state(`${config.name}-zoomed`);
      await screenshot(`${config.name}-zoomed`);
      await dragMap(compact);
      const rotated = await state(`${config.name}-rotated`, { requirePhotos: false });
      const previous = new Map(zoomed.photos.map(photo => [photo.id, photo]));
      assert(rotated.photos.some(photo => previous.has(photo.id)
        && Math.hypot(photo.sourceX - previous.get(photo.id).sourceX, photo.sourceY - previous.get(photo.id).sourceY) > 1)
        || JSON.stringify(rotated.photos.map(photo => photo.id).sort()) !== JSON.stringify(zoomed.photos.map(photo => photo.id).sort()), 'Real drag did not change map projection');
      await screenshot(`${config.name}-rotated`);
      await page.getByLabel('缩小地球', { exact: true }).click();
      await state(`${config.name}-zoom-return`, { requirePhotos: false });
    });
    await selectBrewery(fixture);
    await check(`${config.name}: bottle detail and brewery/location/filter remain reachable`, async () => {
      const beer = await clickPhoto(await state(`${config.name}-before-detail`));
      const brewery = breweryMap.get(beer.breweryId);
      await assertForbiddenAbsent(`${config.name}-detail`);
      await page.locator('.inspector').getByRole('button', { name: '酒厂', exact: true }).click();
      assert.equal((await page.locator('.brewery-story h3').innerText()).trim(), brewery.name.trim());
      assert((await page.locator('.brewery-story .location-note').innerText()).trim());
      await screenshot(`${config.name}-brewery-tab`);
      await page.locator('.brewery-story').getByRole('button', { name: '在地图上查看', exact: true }).click();
      await page.locator('.brewery-tray').waitFor();
      assert.equal((await page.locator('.brewery-tray h2').innerText()).trim(), (brewery.nameZh || brewery.name).trim());
      await state(`${config.name}-location-tray`, { requirePhotos: false });
      await page.getByLabel('关闭酒厂酒款', { exact: true }).click();
      await selectBrewery(brewery);
      const filtered = await state(`${config.name}-brewery-filter`);
      assert(filtered.photos.every(photo => photo.breweryId === brewery.id), 'Brewery filter left unrelated bottles');
      await screenshot(`${config.name}-brewery-filter`);
      await clickPhoto(filtered);
      await page.getByLabel('关闭酒款详情', { exact: true }).click();
    });
    await check(`${config.name}: records without displayable photos do not turn into site dots`, async () => {
      await page.getByLabel('选择数据集', { exact: true }).selectOption('openbeer');
      const current = await state(`${config.name}-historical-no-photos`, { requirePhotos: false });
      if (!beers.some(beer => beer.collection === 'openbeer' && hasDescribedPhoto(beer))) assert.equal(current.allPhotoIds.length, 0);
      await assertForbiddenAbsent(`${config.name}-historical-no-photos`);
      if (!undescribed) return;
      await page.getByLabel('选择数据集', { exact: true }).selectOption('beertasting');
      await page.getByRole('button', { name: '酒库', exact: true }).click();
      await page.getByLabel('搜索酒款酒厂或国家', { exact: true }).fill(undescribed.name.trim());
      const card = page.getByRole('button', { name: `查看 ${undescribed.name.trim()}`, exact: true });
      await card.waitFor();
      assert.equal(await card.locator('img').count(), 0, 'Undescribed card displays an image');
      await card.click();
      assert.equal((await page.locator('.inspector h2').innerText()).trim(), undescribed.name.trim());
      assert.equal(await page.locator('.inspector-hero img').count(), 0, 'Undescribed detail displays an image');
    });
    await context.close();
  }
  await check('All map assets remain local and browser execution is clean', async () => {
    assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.localErrors, []);
    assert.deepEqual(report.forbiddenImageRequests, []);
    assert(report.localMapResources.length > 0, 'No local geographic/map resource was observed');
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.checks.push({ name: active, passed: false, message: error.message });
  report.failure = { case: active, message: error.message, stack: error.stack };
  console.error(error);
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.browserClosed = true;
  report.finishedAt = new Date().toISOString();
  report.localMapResources = [...new Set(report.localMapResources)];
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'bottles-only-results.json'), JSON.stringify(report, null, 2) + '\n');
}
