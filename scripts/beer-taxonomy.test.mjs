import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STYLE_FAMILIES, FACETS, classifyBeer } from '../src/beer-taxonomy.mjs';

const read = collection => JSON.parse(fs.readFileSync(new URL(`../public/data/${collection}.json`, import.meta.url), 'utf8')).beers;
const archive = read('archive');
const classify = fields => classifyBeer({ sourceUrls: ['https://example.org/brewery/beer'], ...fields });

test('missing and malformed fields remain unknown and never throw', () => {
  for (const input of [null, undefined, false, '', {}, { style: null, styleZh: {}, flavors: [null, {}, 9], flavorEvidence: [null], sourceRecord: { ingredients: { hops: [null], malt: null }, method: null }, offCategories: null }]) {
    const value = classifyBeer(input);
    assert.equal(value.family, 'unknown');
    assert.equal(value.substyle, null);
    for (const facet of Object.keys(FACETS)) assert.deepEqual(value[facet], []);
  }
});

test('specific styles take precedence over overlapping family words', () => {
  const cases = [
    ['American-Style India Pale Ale', 'ipa'], ['Belgian IPA', 'ipa'], ['Sour IPA', 'ipa'], ['Black IPA', 'ipa'],
    ['Dark Lager', 'lager-bock'], ['German-Style Schwarzbier', 'lager-bock'], ['American-Style Stout', 'stout-porter'],
    ['South German-Style Weizenbock', 'wheat'], ['Belgian-Style White', 'wheat'], ['Light American Wheat Ale or Lager', 'wheat'],
    ['Belgian-Style Fruit Lambic', 'sour'], ['Belgian Pale Ale', 'belgian'], ['Belgian-Style Tripel', 'belgian'],
    ['American-Style Amber/Red Ale', 'amber-brown'], ['Classic English-Style Pale Ale', 'pale-ale'],
    ['American-Style Cream Ale or Lager', 'other'], ['American Rye Ale or Lager', 'other'], ['Barley Wine', 'other'],
    ['Unclassified Beer', 'unknown'], ['Beer', 'unknown'], ['Ale', 'unknown'],
  ];
  for (const [style, expected] of cases) assert.equal(classify({ style }).family, expected, style);
  assert.equal(classify({ styleZh: '深色拉格' }).family, 'lager-bock');
  assert.equal(classify({ style: 'Beer', styleZh: '啤酒（档案未分类）' }).family, 'unknown');
  assert.equal(classify({ style: 'Unclassified Beer', styleZh: '风格待核对' }).family, 'unknown');
});

test('style aliases share an ID while original detailed display labels survive', () => {
  const a = classify({ style: 'American-Style India Pale Ale', styleZh: '美式印度淡色艾尔' });
  const b = classify({ style: 'American IPA', styleZh: '美式 IPA' });
  assert.equal(a.substyle.id, b.substyle.id);
  assert.equal(a.substyle.label, '美式印度淡色艾尔');
  assert.equal(b.substyle.label, '美式 IPA');
  assert.equal(classify({ style: 'German Pilsener' }).substyle.id, classify({ style: 'German Pilsner' }).substyle.id);
});

test('BeerTasting explicit styles and NEIPA aliases retain detailed source labels', () => {
  for (const [style, family] of [
    ['Double NEIPA', 'ipa'], ['Triple NEIPA', 'ipa'], ['Faro', 'sour'],
    ['Alt', 'amber-brown'], ['Festbier', 'lager-bock'], ['Wit Beer / Blanche', 'wheat'],
    ['Lager - Dunkel', 'lager-bock'], ['Barrel Aged (Whisky)', 'other'], ['Cider (Apples)', 'other'],
  ]) {
    const value = classify({ style, styleZh: style });
    assert.equal(value.family, family, style);
    assert.equal(value.substyle.label, style);
    assert.deepEqual(value.taste, []);
    assert.deepEqual(value.aroma, []);
    assert.deepEqual(value.ingredient, []);
  }
  assert.equal(classify({ style: 'Double NEIPA' }).substyle.id, classify({ style: 'Double New England IPA' }).substyle.id);
  assert.equal(classify({ style: 'New England IPA (NEIPA)' }).substyle.id, classify({ style: 'New England IPA' }).substyle.id);
});

test('declared source categories resolve missing types without inventing substyles or processes', () => {
  for (const [style_family, family] of [
    ['Pale Lager', 'lager-bock'], ['Sour Fermentation', 'sour'],
    ['Spontaneous fermentation', 'sour'], ['Alcohol free', 'other'], ['Unknown', 'unknown'],
  ]) {
    const value = classify({ style: 'Unclassified Beer', styleZh: '风格待核对', sourceRecord: { style: null, style_family } });
    assert.equal(value.family, family);
    assert.equal(value.substyle, null);
    for (const dimension of Object.keys(FACETS)) assert.deepEqual(value[dimension], [], dimension);
    if (family !== 'unknown') assert.ok(value.evidence.some(item => item.dimension === 'family' && item.text === `来源分类：${style_family}`));
  }
  assert.equal(classify({ sourceCategory: 'Pale Lager' }).family, 'lager-bock');
  assert.equal(classify({ sourceRecord: { style: 'Double NEIPA', style_family: 'India Pale Ale' } }).family, 'ipa');
  assert.equal(classify({ sourceRecord: { style_family: 'Unknown experimental category' } }).family, 'unknown');
});

test('Belgian category disambiguates broad ale styles while concrete styles retain precedence', () => {
  for (const [style, family] of [
    ['Blonde Ale', 'belgian'], ['Strong Ale', 'belgian'], ['Barley Wine', 'belgian'],
    ['Lambic', 'sour'], ['Wit Beer / Blanche', 'wheat'], ['IPA', 'ipa'], ['Dark Lager', 'lager-bock'],
  ]) {
    const value = classify({ style, sourceRecord: { style, style_family: 'Ale (belgian)' } });
    assert.equal(value.family, family, style);
    assert.equal(value.substyle.label, style);
    if (family === 'belgian') assert.match(value.evidence.find(item => item.dimension === 'family').text, /来源分类：Ale \(belgian\)/);
  }
  assert.equal(classify({ style: 'Stout', sourceRecord: { style_family: 'India Pale Ale' } }).family, 'stout-porter');
  assert.equal(classify({ style: 'Blonde Ale', sourceRecord: { style_family: 'Ale (angloamerican)' } }).family, 'pale-ale');
});

test('explicit process wording in a style carries evidence but names and category labels do not', () => {
  for (const [style, process] of [['Barrel Aged (Whisky)', 'barrel-aged'], ['Dry Hopped Lager', 'dry-hop']]) {
    const value = classify({ style, sourceRecord: { style_family: 'Finishing Style' } });
    assert.deepEqual(value.process, [process]);
    assert.deepEqual(value.ingredient, []);
    assert.ok(value.evidence.some(item => item.dimension === 'process' && item.text === `来源风格：${style}` && item.sourceUrl));
  }
  for (const fields of [
    { style: 'No Barrel Aged character' }, { style: 'Possibly Dry Hopped Lager' },
    { name: 'Barrel Aged Coffee', style: 'Stout', sourceRecord: { style_family: 'Spontaneous fermentation' } },
    { sourceRecord: { style_family: 'Mixed fermentation' } },
  ]) assert.deepEqual(classify(fields).process, []);
});

test('OFF style fallback is exact and specific; origin and craft tags imply no type or flavor', () => {
  const specific = classify({ style: 'Unclassified Beer', offCategories: ['en:pale-ales', 'ca:cervesa-ipa', 'en:session-ipa'] });
  assert.equal(specific.family, 'ipa');
  assert.equal(specific.substyle.id, 'session-ipa');
  assert.equal(classify({ offCategories: ['en:craft-beers', 'en:belgian-beers'] }).family, 'unknown');
  assert.equal(classify({ style: 'Dark Lager', offCategories: ['en:stouts'] }).family, 'lager-bock');
  assert.deepEqual(specific.aroma, []);
  assert.deepEqual(specific.taste, []);
});

test('flavor, taste and mouthfeel are separate and carry source evidence', () => {
  const value = classify({ flavors: ['酸爽', '顺滑', '柑橘', '咖啡', '巧克力', '松针'] });
  assert.deepEqual(value.taste, ['sour']);
  assert.deepEqual(value.mouthfeel, ['smooth']);
  assert.deepEqual(value.aroma, ['citrus', 'coffee', 'chocolate', 'resin']);
  assert.deepEqual(value.ingredient, []);
  assert.deepEqual(value.process, []);
  assert.ok(value.evidence.every(item => item.text && item.sourceUrl === 'https://example.org/brewery/beer'));
});

test('negated, uncertain, name-only and serving evidence do not assert flavors', () => {
  for (const excerpt of ['No coffee aroma.', 'May have coffee aroma.', 'Without coffee notes.', 'Try adding coffee.', 'Not a coffee beer.']) {
    assert.deepEqual(classify({ flavors: ['咖啡'], flavorEvidence: [{ flavor: '咖啡', matches: [{ field: 'description', excerpt }] }] }).aroma, [], excerpt);
  }
  for (const field of ['name', 'food_pairing', 'brewers_tips']) {
    assert.deepEqual(classify({ flavors: ['咖啡'], flavorEvidence: [{ flavor: '咖啡', matches: [{ field, excerpt: 'Coffee' }] }] }).aroma, []);
  }
  assert.deepEqual(classify({ originalDescription: 'Pair with sweet desserts and bitter beer. Serve with creamy coffee.' }).taste, []);
  assert.deepEqual(classify({ flavors: ['顺滑'], flavorEvidence: [{ flavor: '顺滑', matches: [{ field: 'description', excerpt: 'Intense espresso, smooth molasses and bitter chocolate' }] }] }).mouthfeel, []);
});

test('source description provides taste and mouthfeel only with explicit sensory language', () => {
  const value = classify({ originalDescription: 'A full-bodied beer with a smooth mouthfeel. A bitter finish balances the sweetness.' });
  assert.deepEqual(value.taste, ['bitter', 'sweet']);
  assert.deepEqual(value.mouthfeel, ['full', 'smooth']);
  assert.deepEqual(value.aroma, []);
  assert.deepEqual(classify({ originalDescription: 'Light golden beer. Brewed with sweet orange peel and bitter orange peel.' }).taste, []);
  assert.deepEqual(classify({ originalDescription: 'Light golden beer.' }).mouthfeel, []);
  assert.deepEqual(classify({ originalDescription: 'No bitterness. It may have a full-bodied mouthfeel. No sweet finish.' }).taste, []);
  assert.deepEqual(classify({ originalDescription: 'No bitterness. It may have a full-bodied mouthfeel. No sweet finish.' }).mouthfeel, []);
  assert.deepEqual(classify({ originalDescription: 'Zero bitterness.' }).taste, []);
});

test('styles, IBU, names and pairing do not manufacture sensory, ingredient or process facts', () => {
  const value = classify({ name: 'Coffee Chocolate Barrel Aged Milk Stout', style: 'Milk Stout', ibu: 120, srm: 80, abv: 12, foodPairings: ['coffee cake'], offCategories: ['en:wheat-beers'] });
  for (const dimension of Object.keys(FACETS)) assert.deepEqual(value[dimension], [], dimension);
  assert.deepEqual(classify({ style: 'Lambic' }).process, []);
  assert.deepEqual(classify({ style: 'Wheat Beer' }).ingredient, []);
});

test('raw recipe proves dry hopping but a coffee addition at that stage does not', () => {
  const beer = archive.find(item => item.id === 'archive-002');
  const value = classifyBeer(beer);
  assert.equal(value.family, 'ipa');
  assert.ok(value.process.includes('dry-hop'));
  assert.ok(value.ingredient.includes('hops'));
  assert.ok(value.evidence.find(item => item.dimension === 'process' && item.id === 'dry-hop')?.sourceUrl);
  const onlyCoffee = classify({ sourceRecord: { ingredients: { hops: [{ name: 'Cold Brew Coffee', add: 'Dry Hop', amount: { value: 20 } }] } } });
  assert.deepEqual(onlyCoffee.process, []);
  assert.deepEqual(onlyCoffee.ingredient, ['coffee']);
  assert.deepEqual(classify({ sourceRecord: { ingredients: { hops: [{ name: 'Cascade', add: 'Dry Hop', amount: { value: 0 } }] } } }).process, []);
});

test('recipe ingredients do not confuse malt names, flavor notes, optional tips or wooden casks with additions', () => {
  const value = classify({ malts: ['Chocolate', 'Chocolate Malt', 'Honey Malt', 'Coffee Malt', 'Wheat Malt', 'Flaked Oats'], flavors: ['咖啡', '巧克力'], sourceRecord: { method: { twist: 'Coffee beans: 20g. Lactose: 125g. Age this beer in Rye Whisky Casks.' } } });
  assert.deepEqual(value.ingredient, ['wheat', 'oats', 'coffee', 'lactose']);
  assert.deepEqual(value.process, ['barrel-aged']);
  assert.deepEqual(classify({ sourceRecord: { method: { twist: 'Try ageing in oak barrels with coffee, or vanilla pods.' } } }).process, []);
  assert.deepEqual(classify({ sourceRecord: { method: { twist: 'Try ageing in oak barrels with coffee, or vanilla pods.' } } }).ingredient, []);
  assert.deepEqual(classify({ sourceRecord: { ingredients: { additions: [{ name: 'Coffee flavor' }] } } }).ingredient, []);
  assert.deepEqual(classify({ sourceRecord: { method: { twist: 'Oak chips: 50g' } } }).process, []);
});

test('fermentation processes require actual explicit evidence', () => {
  const value = classify({ originalDescription: 'Bottle-conditioned beer. Mixed fermentation gives a complex character. Aged in oak barrels for 12 months.' });
  assert.deepEqual(value.process, ['barrel-aged', 'mixed-fermentation', 'bottle-conditioned']);
  assert.deepEqual(classify({ originalDescription: 'Not bottle-conditioned. Never barrel-aged. May use mixed fermentation.' }).process, []);
});

test('the entire local catalogue has valid IDs, deterministic output, evidence and no mutations', () => {
  const families = new Set(STYLE_FAMILIES.map(row => row.id));
  for (const collection of ['world', 'archive', 'off', 'openbeer']) {
    for (const beer of read(collection)) {
      const before = JSON.stringify(beer);
      const value = classifyBeer(beer);
      assert.equal(JSON.stringify(beer), before, beer.id);
      assert.deepEqual(classifyBeer(beer), value, beer.id);
      assert.ok(families.has(value.family), beer.id);
      for (const [dimension, options] of Object.entries(FACETS)) {
        const ids = new Set(options.map(row => row.id));
        assert.equal(new Set(value[dimension]).size, value[dimension].length, beer.id);
        for (const id of value[dimension]) {
          assert.ok(ids.has(id), `${beer.id}: ${dimension} ${id}`);
          assert.ok(value.evidence.some(item => item.dimension === dimension && item.id === id && item.text), beer.id);
        }
      }
      if (collection === 'off') assert.deepEqual(value.aroma, [], beer.id);
    }
  }
});
