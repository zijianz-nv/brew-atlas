import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeLocalCatalog} from './build-local-catalog.mjs';
import {buildCuratedCatalog} from './build-curated-catalog.mjs';
const load=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
const awards=await load('research/untappd-awards-2026-09-21/identified-awards.json');
const seeds=await load('research/curated-catalog/representative-seeds.json');
const facts=await load('research/curated-catalog/award-enrichment-existing-facts.json');

test('same brewery ID fills local-language search aliases without replacing verified coordinates',()=>{
 const original={id:'yukon',name:'Yukon',city:'Whitehorse',lat:60.72,lng:-135.05,locationVerified:true,sourceUrls:['https://example.org/location'],locationEvidence:{reviewed:true}};
 const beer={id:'one',name:'Grizzly',breweryId:'yukon'};
 const supplement={...original,lat:61,lng:-136,cityZh:'白马市',regionZh:'育空',cityAliases:['白马'],sourceUrls:['https://example.org/official']};
 const {catalog}=mergeLocalCatalog([{collection:'old',catalog:{metadata:{},breweries:[original],beers:[beer]}},{collection:'regional',catalog:{metadata:{},breweries:[supplement],beers:[]}}]);
 const merged=catalog.breweries[0];
 assert.equal(merged.cityZh,'白马市');assert.deepEqual(merged.cityAliases,['白马']);
 assert.equal(merged.lat,original.lat);assert.equal(merged.lng,original.lng);
 assert.deepEqual(merged.locationEvidence,original.locationEvidence);
 assert.deepEqual(merged.sourceUrls,['https://example.org/location','https://example.org/official']);
});

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

test('a verified image supplement replaces stale missing-cache status and preserves cutout provenance',()=>{
 const brewery={id:'reviewed-maker',name:'Reviewed maker',lat:30,lng:31,locationVerified:true};
 const old={id:'same-source-id',name:'Grizzly',breweryId:brewery.id,image:null,imageCacheStatus:'failed',craftStatus:'not_verified',sourceUrls:['https://example.org/original']};
 const supplement={...old,collection:'regional',description:'Reviewed product introduction.',image:'/images/regional/new.webp',imageThumbnail:'/images/regional/map.webp',imageOriginal:'/images/regional/cutouts/new.png',imageCacheStatus:'cached',imageDownloadUrl:'https://example.org/product.png',imageEvidence:{cacheStatus:'cached'},imageDerivation:{sourceImage:'/images/regional/original.png',rgbPixelsUnchanged:true},imageBeforeCutout:{image:'/images/regional/original.png'},sourceUrls:['https://example.org/official-product']};
 supplement.craftStatus='industrial_reference';supplement.catalogRole='industrial_reference';supplement.imageKind='product_packshot';
 const {catalog}=mergeLocalCatalog([{collection:'old',catalog:{metadata:{},breweries:[brewery],beers:[old]}},{collection:'regional',catalog:{metadata:{},breweries:[brewery],beers:[supplement]}}]);
 assert.equal(catalog.beers.length,1);
 const beer=catalog.beers[0];
 assert.equal(beer.imageCacheStatus,'cached');
 assert.equal(beer.craftStatus,'industrial_reference');assert.equal(beer.catalogRole,'industrial_reference');
 assert.equal(beer.imageKind,'product_packshot');
 assert.equal(beer.imageDownloadUrl,supplement.imageDownloadUrl);
 assert.deepEqual(beer.imageDerivation,supplement.imageDerivation);
 assert.deepEqual(beer.imageBeforeCutout,supplement.imageBeforeCutout);
 assert.equal(beer.mergedSourceRecords[0].imageEvidence.cacheStatus,'cached');
 assert.deepEqual(beer.sourceUrls,['https://example.org/original','https://example.org/official-product']);
});

test('exact award supplements preserve medals and keep product labels out of map photography',()=>{
 const brewery={id:'award-maker',name:'Award maker',lat:30,lng:31,locationVerified:true};
 const award={id:'award-1',name:'Exact beer',breweryId:brewery.id,image:null,collection:'awards',awards:[{medal:'Gold',ratingYear:2025}],abv:5};
 const label={...award,awards:[],description:'Original beer introduction.',labelImage:'/images/awards/label.webp',labelImageSource:'https://example.org/exact-beer-label.png',sourceConflicts:[{field:'abv',oldValue:5,newValue:5.5}],sourceNote:'Label only; no bottle photo found.'};
 const {catalog}=mergeLocalCatalog([{collection:'awards',catalog:{metadata:{},beers:[award],breweries:[brewery]}},{collection:'awards',catalog:{metadata:{},beers:[label],breweries:[brewery]}}]);
 assert.equal(catalog.beers.length,1);assert.equal(catalog.beers[0].image,null);
 assert.equal(catalog.beers[0].labelImage,label.labelImage);
 assert.deepEqual(catalog.beers[0].awards,award.awards);
 assert.equal(catalog.beers[0].abv,5);
 assert.deepEqual(catalog.beers[0].sourceConflicts,label.sourceConflicts);
 assert.equal(catalog.metadata.counts.mapReadyBeers,0);
});

test('reviewed sensory supplements preserve separate evidence and do not overwrite award identity',()=>{
 const brewery={id:'maker',name:'Maker',lat:30,lng:31,locationVerified:true};
 const coffee={dimension:'ingredient',id:'coffee',sourceUrl:'https://example.org/official',text:'官方列出咖啡',reviewStatus:'reviewed_product_evidence'};
 const texture={dimension:'mouthfeel',id:'creamy',sourceUrl:'https://example.org/beer',text:'官方描述顺滑口感',reviewStatus:'reviewed_product_evidence'};
 const award={id:'exact',name:'Exact award beer',breweryId:'maker',awards:[{medal:'Gold',ratingYear:2025}],sensoryFacts:[coffee],abv:8};
 const supplement={id:'exact',name:award.name,breweryId:'maker',sensoryFacts:[coffee,texture],sourceUrls:[texture.sourceUrl]};
 const {catalog}=mergeLocalCatalog([{collection:'awards',catalog:{metadata:{},breweries:[brewery],beers:[award]}},{collection:'awards',catalog:{metadata:{},breweries:[],beers:[supplement]}}]);
 const b=catalog.beers[0];assert.equal(catalog.beers.length,1);assert.deepEqual(b.awards,award.awards);assert.equal(b.abv,8);
 assert.deepEqual(b.sensoryFacts,[coffee,texture]);assert.ok(b.mergedFieldSources[0].fields.includes('sensoryFacts'));
});

test('reviewed 1995 White products replace historical facts while shared legacy breweries stay put',async()=>{
 const official=await load('public/data-sources/year-1995-american-whites.json');
 const legacyBreweries=[{id:'openbeer-brewery-23',name:'Old Allagash',lat:43,lng:-70,locationVerified:false},
  {id:'openbeer-brewery-399',name:'Coors Golden',city:'Golden',lat:39.75,lng:-105.22,locationVerified:true}];
 const old=official.beers.map((b,i)=>({id:b.id,name:b.name,breweryId:legacyBreweries[i].id,abv:i?5.4:5,
  description:'Historical catalogue description.',originalDescription:'Preserved old source text.',image:'/images/old/packshot.jpg',
  sourceUrls:['https://example.org/legacy'],awards:[{medal:'Gold',year:2000}],dataQualityFlags:['image_unavailable','craft_status_unknown']}));
 const shared={id:'another-coors-product',name:'Another beer',breweryId:'openbeer-brewery-399'};
 const {catalog,audit}=mergeLocalCatalog([{collection:'openbeer',catalog:{metadata:{},breweries:legacyBreweries,beers:[...old,shared]}},
  {collection:'regional',catalog:official}]);
 assert.equal(catalog.beers.length,3);
 for(const source of official.beers){
  const b=catalog.beers.find(x=>x.id===source.id);
  for(const field of ['abv','description','breweryId','image'])assert.equal(b[field],source[field]);
  assert.deepEqual(b.launchYearEvidence,source.launchYearEvidence);
  assert.deepEqual(b.descriptionEvidence,source.descriptionEvidence);
  assert.deepEqual(b.locationEvidence,source.locationEvidence);
  assert.deepEqual(b.awards,[{medal:'Gold',year:2000}]);
  assert.equal(b.originalDescription,'Preserved old source text.');
  assert.ok(!b.dataQualityFlags.includes('image_unavailable'));
 }
 assert.equal(catalog.breweries.find(b=>b.id==='openbeer-brewery-399').city,'Golden');
 assert.equal(catalog.beers.find(b=>b.id===shared.id).breweryId,'openbeer-brewery-399');
 assert.ok(audit.fieldConflicts.some(x=>x.id==='openbeer-4282'&&x.field==='abv'&&x.previous===5&&x.retained===5.2));
});

test('1995 reviewed overrides require exact product ID and product/history evidence',async()=>{
 const official=await load('public/data-sources/year-1995-american-whites.json');
 for(const mismatch of ['id','product','history']){
  const source=structuredClone(official.beers[0]);
  if(mismatch==='id')source.id='unreviewed-similar-white';
  if(mismatch==='product')source.descriptionEvidence.sourceUrl='https://example.org/not-reviewed';
  if(mismatch==='history')source.launchYearEvidence.sourceUrl='https://example.org/established-1995';
  const old={id:source.id,name:source.name,breweryId:'legacy',abv:5,description:'Existing facts.',image:'/images/old.jpg'};
  const {catalog}=mergeLocalCatalog([{collection:'old',catalog:{metadata:{},breweries:[{id:'legacy',name:'Legacy'}],beers:[old]}},
   {collection:'regional',catalog:{metadata:{},breweries:official.breweries,beers:[source]}}]);
  assert.equal(catalog.beers[0].abv,5,mismatch);assert.equal(catalog.beers[0].breweryId,'legacy',mismatch);
  assert.equal(catalog.beers[0].image,'/images/old.jpg',mismatch);assert.equal(catalog.beers[0].launchYearEvidence,undefined,mismatch);
 }
});

test('new US Lagunitas IPA keeps its own 1995 evidence and does not alias foreign or historical products',async()=>{
 const source=await load('public/data-sources/year-1995-lagunitas.json');
 const {catalog}=mergeLocalCatalog([{collection:'regional',catalog:source}]);
 assert.equal(catalog.beers.length,1);assert.equal(catalog.beers[0].id,'lagunitas-ipa-us');
 assert.equal(catalog.beers[0].launchYearEvidence.year,1995);
 assert.equal(catalog.beers[0].launchYearEvidence.kind,'first_release');
});
