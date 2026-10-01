import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeLocalCatalog} from './build-local-catalog.mjs';
import {buildCuratedCatalog} from './build-curated-catalog.mjs';
const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const awards=await load('research/untappd-awards-2026-09-21/identified-awards.json');
const seeds=await load('research/curated-catalog/representative-seeds.json');
const facts=await load('research/curated-catalog/award-enrichment-existing-facts.json');

test('reviewed historical facts fill selected beers without adding awards, images or coordinates',()=>{
 const before=buildCuratedCatalog(awards,seeds),after=buildCuratedCatalog(awards,seeds,{factSupplements:facts});
 assert.equal(after.beers.length,before.beers.length);
 for(const row of facts.records){const a=after.beers.find(b=>b.untappdId===row.untappdId),b=before.beers.find(b=>b.id===a.id);
  assert.deepEqual(a.awards,b.awards);assert.deepEqual(a.collections,b.collections);assert.equal(a.image,null);
  assert.equal(a.abv,row.fields.abv);assert.equal(a.ibu,row.fields.ibu);
  assert.deepEqual(after.breweries.find(x=>x.id===a.breweryId),before.breweries.find(x=>x.id===b.breweryId));
 }
});
test('facts reject identity mismatch and prohibited fields instead of weakening map or award evidence',()=>{
 const wrong=structuredClone(facts);wrong.records[0].expectedBrewery='Other Brewery';
 assert.throws(()=>buildCuratedCatalog(awards,seeds,{factSupplements:wrong}),/identity/);
 const unsafe=structuredClone(facts);unsafe.records[0].fields.image='/images/incorrect.png';
 assert.throws(()=>buildCuratedCatalog(awards,seeds,{factSupplements:unsafe}),/Forbidden/);
});
test('all local sources remain searchable and exact drink IDs merge without replacing stronger facts',()=>{
 const curated=buildCuratedCatalog(awards,seeds),target=curated.beers.find(b=>b.untappdId==='2238467');
 const local={metadata:{},breweries:[{id:'local-br',name:'Geist',lat:null,lng:null,locationVerified:false}],beers:[
  {id:'local-same',name:'Geist Witty Wit',breweryId:'local-br',untappdId:'2238467',abv:6,collection:'local'},
  {id:'local-distinct',name:'Geist Witty Wit',breweryId:'local-br',collection:'local',abv:4},
 ]};
 const {catalog,audit}=mergeLocalCatalog([{collection:'curated',catalog:curated},{collection:'local',catalog:local}]);
 assert.equal(catalog.beers.length,125);assert.equal(catalog.metadata.counts.awardsBeers,119);
 const merged=catalog.beers.find(b=>b.id===target.id);
 assert.equal(merged.abv,5);assert.deepEqual(merged.awards,target.awards);
 assert.ok(merged.collections.includes('local'));assert.ok(merged.collections.includes('representative'));
 assert.ok(catalog.beers.some(b=>b.id==='local-distinct'));assert.equal(audit.fieldConflicts.length,1);
 assert.deepEqual(merged.sourceRecordIds,[target.id,'local-same']);
});
test('restored world and archive geography keeps its reference role; unknown and historical locations stay off-map',async()=>{
 const inputs=await Promise.all(['world','archive','off','openbeer','beertasting'].map(async collection=>({collection,catalog:await load(`public/data/${collection}.json`)})));
 const {catalog}=mergeLocalCatalog(inputs);
 assert.equal(catalog.beers.length,9318);
 assert.ok(catalog.breweries.find(b=>b.id==='brewdog-ellon').locationVerified);
 assert.equal(catalog.breweries.find(b=>b.id==='brewdog-ellon').locationRole,'brand_reference');
 assert.ok(catalog.breweries.filter(b=>b.id.startsWith('beertasting-')).every(b=>b.locationVerified));
 assert.ok(catalog.breweries.filter(b=>b.id.startsWith('openbeer-')).every(b=>!b.locationVerified));
 assert.ok(catalog.breweries.filter(b=>b.locationPrecision==='unresolved_brand').every(b=>!b.locationVerified));
 assert.ok(catalog.metadata.counts.mapReadyBeers>600);
});
test('reviewed official aliases keep one product and retain both source memberships',async()=>{
 const curated=buildCuratedCatalog(awards,seeds),world=await load('public/data/world.json');
 const {catalog,audit}=mergeLocalCatalog([{collection:'curated',catalog:curated},{collection:'world',catalog:world}]);
 assert.equal(catalog.beers.length,124+31-2);
 assert.equal(audit.merged.filter(x=>x.reason==='reviewed_official_product').length,2);
 assert.ok(catalog.beers.find(b=>b.id==='curated-representative-official-sierra-nevada-pale-ale').collections.includes('world'));
});
