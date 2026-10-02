import test from 'node:test';
import assert from 'node:assert/strict';
import {displayImagePaths,createArchiveRewriter} from './published-assets.mjs';
import {beerImageSource} from '../src/beer-image-source.mjs';

const revision = 'a'.repeat(40);
const raw = `https://raw.githubusercontent.com/zijianz-nv/brew-atlas/${revision}/public`;
const pictured = {id:'shown',name:'Shown beer',description:'A floral beer.',image:'/images/card.webp',
  imageOriginal:'/images/original.jpg',imageThumbnail:'/images/thumb.webp'};

test('retain every card/detail/map and unknown-year thumbnail while archiving unused original photos',()=>{
  const derivative = {...pictured,id:'cutout',image:'/images/cutout.webp',imageOriginal:'/images/raw-scene.jpg',imageEvidence:{derivative:true}};
  const partial = {id:'partial',image:'/images/unshown.jpg',imageThumbnail:'/images/year-unknown.webp'};
  const beers = [pictured,derivative,partial];
  const retained = displayImagePaths({beers});
  assert(retained.has('/images/original.jpg'));
  assert(retained.has('/images/year-unknown.webp'));
  assert(!retained.has('/images/raw-scene.jpg'));
  assert(!retained.has('/images/unshown.jpg'));
  const archive = createArchiveRewriter({revision,retainedPaths:retained,archivedPaths:['/images/raw-scene.jpg','/images/unshown.jpg']});
  const published = archive.json({beers});
  for (let i=0;i<beers.length;i++) {
    for (const variant of ['card','original','thumbnail']) assert.equal(beerImageSource(published.beers[i],variant),beerImageSource(beers[i],variant));
    assert.equal(published.beers[i].imageThumbnail,beers[i].imageThumbnail);
  }
  assert.equal(published.beers[1].imageOriginal,`${raw}/images/raw-scene.jpg`);
  assert.equal(beers[1].imageOriginal,'/images/raw-scene.jpg','source archive is never mutated');
});

test('archive unusual provenance fields, object keys and evidence files without changing records or external URLs',()=>{
  const archive = createArchiveRewriter({revision,retainedPaths:[],archivedPaths:['/images/a.jpg','/data-sources/evidence.json']});
  const input={id:'same',description:'unchanged description',zero:0,empty:null,
    full:'public/images/a.jpg',nested:{'/images/a.jpg':{original:'images/a.jpg'}},
    sourceUrl:'/data-sources/evidence.json',external:'https://brewery.example/images/a.jpg',
    query:'/images/a.jpg?download=1#photo'};
  const output=archive.json(input);
  assert.equal(output.full,`${raw}/images/a.jpg`);
  assert.equal(output.nested[`${raw}/images/a.jpg`].original,`${raw}/images/a.jpg`);
  assert.equal(output.sourceUrl,`${raw}/data-sources/evidence.json`);
  assert.equal(output.query,`${raw}/images/a.jpg?download=1#photo`);
  assert.equal(output.external,input.external);
  for(const key of ['id','description','zero','empty'])assert.equal(output[key],input[key]);
});

test('published notices link archived originals and directories but retain credits and external image sources',()=>{
  const archive=createArchiveRewriter({revision,retainedPaths:['/images/keep.webp'],archivedPaths:['/images/raw/a.jpg']});
  const output=archive.text('Credit stays. `/images/raw/a.jpg` [original](/images/raw/a.jpg). `/images/raw/` /images/keep.webp https://brewery.example/images/raw/a.jpg');
  assert(output.includes('Credit stays.'));
  assert(output.includes(`\`${raw}/images/raw/a.jpg\``));
  assert(output.includes(`(${raw}/images/raw/a.jpg)`));
  assert(output.includes(`https://github.com/zijianz-nv/brew-atlas/tree/${revision}/public/images/raw/`));
  assert(output.includes('/images/keep.webp'));
  assert(output.endsWith('https://brewery.example/images/raw/a.jpg'));
  assert.throws(()=>createArchiveRewriter({revision:'main',archivedPaths:[],retainedPaths:[]}),/immutable/);
});

test('relative source-data links remain usable after evidence moves to the archive',()=>{
 const archive=createArchiveRewriter({revision,retainedPaths:[],archivedPaths:['/data-sources/beertasting/brewery-locations.json']});
 assert.equal(archive.text('[coordinates](./brewery-locations.json#evidence)', '/data-sources/beertasting/NOTICE.md'),
  `[coordinates](${raw}/data-sources/beertasting/brewery-locations.json#evidence)`);
});
