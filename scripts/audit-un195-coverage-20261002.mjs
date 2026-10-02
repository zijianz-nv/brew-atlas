import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {canonicalCountry} from '../src/country-selection.mjs';
import {isReviewedGenericBeerPhoto, createBeerPhotoIdentityIndex} from '../src/beer-photo-identity.mjs';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
const dir='research/award-country-expansion-2026-10-02';
const sources=[['un-Article3Members.html','Article3Members','member'],['un-members-metadata.html','Article4Members','member'],['un-UNObserverStates.html','UNObserverStates','observer']];
const extra={"Democratic People's Republic of Korea":'North Korea','Republic of Moldova':'Moldova',"Lao People's Democratic Republic":'Laos','Syrian Arab Republic':'Syria','United Republic of Tanzania':'Tanzania','United Kingdom of Great Britain and Northern Ireland':'United Kingdom','Iran (Islamic Republic of)':'Iran','Bolivia (Plurinational State of)':'Bolivia','Venezuela (Bolivarian Republic of)':'Venezuela','Micronesia (Federated States of)':'Micronesia','Brunei Darussalam':'Brunei','Holy See':'Holy See','State of Palestine':'Palestine','Naoero':'Nauru','Netherlands (Kingdom of the)':'Netherlands'};
const countries=new Map();const evidence=[];
for(const [file,page,status] of sources){
 const path=`.runtime/award-country-evidence/${file}`,html=fs.readFileSync(path,'utf8');let count=0;
 for(const m of html.matchAll(/<a href="unms\/en\/page\/(\d+)">([^<]+)<\/a>/g)){
  const unName=m[2].replaceAll('&#039;',"'").replaceAll('&amp;','&');const short=unName.replace(/ \(the\)$/,'');const country=canonicalCountry(extra[short]||short);countries.set(m[1],{unM49:m[1],unName,country,unStatus:status,unSourceUrl:`https://metadata.un.org/skosmos/unms/en/page/${m[1]}`});count++;
 }
 evidence.push({url:`https://metadata.un.org/skosmos/unms/en/page/${page}`,file:path,sha256:crypto.createHash('sha256').update(html).digest('hex'),retrievedAt:'2026-10-02',parsedCount:count});
}
assert.equal(countries.size,195);assert.equal([...countries.values()].filter(c=>c.unStatus==='member').length,193);assert.equal([...countries.values()].filter(c=>c.unStatus==='observer').length,2);
const catalog=JSON.parse(fs.readFileSync('public/data/catalog.json'));const brews=new Map(catalog.breweries.map(b=>[b.id,b]));const rows=new Map([...countries.values()].map(c=>[c.country,{...c,catalogueRecords:0,describedPhotos:0,mapReady:0,mapReadyBeerIds:[],verifiedBreweryIds:new Set(),minimum:2,target:3}]));const outside=new Map();
for(const beer of catalog.beers){const b=brews.get(beer.breweryId);const country=canonicalCountry(b?.country);let r=rows.get(country);if(!r){r=outside.get(country)||{country,catalogueRecords:0,mapReady:0};outside.set(country,r)}r.catalogueRecords++;const photo=hasDescribedPhoto(beer)&&!isReviewedGenericBeerPhoto(beer);const ready=photo&&b?.locationVerified&&Number.isFinite(b.lat)&&Number.isFinite(b.lng);if(rows.has(country)){if(photo)r.describedPhotos++;if(ready){r.mapReady++;r.mapReadyBeerIds.push(beer.id);r.verifiedBreweryIds.add(b.id);}}else if(ready)r.mapReady++;}
const result=[...rows.values()].map(r=>({...r,verifiedBreweryIds:[...r.verifiedBreweryIds],bucket:r.mapReady===0?'0':r.mapReady===1?'1':r.mapReady===2?'2':'3+',neededForMinimum:Math.max(0,2-r.mapReady),neededForTarget:Math.max(0,3-r.mapReady),scopeNote:r.country==='Holy See'?'Holy See is the UN observer entity; no imported or Italian-brewed Vatican-branded beer counted as local.':null})).sort((a,b)=>a.country.localeCompare(b.country));
const photoRows = catalog.beers.filter(beer => hasDescribedPhoto(beer) && !isReviewedGenericBeerPhoto(beer));
const photoIndex = createBeerPhotoIdentityIndex(photoRows);
const photoById = new Map(photoRows.map(beer => [beer.id, beer]));
const reviewedSources = new Map();
const currentRoundFiles = ['award-supplements.json','award-americas-supplements.json','award-asia-supplements.json','award-europe-africa-supplements.json','country-expansion.json','siberia-expansion.json','global-country-supplements.json','china-country-supplements.json','global-country-wave2.json'];
const currentRoundPaths=[...currentRoundFiles.map(file=>'public/data/'+file),...['asia-europe','africa','americas-oceania'].map(region=>`public/data-sources/global-coverage-${region}.json`),...['year-1995-american-whites','year-1995-lagunitas','sparse-asia-20261002','sparse-south-america-20261002','sparse-africa-20261002'].map(name=>`public/data-sources/${name}.json`)];
for (const path of currentRoundPaths) {
 if (!fs.existsSync(path)) continue;
 const input = JSON.parse(fs.readFileSync(path));
 const localBrews = new Map((input.breweries || []).map(b => [b.id, b]));
 for (const beer of input.beers || []) {
  const brewery = localBrews.get(beer.breweryId) || brews.get(beer.breweryId);
  const country = canonicalCountry(brewery?.country);
  if (!country) continue;
  const files = reviewedSources.get(country) || new Set(); files.add(path); reviewedSources.set(country, files);
 }
}
for (const r of result) {
 const identities = new Set(r.mapReadyBeerIds.map(id => photoIndex.identityFor(photoById.get(id)) || id));
 r.distinctMapPackshots = identities.size;
 r.coverageStatus = r.mapReady >= 3 ? 'target_3_met' : r.mapReady >= 2 ? 'minimum_2_met_target_3_open' : r.mapReady === 1 ? 'one_product_below_minimum' : 'no_verified_described_packshot_in_catalog';
 r.currentRoundEvidenceFiles = [...(reviewedSources.get(r.country) || [])];
 r.searchStatus = r.currentRoundEvidenceFiles.length ? 'public_sources_reviewed_this_round_not_exhaustive' : ['Mauritius','Zambia'].includes(r.country) ? 'public_list_reviewed_no_usable_increment_this_round' : r.catalogueRecords > 0 ? 'existing_catalogue_only_not_researched_this_round' : 'not_searched_this_round';
 r.searchStatusNote = 'A coverage gap or unsearched status does not mean the country has no beer. No exhaustive country search is claimed.';
}
const summary=Object.fromEntries(['0','1','2','3+'].map(k=>[k,result.filter(r=>r.bucket===k).length]));
const priority=['Ethiopia','Côte d’Ivoire','Ghana','Ecuador','Vietnam'];const out={createdAt:new Date().toISOString(),catalogueRecords:catalog.beers.length,countryCount:195,unMemberStates:193,unObserverStates:2,evidence,distinctPhotoMinimumSatisfied:result.filter(r=>r.distinctMapPackshots>=2).length,distinctPhotoTargetSatisfied:result.filter(r=>r.distinctMapPackshots>=3).length,searchStatusCounts:Object.fromEntries([...new Set(result.map(r=>r.searchStatus))].map(k=>[k,result.filter(r=>r.searchStatus===k).length])),scope:'UN 193 members plus Holy See and State of Palestine. Territories and other separately named geographic entities are retained outside this 195-country count; it is not the map-feature list.',countingRule:'A product counts by its verified brewery country/city reference, with a described photo excluding reviewed generic draught placeholders. Importer or retailer country does not establish producer origin. Existing locationRole may be a city/brewpub reference rather than a verified factory. Counts describe catalogue map eligibility, not simultaneous screen visibility, unique photo identities, local craft status, market sales or complete country coverage.',summary,coveredAtLeastOne:result.filter(r=>r.mapReady>0).length,minimumSatisfied:result.filter(r=>r.mapReady>=2).length,targetSatisfied:result.filter(r=>r.mapReady>=3).length,additionalProductsNeededForMinimum:result.reduce((s,r)=>s+r.neededForMinimum,0),additionalProductsNeededForTarget:result.reduce((s,r)=>s+r.neededForTarget,0),priorityCountries:priority.map(c=>result.find(r=>r.country===c)),countries:result,outside195:[...outside.values()].sort((a,b)=>a.country.localeCompare(b.country))};fs.writeFileSync(`${dir}/un195-coverage.json`,JSON.stringify(out,null,2)+'\n');fs.writeFileSync(`${dir}/un195-source-list.json`,JSON.stringify({evidence,countries:[...countries.values()]},null,2)+'\n');console.log(JSON.stringify({catalog:catalog.beers.length,summary,priority:out.priorityCountries.map(r=>[r.country,r.mapReady]),minimum:out.minimumSatisfied,target:out.targetSatisfied}));
