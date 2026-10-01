import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

// Deliberately bounded: four browser catalog loads, first/second pages, actual
// tail-record searches, 14 curated images once and three historical examples.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa');
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
const {chromium} = runtime('playwright');
const data = JSON.parse(await readFile(path.join(root, 'dist/data/catalog.json'), 'utf8'));
const byId = new Map(data.beers.map(beer => [beer.id, beer]));
const breweries = new Map(data.breweries.map(brewery => [brewery.id, brewery]));
const located = brewery => brewery?.locationVerified === true && Number.isFinite(brewery.lat) && Number.isFinite(brewery.lng) && Math.abs(brewery.lat) <= 90 && Math.abs(brewery.lng) <= 180;
const belongs = (beer, collection) => collection === 'all' || collection === 'pictured' && hasDescribedPhoto(beer) || beer.collection === collection || beer.collections?.includes(collection);
const expectedCounts = {all: data.beers.length, pictured: data.beers.filter(hasDescribedPhoto).length};
for (const beer of data.beers) for (const collection of new Set([beer.collection, ...(beer.collections || [])].filter(Boolean))) {
  if (!['all', 'pictured'].includes(collection)) expectedCounts[collection] = (expectedCounts[collection] || 0) + 1;
}
const report = {
  startedAt: new Date().toISOString(), base,
  policy: 'Two independent local Chrome pages; all external HTTP blocked. Counts are records, not globally unique products or independent craft certifications. Existing image eligibility and verified-location requirements remain in force.',
  data: {beers: data.beers.length, breweries: data.breweries.length, counts: data.metadata.counts, completeness: data.metadata.completeness, expectedCollections: expectedCounts},
  checks: [], timings: [], images: [], states: [], screenshots: [], dataRequests: [], externalRequests: [], errors: [], localErrors: [], imageRequests: [],
};
let browser, page, active = 'initialize';
const time = () => performance.now();
async function check(name, run) {
  active = name;
  const start = time();
  try { await run(); report.checks.push({name, passed: true, elapsedMs: Math.round(time() - start)}); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({name, passed: false, message: error.message}); throw error; }
}
async function screenshot(name) {
  await page.mouse.move(0, 0);
  const file = path.join(output, `v118-${name}.png`);
  await page.screenshot({path: file});
  report.screenshots.push(file);
}
async function collection(value) {
  await page.getByLabel('选择数据集', {exact: true}).selectOption(value);
  await page.waitForFunction(expected => {
    const text = document.querySelector('.library-heading')?.textContent || '';
    const match = text.match(/([\d,，]+)\s*条记录/);
    return match && Number(match[1].replace(/[,，]/g, '')) === expected;
  }, expectedCounts[value] || 0);
}
async function ids() { return page.locator('.beer-card').evaluateAll(nodes => nodes.map(node => node.dataset.beerId)); }
async function assertCount(value) {
  const expected = expectedCounts[value] || 0;
  await page.waitForFunction(expected => {
    const match = document.querySelector('.library-heading')?.textContent.match(/([\d,，]+)\s*条记录/);
    return match && Number(match[1].replace(/[,，]/g, '')) === expected;
  }, expected);
  const cards = await page.locator('.beer-card').evaluateAll(nodes => nodes.map(node => ({id: node.dataset.beerId, award: !!node.querySelector('.card-award')})));
  assert.equal(cards.length, Math.min(60, expected));
  for (const card of cards) {
    const beer = byId.get(card.id);
    assert(beer && belongs(beer, value), `Wrong ${value} card ${card.id}`);
    assert.equal(card.award, Boolean(beer.awards?.length), `Spurious award label: ${card.id}`);
  }
  return cards.map(card => card.id);
}
async function closeDetail() {
  if (await page.locator('.inspector').count()) await page.getByLabel('关闭酒款详情', {exact: true}).click();
}
async function clearSearch() { await page.getByLabel('搜索酒款酒厂或国家', {exact: true}).fill(''); }
async function openBeer(beer) {
  await closeDetail();
  await clearSearch();
  await collection('all');
  const start = time();
  await page.getByLabel('搜索酒款酒厂或国家', {exact: true}).fill(beer.name);
  const target = page.locator(`.beer-card[data-beer-id="${beer.id}"]`);
  await target.waitFor();
  report.timings.push({case: active, action: 'exact-name search', beerId: beer.id, name: beer.name, elapsedMs: Math.round(time() - start)});
  await target.locator('.beer-card-main').click();
  await page.locator(`.inspector[data-beer-id="${beer.id}"]`).waitFor();
  assert.equal((await page.locator('.inspector h2').innerText()).trim(), beer.name.trim());
  assert.equal(Boolean(await page.locator('.inspector .award-record').count()), Boolean(beer.awards?.length));
}
function measureImage(image) {
  const rect = node => { const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height}; };
  return {src:image.getAttribute('src'), complete:image.complete, naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight, fit:getComputedStyle(image).objectFit, contentFit:image.closest('[data-content-fit]')?.dataset.contentFit === 'true', imageRect:rect(image), frameRect:rect(image.parentElement)};
}
function intactImage(value, beer) {
  assert(value.complete && value.naturalWidth > 0 && value.src.startsWith('/'), `Local image decode: ${beer.id}`);
  const frame = value.frameRect, image = value.imageRect;
  assert(frame.width > 0 && frame.height > 0, `Empty image frame: ${beer.id}`);
  if (value.contentFit) {
    const meta = beer.imageContentBounds, b = meta?.bounds;
    assert(b, `Missing content bounds: ${beer.id}`);
    const sx = image.width / meta.width, sy = image.height / meta.height;
    assert(Math.abs(sx - sy) <= Math.max(sx, sy) * .008 + .0001, `Distorted image: ${beer.id}`);
    const pixels = {left:image.left+b.x*sx, right:image.left+(b.x+b.width)*sx, top:image.top+b.y*sy, bottom:image.top+(b.y+b.height)*sy};
    assert(pixels.left >= frame.left-1 && pixels.right <= frame.right+1 && pixels.top >= frame.top-1 && pixels.bottom <= frame.bottom+1, `Clipped image content: ${beer.id}`);
    value.contentRect = pixels;
  } else {
    assert.equal(value.fit, 'contain');
    assert(image.left >= frame.left-1 && image.right <= frame.right+1 && image.top >= frame.top-1 && image.bottom <= frame.bottom+1, `Image escaped frame: ${beer.id}`);
  }
  return value;
}
async function photoDetail(beer, device) {
  await openBeer(beer);
  await page.waitForFunction(() => {
    const image = document.querySelector('.inspector-hero .beer-photo img');
    return image?.complete && image.naturalWidth > 0;
  });
  const image = intactImage(await page.locator('.inspector-hero .beer-photo img').evaluate(measureImage), beer);
  const awards = await page.locator('.inspector .award-record').evaluateAll(nodes => nodes.map(node => ({year:node.dataset.ratingYear, text:node.innerText})));
  for (const award of beer.awards || []) assert(awards.some(row => String(row.year) === String(award.ratingYear) && (!Number.isFinite(award.rating) || row.text.includes(award.rating.toFixed(2)))), `Incorrect annual rating: ${beer.id}`);
  report.images.push({device, beerId:beer.id, collections:beer.collections, ...image});
  await closeDetail();
}
async function noOverflow(device, scene) {
  const bounds = await page.evaluate(() => ({viewport:innerWidth, width:document.documentElement.scrollWidth, libraryWidth:document.querySelector('.library-content')?.scrollWidth, libraryClientWidth:document.querySelector('.library-content')?.clientWidth}));
  assert(bounds.width <= bounds.viewport + 1, `${device} ${scene}: page horizontal overflow`);
  if (bounds.libraryWidth) assert(bounds.libraryWidth <= bounds.libraryClientWidth + 1, `${device} ${scene}: library horizontal overflow`);
  report.states.push({device, scene, bounds});
}
async function inspectMap(device) {
  await clearSearch();
  await collection('all');
  await page.getByRole('button', {name:'地球', exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.brew-globe-view')?._landMask);
  await page.waitForTimeout(1800);
  const state = await page.evaluate(() => {
    const wrapper = document.querySelector('.brew-globe-view'), wr = wrapper.getBoundingClientRect();
    const visible = node => {
      const r = node.getBoundingClientRect(); if (!r.width || !r.height) return false;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) { const s = getComputedStyle(ancestor); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; }
      return true;
    };
    const nodes = [...wrapper.querySelectorAll('.globe-bottle')];
    return {allIds:nodes.map(node => node.dataset.beerId), shown:nodes.filter(visible).map(node => {
      const r = node.getBoundingClientRect(), image = node.querySelector('img');
      return {id:node.dataset.beerId, src:image?.getAttribute('src'), ready:!!(image?.complete && image.naturalWidth), land:wrapper._landMask.intersectsRect({left:r.left-wr.left, right:r.right-wr.left, top:r.top-wr.top, bottom:r.bottom-wr.top})};
    })};
  });
  for (const id of state.allIds) {
    const beer = byId.get(id);
    assert(beer && hasDescribedPhoto(beer) && located(breweries.get(beer.breweryId)), `Unverified map record ${id}`);
  }
  for (const image of state.shown) assert(image.ready && image.src.startsWith('/') && image.land, `Map image unavailable or entirely off land: ${image.id}`);
  assert(state.shown.length > 0, `${device}: empty default map`);
  report.states.push({device, scene:'map', visibleImages:state.shown.length, ...state});
  await noOverflow(device, 'map');
  await screenshot(`${device}-map`);
}

try {
  await mkdir(output, {recursive:true});
  await check('Actual merged catalog counts and award membership', async () => {
    assert.equal(byId.size, data.beers.length);
    assert.equal(data.metadata.counts.beers, data.beers.length);
    assert.equal(data.metadata.counts.breweries, data.breweries.length);
    assert.equal(data.metadata.counts.picturedBeers, expectedCounts.pictured);
    assert.equal(data.metadata.counts.mapReadyBeers, data.beers.filter(beer => hasDescribedPhoto(beer) && located(breweries.get(beer.breweryId))).length);
    assert.equal(expectedCounts.awards, 119); assert.equal(expectedCounts.representative, 6);
    for (const beer of data.beers) {
      assert(breweries.has(beer.breweryId), `Missing brewery ${beer.id}`);
      assert.equal(Boolean(beer.awards?.length), Boolean(belongs(beer, 'awards')), `Award metadata leaks: ${beer.id}`);
      if (beer.image) assert(beer.image.startsWith('/'), `Remote display image: ${beer.id}`);
    }
  });
  const curated = data.beers.filter(beer => beer.id.startsWith('curated-') && hasDescribedPhoto(beer));
  const historical = ['world', 'archive', 'beertasting'].map(collection => data.beers.find(beer => belongs(beer, collection) && hasDescribedPhoto(beer) && !beer.id.startsWith('curated-'))).filter(Boolean);
  const rawTargets = [];
  const nameCounts = new Map();
  for (const beer of data.beers) nameCounts.set(beer.name.toLowerCase(), (nameCounts.get(beer.name.toLowerCase()) || 0) + 1);
  for (const provider of ['kkcp', 'luca', 'hold', 'hopcity', 'systembolaget', 'off-pending', 'beertasting-pending', 'beerrepublic']) {
    // The UI intentionally uses substring search. "Special Bitter" and "Бира"
    // have many matches; use the last distinctive real source name, not a
    // false assumption that an ambiguous source tail ID must be on page one.
    const beer = data.beers.findLast(beer => beer.snapshotProvider === provider && beer.name.length >= 25 && nameCounts.get(beer.name.toLowerCase()) === 1)
      || data.beers.findLast(beer => beer.snapshotProvider === provider);
    if (beer) rawTargets.push(beer);
  }
  const japan = data.beers.filter(beer => ['Japan', '日本'].includes(breweries.get(beer.breweryId)?.country) || breweries.get(beer.breweryId)?.countryCode === 'JP');
  const japaneseExample = japan.find(beer => hasDescribedPhoto(beer) && beer.name.length > 12);
  if (japaneseExample) rawTargets.push(japaneseExample);
  report.data.japan = {records:japan.length, withImage:japan.filter(beer => beer.image).length, mapReady:japan.filter(beer => hasDescribedPhoto(beer) && located(breweries.get(beer.breweryId))).length};
  report.fixtures = {curatedImages:curated.map(beer => beer.id), historicalImages:historical.map(beer => beer.id), rawTailSearches:rawTargets.map(beer => ({id:beer.id, name:beer.name, provider:beer.snapshotProvider}))};
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
  for (const device of [{name:'desktop', width:1440, height:900}, {name:'mobile', width:390, height:844}]) {
    const context = await browser.newContext({viewport:{width:device.width, height:device.height}, deviceScaleFactor:1, isMobile:device.name === 'mobile', hasTouch:device.name === 'mobile', reducedMotion:'reduce'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) { report.externalRequests.push({case:active, url:url.href}); return route.abort(); }
      return route.continue();
    });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => report.errors.push({case:active, message:error.message}));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin) return;
      if (/^\/data\/.*\.json$/.test(url.pathname)) report.dataRequests.push({device:device.name, path:url.pathname});
      if (request.resourceType() === 'image') report.imageRequests.push(url.pathname);
    });
    page.on('response', response => { if (new URL(response.url()).origin === origin && response.status() >= 400) report.localErrors.push({case:active, url:response.url(), status:response.status()}); });
    try {
      await check(`${device.name}: full library direct URL and gzip delivery`, async () => {
        const start = time(), responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/data/catalog.json');
        await page.goto(`${base}/?view=library&collection=all`, {waitUntil:'domcontentloaded'});
        const response = await responsePromise;
        assert(response.ok()); assert.equal((await response.allHeaders())['content-encoding'], 'gzip');
        await page.getByLabel('选择数据集', {exact:true}).waitFor();
        await assertCount('all');
        const build = await page.locator('script[type=module]').getAttribute('src');
        if (report.build) assert.equal(build, report.build); else report.build = build;
        const resource = await page.evaluate(() => performance.getEntriesByType('resource').filter(resource => new URL(resource.name).pathname === '/data/catalog.json').map(resource => ({durationMs:Math.round(resource.duration), transferSize:resource.transferSize, encodedBodySize:resource.encodedBodySize, decodedBodySize:resource.decodedBodySize})));
        report.timings.push({device:device.name, action:'library ready', elapsedMs:Math.round(time()-start), contentEncoding:'gzip', resource});
        await noOverflow(device.name, 'library'); await screenshot(`${device.name}-library`);
      });
      await check(`${device.name}: second page and all source collection counts`, async () => {
        const first = await ids(), start = time();
        await page.getByLabel('下一页', {exact:true}).first().click();
        await page.waitForFunction(previous => { const ids = [...document.querySelectorAll('.beer-card')].map(node => node.dataset.beerId); return ids.length && ids.every(id => !previous.includes(id)); }, first);
        report.timings.push({device:device.name, action:'second page', elapsedMs:Math.round(time()-start)});
        await page.getByLabel('上一页', {exact:true}).first().click();
        await page.waitForFunction(first => document.querySelector('.beer-card')?.dataset.beerId === first, first[0]);
        const options = await page.getByLabel('选择数据集', {exact:true}).locator('option').evaluateAll(nodes => nodes.map(node => ({value:node.value, text:node.textContent})));
        for (const required of ['all','awards','representative','pictured','beertasting','off','world','archive','openbeer','local']) assert(options.some(option => option.value === required), `Missing collection ${required}`);
        for (const option of options) {
          const labelCount = option.text.match(/([\d,，]+)\s*$/);
          assert(labelCount); assert.equal(Number(labelCount[1].replace(/[,，]/g,'')), expectedCounts[option.value] || 0);
          await collection(option.value); await assertCount(option.value);
        }
        report.states.push({device:device.name, scene:'collection-options', options});
        await collection('all');
      });
      await check(`${device.name}: tail source records remain searchable without fabricated photos or awards`, async () => {
        for (const beer of device.name === 'desktop' ? rawTargets : rawTargets.slice(-2)) {
          await openBeer(beer);
          if (!hasDescribedPhoto(beer)) assert.equal(await page.locator('.inspector-hero img').count(), 0);
          if (!located(breweries.get(beer.breweryId))) {
            await page.locator('.detail-tabs').getByRole('button', {name:'酒厂', exact:true}).click();
            assert(await page.getByRole('button', {name:/在地图上查看/}).isDisabled());
          }
          await closeDetail();
        }
        await screenshot(`${device.name}-tail-search`);
      });
      await check(`${device.name}: curated and historical local images are complete`, async () => {
        const targets = device.name === 'desktop' ? [...curated, ...historical] : [curated.find(beer => beer.awards?.length), ...historical].filter(Boolean);
        assert(curated.length >= 14, 'Existing 14 curated images were lost');
        for (const beer of targets) await photoDetail(beer, device.name);
      });
      await check(`${device.name}: verified-location map uses only eligible local images`, async () => { await inspectMap(device.name); });
      await check(`${device.name}: legacy collection direct URL still opens`, async () => {
        const legacy = device.name === 'desktop' ? 'world' : 'off';
        await page.goto(`${base}/?view=library&collection=${legacy}`, {waitUntil:'domcontentloaded'});
        await page.getByLabel('选择数据集', {exact:true}).waitFor();
        assert.equal(await page.getByLabel('选择数据集', {exact:true}).inputValue(), legacy);
        await assertCount(legacy);
        assert.equal(await page.locator('script[type=module]').getAttribute('src'), report.build);
        report.states.push({device:device.name, scene:'legacy-direct-url', collection:legacy, records:expectedCounts[legacy]});
      });
    } catch (error) { await screenshot(`${device.name}-failure`).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  await check('Catalog-only requests, no hotlinks, browser exceptions or missing local assets', async () => {
    assert.equal(report.dataRequests.length, 4);
    assert.deepEqual([...new Set(report.dataRequests.map(request => request.path))], ['/data/catalog.json']);
    assert.deepEqual(report.externalRequests, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.localErrors, []);
  });
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = {case:active, message:error.message, stack:error.stack};
  console.error(error); process.exitCode = 1;
} finally {
  await browser?.close(); report.browserClosed = true; report.finishedAt = new Date().toISOString();
  report.imageRequests = [...new Set(report.imageRequests)];
  await mkdir(output, {recursive:true});
  await writeFile(path.join(output, 'v118-browser-results.json'), JSON.stringify(report, null, 2)+'\n');
}
