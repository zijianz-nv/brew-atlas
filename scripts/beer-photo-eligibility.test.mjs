import test from 'node:test';
import assert from 'node:assert/strict';
import {beerIntroduction, hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

test('a picture, name, rating, or style alone does not qualify as an introduced beer', () => {
  const beer = {name:'IPA', image:'/images/ipa.webp', style:'India Pale Ale', abv:6, rating:4.5};
  for (const description of ['', '  ', null, '来源未提供酒款描述。', 'No description available.', 'IPA', '<p>&nbsp;</p>', '123']) {
    assert.equal(hasDescribedPhoto({...beer, description}), false, String(description));
  }
  assert.equal(hasDescribedPhoto({...beer, description:'Citrus hop aroma and a dry finish.'}), true);
  assert.equal(hasDescribedPhoto({...beer, image:null, description:'Citrus hop aroma and a dry finish.'}), false);
});

test('original introductions remain usable without inventing a translation or changing source data', () => {
  const beer = Object.freeze({name:'Test', image:'/images/test.webp', description:'暂无介绍', originalDescription:'<p>柑橘香气，干爽收尾。</p>'});
  assert.equal(beerIntroduction(beer), '柑橘香气，干爽收尾。');
  assert(hasDescribedPhoto(beer));
  assert.equal(beer.originalDescription, '<p>柑橘香气，干爽收尾。</p>');
});
