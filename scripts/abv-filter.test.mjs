import test from 'node:test';
import assert from 'node:assert/strict';
import { ABV_DOMAIN, ABV_SLIDER_STEPS, normalizeAbvRange, matchesAbvRange, abvToSliderPosition, sliderPositionToAbv, formatAbv } from '../src/abv-filter.mjs';

test('unlimited includes missing ABV while an explicit full range only includes valid numeric values', () => {
  const records = [{abv:null},{},{abv:undefined},{abv:NaN},{abv:'5'},{abv:0},{abv:4.5},{abv:70},{abv:99.99},{abv:-1},{abv:101}];
  assert.equal(records.filter(beer => matchesAbvRange(beer,null)).length, records.length);
  assert.deepEqual(records.filter(beer => matchesAbvRange(beer,{min:0,max:100})).map(beer=>beer.abv),[0,4.5,70,99.99]);
  assert.deepEqual(records.filter(beer => matchesAbvRange(beer,{min:0,max:0})).map(beer=>beer.abv),[0]);
});

test('ABV boundaries are inclusive and independent from arbitrary coarse strength buckets', () => {
  const range={min:4.5,max:7.1};
  for(const abv of [4.5,5,7,7.1]) assert.equal(matchesAbvRange({abv},range),true);
  for(const abv of [0,4.49,7.10001,12,null]) assert.equal(matchesAbvRange({abv},range),false);
  assert.equal(matchesAbvRange({abv:5},{min:7,max:4}),false);
  assert.equal(matchesAbvRange({abv:5},{min:NaN,max:100}),false);
});

test('normalization supports equal endpoints, clamps bounds, preserves inputs and never turns empty into zero', () => {
  const range={min:7.14,max:4.46}, before=structuredClone(range);
  assert.deepEqual(normalizeAbvRange(range),{min:4.5,max:7.1});
  assert.deepEqual(range,before);
  assert.deepEqual(normalizeAbvRange({min:-4,max:108}),{min:0,max:100});
  assert.deepEqual(normalizeAbvRange({min:0,max:0}),{min:0,max:0});
  assert.equal(normalizeAbvRange(null),null);
  assert.equal(normalizeAbvRange({min:null,max:7}),null);
  assert.equal(normalizeAbvRange({min:'0',max:7}),null);
  assert.equal(normalizeAbvRange({min:0,max:Infinity}),null);
});

test('the stable slider domain covers high-strength sources and does not depend on current search results', () => {
  assert.deepEqual(ABV_DOMAIN,{min:0,max:100,step:.1});
  assert.equal(abvToSliderPosition(0),0);
  assert.equal(abvToSliderPosition(100),ABV_SLIDER_STEPS);
  assert.equal(sliderPositionToAbv(-100),0);
  assert.equal(sliderPositionToAbv(ABV_SLIDER_STEPS+10),100);
  assert.equal(sliderPositionToAbv(NaN),null);
  assert.equal(sliderPositionToAbv(100,{min:10,max:0,step:.1}),null);
  assert.ok(abvToSliderPosition(10)>ABV_SLIDER_STEPS*.3,'common strengths get enough physical track width');
});

test('all selectable tenth-percent ABVs round-trip and the non-linear track stays monotonic', () => {
  let previous=-1;
  for(let tick=0;tick<=1000;tick++){
    const abv=tick/10, position=abvToSliderPosition(abv);
    assert.ok(position>=previous);
    assert.equal(sliderPositionToAbv(position),abv);
    previous=position;
  }
  assert.equal(formatAbv(0),'0%');
  assert.equal(formatAbv(4.5),'4.5%');
  assert.equal(formatAbv(null),'未提供');
});
