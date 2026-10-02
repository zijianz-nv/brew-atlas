import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INGREDIENT_REGIONS, INGREDIENT_TYPES, INGREDIENT_REGION_NOTES } from '../src/ingredient-regions.mjs';

// Independent vector check: do not rasterize or move an editorial reference
// into its expected country. Interior rings exclude lakes and enclaves.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(x, y, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) => inRing(x, y, outer) && !holes.some(hole => inRing(x, y, hole)));
}

test('regional references lie within the stated countries on the bundled 50m map', () => {
  const world = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url), 'utf8'));
  const aliases = { 'United States': 'United States of America', 'Côte d’Ivoire': "Côte d'Ivoire" };
  for (const region of INGREDIENT_REGIONS) {
    const country = aliases[region.country] ?? region.country;
    const features = world.features.filter(feature => feature.properties.name === country);
    assert.ok(features.length, `${region.id}: country must exist in the actual map`);
    assert.ok(features.some(feature => inGeometry(region.lng, region.lat, feature.geometry)),
      `${region.id}: ${region.lng},${region.lat} must be on land in ${country}`);
  }
});

test('country audit excludes polygon holes and distinguishes separate islands', () => {
  const box = (l, b, r, t) => [[l, b], [r, b], [r, t], [l, t], [l, b]];
  const polygon = { type: 'Polygon', coordinates: [box(0, 0, 10, 10), box(4, 4, 6, 6)] };
  assert.equal(inGeometry(2, 2, polygon), true);
  assert.equal(inGeometry(5, 5, polygon), false);
  assert.equal(inGeometry(12, 5, polygon), false);
  const islands = { type: 'MultiPolygon', coordinates: [[box(-20, 0, -10, 10)], [box(10, 0, 20, 10)]] };
  assert.equal(inGeometry(15, 5, islands), true);
  assert.equal(inGeometry(0, 5, islands), false);
});

test('each crop has several representative regions spanning continents without water or yeast points', () => {
  const types = new Set(INGREDIENT_TYPES.map(type => type.id));
  assert.equal(types.size, INGREDIENT_TYPES.length);
  for (const required of ['barley', 'hops', 'wheat', 'oats']) assert.ok(types.has(required));
  assert.equal(types.has('water'), false);
  assert.equal(types.has('yeast'), false);
  assert.equal(INGREDIENT_REGIONS.length, 46, '38 earlier references plus eight sourced growing regions');
  assert.equal(new Set(INGREDIENT_REGIONS.map(region => region.id)).size, INGREDIENT_REGIONS.length);
  for (const region of INGREDIENT_REGIONS) assert.ok(types.has(region.type), region.id);
  for (const type of types) {
    const regions = INGREDIENT_REGIONS.filter(region => region.type === type);
    assert.ok(regions.length >= 2 && regions.length <= 12, `${type}: bounded representative selection`);
    assert.ok(new Set(regions.map(region => region.continent)).size >= 2, `${type}: cross-continent coverage`);
  }
});

test('every region keeps cultivation and climate evidence separate and explicitly approximate', () => {
  for (const region of INGREDIENT_REGIONS) {
    assert.ok(Number.isFinite(region.lat) && Math.abs(region.lat) <= 90, region.id);
    assert.ok(Number.isFinite(region.lng) && Math.abs(region.lng) <= 180, region.id);
    assert.ok(Math.abs(region.lat * 10 - Math.round(region.lat * 10)) < 1e-8);
    assert.ok(Math.abs(region.lng * 10 - Math.round(region.lng * 10)) < 1e-8);
    assert.equal(region.locationPrecision, 'regional');
    assert.equal(region.locationRole, 'regional_reference');
    assert.equal(region.coordinateBasis, 'editorial_region_reference');
    assert.equal(region.climateScope, 'general_crop_guidance');
    assert.equal(region.supplyChainVerified, false);
    assert.equal(region.checkedAt, INGREDIENT_REGION_NOTES.checkedAt);
    for (const field of ['nameZh', 'countryZh', 'referencePlace', 'coordinateNote', 'description', 'climateSummary']) {
      assert.ok(typeof region[field] === 'string' && region[field].trim(), `${region.id}: ${field}`);
    }
    for (const field of ['sourceUrls', 'climateSourceUrls']) {
      assert.ok(region[field].length > 0, `${region.id}: ${field}`);
      for (const source of region[field]) assert.equal(new URL(source).protocol, 'https:');
    }
    assert.equal('suitabilityScore' in region, false);
    assert.equal('supplierBeerIds' in region, false);
  }
  assert.match(INGREDIENT_REGION_NOTES.scope, /并非全球全部产区/);
  assert.match(INGREDIENT_REGION_NOTES.climate, /不是当天天气的适种评分/);
});

test('scope notice preserves the source URLs presented by every crop point', () => {
  const notice = readFileSync(new URL('../public/data-sources/ingredients/NOTICE.md', import.meta.url), 'utf8');
  for (const region of INGREDIENT_REGIONS) {
    assert.ok(notice.includes(region.nameZh), `${region.id}: included in public attribution`);
    for (const source of [...region.sourceUrls, ...region.climateSourceUrls, ...region.seasonSourceUrls]) assert.ok(notice.includes(source), `${region.id}: ${source}`);
  }
});

test('every season summary has its own evidence and distinguishes calendars from observations', () => {
  for (const region of INGREDIENT_REGIONS) {
    assert.ok(region.seasonSummary.length >= 20 && region.seasonSummary.length <= 110, region.id);
    assert.ok(['regional_crop_calendar', 'country_crop_calendar', 'regional_crop_observation'].includes(region.seasonScope), region.id);
    assert.ok(region.seasonSourceUrls.length > 0, region.id);
    assert.ok(Object.isFrozen(region.seasonSourceUrls));
    for (const source of region.seasonSourceUrls) assert.equal(new URL(source).protocol, 'https:');
    if (region.seasonScope === 'country_crop_calendar') {
      assert.match(region.seasonSummary, /国别作期|一般作期/, region.id);
    }
    if (region.seasonScope === 'regional_crop_observation') {
      assert.match(region.seasonSummary, /观察|记录/, region.id);
      assert.match(region.seasonSummary, /不能|不表示|未核实/, region.id);
    }
    assert.doesNotMatch(region.seasonSummary, /今日|今天|适种评分|实时天气|最佳温度/);
    assert.equal('seasonSuitabilityScore' in region, false);
  }
  assert.match(INGREDIENT_REGION_NOTES.seasons, /当地公历/);
  assert.match(INGREDIENT_REGION_NOTES.seasons, /不是实时天气/);
});

test('calendar summaries preserve hemisphere and tropical crop distinctions', () => {
  const byId = new Map(INGREDIENT_REGIONS.map(region => [region.id.replace('ingredient-', ''), region]));
  assert.match(byId.get('hops-yakima').seasonSummary, /8月.*10月/);
  assert.match(byId.get('hops-nelson').seasonSummary, /南半球.*2月.*3月/);
  assert.match(byId.get('wheat-kansas').seasonSummary, /9—10月秋播.*6月.*7月/);
  assert.match(byId.get('wheat-nsw').seasonSummary, /南半球4—5月秋播.*11—12月/);
  assert.match(byId.get('cocoa-losrios').seasonSummary, /3—6月.*10月.*翌年2月/);
  assert.notEqual(byId.get('cocoa-losrios').seasonSummary, byId.get('cocoa-ghana').seasonSummary);
  assert.match(byId.get('citrus-valencia').seasonSummary, /品种.*错峰/);
});

test('sparse-region additions retain local crop evidence and avoid supplier or precision claims', () => {
  const expected = {
    'barley-akmola': ['barley', 'Kazakhstan', 'Asia'],
    'oats-novosibirsk': ['oats', 'Russia', 'Asia'],
    'hops-george': ['hops', 'South Africa', 'Africa'],
    'citrus-harvey': ['citrus', 'Australia', 'Oceania'],
    'hops-elbolson': ['hops', 'Argentina', 'South America'],
    'oats-passofundo': ['oats', 'Brazil', 'South America'],
  };
  for (const [id, [type, country, continent]] of Object.entries(expected)) {
    const region = INGREDIENT_REGIONS.find(item => item.id === `ingredient-${id}`);
    assert.ok(region, id);
    assert.deepEqual([region.type, region.country, region.continent], [type, country, continent]);
    assert.equal(region.supplyChainVerified, false);
    assert.equal(region.locationPrecision, 'regional');
    assert.ok(region.seasonSourceUrls.some(url => region.sourceUrls.includes(url)), id);
  }
  const george = INGREDIENT_REGIONS.find(item => item.id === 'ingredient-hops-george');
  const bolson = INGREDIENT_REGIONS.find(item => item.id === 'ingredient-hops-elbolson');
  assert.match(george.seasonSummary, /南半球.*2—3月/);
  assert.match(bolson.seasonSummary, /南半球.*8月.*2月.*3月/);
  assert.equal(new Set(INGREDIENT_REGIONS.map(region => region.country)).size, 24);
});

test('Chinese references cover distinct researched regions and do not equate all barley with malt', () => {
  const china = INGREDIENT_REGIONS.filter(region => region.country === 'China');
  assert.equal(china.length, 7, 'keep the original Pu’er point and add six distinct regions');
  const byId = new Map(china.map(region => [region.id.replace('ingredient-', ''), region]));
  for (const [id, type] of Object.entries({
    'hops-yanqi': 'hops', 'hops-yumen': 'hops', 'barley-yancheng': 'barley',
    'barley-hulunbuir': 'barley', 'coffee-baoshan': 'coffee', 'cocoa-xinglong': 'cocoa',
  })) {
    const region = byId.get(id);
    assert.ok(region, id);
    assert.equal(region.type, type);
    assert.equal(region.continent, 'Asia');
    assert.equal(region.countryZh, '中国');
    assert.equal(region.supplyChainVerified, false);
    assert.equal(region.locationPrecision, 'regional');
    const genericCropHosts = new Set(['www.usahops.org', 'lfl.bayern.de', 'extension.umn.edu', 'www.ico.org', 'www.icco.org']);
    assert.ok(region.sourceUrls.some(url => !genericCropHosts.has(new URL(url).hostname)), `${id}: actual growing-region evidence beyond generic crop guidance`);
  }
  assert.equal(new Set(china.map(region => `${region.lat},${region.lng}`)).size, china.length);
  assert.ok(Math.max(...china.map(region => region.lat)) - Math.min(...china.map(region => region.lat)) > 30);
  assert.ok(Math.max(...china.map(region => region.lng)) - Math.min(...china.map(region => region.lng)) > 30);
  assert.match(byId.get('barley-yancheng').description, /适用品种.*达标籽粒.*制麦/);
  assert.match(byId.get('barley-yancheng').seasonSummary, /秋播.*初夏.*青贮/);
  assert.match(byId.get('barley-hulunbuir').seasonSummary, /春末.*5月.*6月.*8月/);
  assert.match(byId.get('hops-yanqi').seasonSummary, /9月/);
  assert.match(byId.get('hops-yumen').seasonSummary, /9月/);
  assert.match(byId.get('cocoa-xinglong').description, /示范.*不.*全球主产区/);
  assert.equal(byId.get('cocoa-xinglong').seasonScope, 'regional_crop_observation');
  assert.equal(byId.get('coffee-baoshan').seasonScope, 'regional_crop_observation');
  assert.notEqual(byId.get('coffee-baoshan').referencePlace, byId.get('coffee-puer').referencePlace);
});
