import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {mergeLocalCatalog} from './build-local-catalog.mjs';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
import {beerSearchText} from '../src/catalog-filters.mjs';
import {contentImageStyle} from '../src/photo-content-layout.mjs';

const catalog=JSON.parse(await readFile(new URL('../public/data/regional.json',import.meta.url),'utf8'));
const breweries=new Map(catalog.breweries.map(b=>[b.id,b]));
const http=url=>typeof url==='string'&&/^https?:\/\//.test(url);

test('regional additions have sourced locality references, without inventing factory precision or award status',()=>{
  assert.ok(catalog.beers.length>0);
  assert.ok(catalog.breweries.some(b=>b.country==='Kazakhstan'));
  assert.ok(catalog.breweries.some(b=>b.country==='Kyrgyzstan'));
  for(const brewery of catalog.breweries){
    assert.equal(brewery.locationVerified,true,brewery.id);
    assert.ok(Number.isFinite(brewery.lat)&&Math.abs(brewery.lat)<=90);
    assert.ok(Number.isFinite(brewery.lng)&&Math.abs(brewery.lng)<=180);
    assert.equal(brewery.locationPrecision,'city');
    assert.ok(http(brewery.locationEvidence?.identitySourceUrl));
    assert.ok(http(brewery.locationEvidence?.coordinateSourceUrl));
  }
  for(const beer of catalog.beers){
    assert.ok(breweries.has(beer.breweryId));
    assert.ok(hasDescribedPhoto(beer));
    assert.ok(contentImageStyle(beer,.52),`Product framing is required before map import: ${beer.id}`);
    assert.equal(beer.collection,'regional');
    assert.equal(beer.awards?.length||0,0);
    assert.ok(!(beer.collections||[]).some(c=>['awards','representative'].includes(c)));
    assert.ok(beer.sourceUrls?.length&&beer.sourceUrls.every(http));
    assert.ok(http(beer.imageSource));
    assert.ok(beer.ibu==null||(Number.isFinite(beer.ibu)&&beer.ibu>=0));
  }
});

test('regional coverage includes the requested localities and labels Egyptian industrial references honestly',()=>{
  for(const country of ['Kazakhstan','Kyrgyzstan','Russia','Australia','Italy','Egypt','Spain','United States','Japan'])
    assert.ok(catalog.breweries.some(b=>b.country===country),country);
  assert.ok(catalog.breweries.some(b=>b.country==='Australia'&&/Western Australia/i.test(b.region)));
  assert.ok(catalog.breweries.some(b=>b.country==='Italy'&&/Puglia|Sicily|Campania/i.test(b.region)));
  const mainlandStates=new Set(catalog.breweries.filter(b=>b.country==='United States'&&!['Hawaii','Alaska'].includes(b.region)).map(b=>b.region));
  assert.ok(mainlandStates.size>=3,'US mainland addition spans at least three states');
  for(const beer of catalog.beers.filter(b=>breweries.get(b.breweryId).country==='Egypt'))
    assert.equal(beer.craftStatus,'industrial');
});

test('every regional product has its own cached, verified packshot instead of a remote hotlink or repeated placeholder',async()=>{
  const hashes=new Set();
  for(const beer of catalog.beers){
    assert.match(beer.image,/^\/images\/(central-asia|regional)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(png|webp|jpe?g)$/);
    const bytes=await readFile(new URL('../public'+beer.image,import.meta.url));
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,beer.imageEvidence?.sha256,beer.id);
    assert.ok(!hashes.has(hash),`Repeated product image: ${beer.id}`);
    hashes.add(hash);
  }
});

test('indexed PNG transparency has usable content framing, including the six padded Beerfarm cans',async()=>{
  let indexedTransparent=0;
  for(const beer of catalog.beers){
    const bytes=await readFile(new URL('../public'+beer.image,import.meta.url));
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes[25]!==3)continue;
    let transparent=false;
    for(let offset=8;offset+12<=bytes.length;){
      const length=bytes.readUInt32BE(offset);
      assert.ok(offset+12+length<=bytes.length,'complete PNG chunk');
      if(bytes.toString('ascii',offset+4,offset+8)==='tRNS')transparent=true;
      offset+=length+12;
    }
    if(!transparent)continue;
    indexedTransparent++;
    const metadata=beer.imageContentBounds;
    assert.ok(contentImageStyle(beer,.52),`Indexed transparency must not fall back to full canvas: ${beer.id}`);
    assert.equal(metadata.width,bytes.readUInt32BE(16));
    assert.equal(metadata.height,bytes.readUInt32BE(20));
    assert.equal(metadata.originalSha256,beer.imageEvidence.sha256);
  }
  assert.ok(indexedTransparent>=6,'the real palette PNG regression fixtures are covered');
  const cans=catalog.beers.filter(b=>b.id.startsWith('regional-beerfarm-'));
  assert.ok(cans.length>=6);
  const visibleFractions=cans.map(beer=>{
    const metadata=beer.imageContentBounds,style=contentImageStyle(beer,.52);
    return metadata.bodyAlphaBounds.height/metadata.height*parseFloat(style.height)/100;
  });
  assert.ok(visibleFractions.every(value=>value>=.9&&value<=1),'visible can bodies fill their frame');
  assert.ok(Math.max(...visibleFractions)-Math.min(...visibleFractions)<.05,'same-format cans have comparable visible size');
});

test('Almaty local names return the same products and regional records enter the normal map catalogue',()=>{
  const matches=query=>catalog.beers.filter(beer=>beerSearchText(beer,breweries.get(beer.breweryId)).includes(query.toLowerCase())).map(beer=>beer.id).sort();
  const almaty=matches('Almaty');
  assert.ok(almaty.length>0);
  assert.deepEqual(matches('阿拉木图'),almaty);
  assert.deepEqual(matches('Алматы'),almaty);
  const {catalog:merged}=mergeLocalCatalog([{collection:'regional',catalog}]);
  assert.equal(merged.metadata.counts.mapReadyBeers,catalog.beers.length);
  assert.equal(merged.metadata.collectionCounts.regional,catalog.beers.length);
  assert.equal(merged.metadata.counts.awardsBeers,0);
});
