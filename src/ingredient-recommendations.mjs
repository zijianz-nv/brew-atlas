import {beerIntroduction} from './beer-photo-eligibility.mjs';
import {hasRecommendableBeerPhoto} from './random-beer.mjs';
import {canonicalCountry} from './country-selection.mjs';
import {classifyBeer} from './beer-taxonomy.mjs';
import {beerPhotoIdentityKeys,createBeerPhotoIdentityIndex} from './beer-photo-identity.mjs';
import {compareBeerPhotoRank} from './beer-ranking.mjs';

const radians=x=>x*Math.PI/180;
export function regionDistanceKm(a,b){
 const dlat=radians(b.lat-a.lat),dlng=radians(b.lng-a.lng);
 const h=Math.sin(dlat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dlng/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
function ingredientEvidence(type,taxonomy){
 const facet={cocoa:'cacao',coriander:'spice',citrus:'fruit'}[type]||type;
 return (taxonomy.evidence||[]).find(e=>e.dimension==='ingredient'&&e.id===facet&&e.sourceUrl
  &&(type!=='coriander'||/coriander|芫荽|香菜籽/i.test(e.text))
  &&(type!=='citrus'||/citrus|orange|lemon|grapefruit|柑橘|橙|柠檬|葡萄柚/i.test(e.text)));
}
/** Real local drinks first; documented ingredient examples are explicitly nonlocal.
 * Never implies that a beer buys ingredients from the displayed growing region.
 */
export function recommendRegionBeers(region,beers,breweries,{taxonomyIndex={},limit=3}={}){
 if(!region)return [];
 const lookup=breweries instanceof Map?id=>breweries.get(id):id=>breweries[id];
 const candidates=[];
 for(const beer of beers){
  const brewery=lookup(beer.breweryId);
  if(!hasRecommendableBeerPhoto(beer)||!brewery?.locationVerified||!Number.isFinite(brewery.lat)||!Number.isFinite(brewery.lng))continue;
  const taxonomy=taxonomyIndex[beer.id]||classifyBeer(beer),evidence=ingredientEvidence(region.type,taxonomy);
  const sameCountry=canonicalCountry(region.country)===canonicalCountry(brewery.country);
  if(!sameCountry&&!evidence)continue;
  const distanceKm=regionDistanceKm(region,brewery),nearby=sameCountry&&distanceKm<=350;
  const scope=nearby?'nearby':sameCountry?'country':'ingredient';
  const score=(nearby?4:sameCountry?2:0)+Number(Boolean(evidence));
  candidates.push({beer,brewery,scope,distanceKm,evidence,score,
   summary:beerIntroduction(beer).replace(/\s+/g,' ').slice(0,90)});
 }
 candidates.sort((a,b)=>b.score-a.score||a.distanceKm-b.distanceKm||a.beer.id.localeCompare(b.beer.id));
 const selected=[],photos=new Set(),ids=new Set();
 for(const item of candidates){
  const keys=beerPhotoIdentityKeys(item.beer);
  if(ids.has(item.beer.id)||keys.some(k=>photos.has(k)))continue;
  selected.push(item);ids.add(item.beer.id);keys.forEach(k=>photos.add(k));
  if(selected.length>=Math.min(3,Math.max(1,limit)))break;
 }
 return selected;
}

/** Allocate a shared pool in rounds: each region gets at most one beer before
 * any region gets a second. Bottle identities and beer IDs are globally unique.
 * Eligibility still requires local brewing country or actual ingredient evidence.
 */
export function allocateRegionBeerRecommendations(regions,beers,breweries,{taxonomyIndex={},limit=3,identityIndex=createBeerPhotoIdentityIndex(beers)}={}){
 const result=new Map(),lookup=breweries instanceof Map?id=>breweries.get(id):id=>breweries[id];
 const cap=Math.min(3,Math.max(0,Number.isFinite(limit)?Math.floor(limit):3));
 const entries=[];
 for(const beer of beers){
  const brewery=lookup(beer.breweryId);
  if(!hasRecommendableBeerPhoto(beer,{identityIndex})||!brewery?.locationVerified||!Number.isFinite(brewery.lat)||!Number.isFinite(brewery.lng))continue;
  entries.push({beer,brewery,taxonomy:taxonomyIndex[beer.id]||classifyBeer(beer),keys:beerPhotoIdentityKeys(beer)});
 }
 for(const entry of entries){const identity=identityIndex.identityFor(entry.beer);if(identity)entry.keys.push(`canonical:${identity}`);}
 const pools=[];
 for(const region of regions){
  if(!region?.id||result.has(region.id))continue;
  result.set(region.id,[]);
  const items=[];
  for(const entry of entries){
   const {beer,brewery,taxonomy,keys}=entry,evidence=ingredientEvidence(region.type,taxonomy);
   const sameCountry=canonicalCountry(region.country)===canonicalCountry(brewery.country);
   if(!sameCountry&&!evidence)continue;
   const distanceKm=regionDistanceKm(region,brewery),nearby=sameCountry&&distanceKm<=350;
   items.push({beer,brewery,keys,evidence,distanceKm,scope:nearby?'nearby':sameCountry?'country':'ingredient',
    score:(nearby?4:sameCountry?2:0)+Number(Boolean(evidence)),summary:beerIntroduction(beer).replace(/\s+/g,' ').slice(0,90)});
  }
  // Actual brewing country takes priority over nonlocal ingredient examples.
  // Rank awards/sales within that group, then relevance and deterministic ID.
  items.sort((a,b)=>Number(a.scope==='ingredient')-Number(b.scope==='ingredient')||compareBeerPhotoRank({...a.beer,id:''},{...b.beer,id:''})||b.score-a.score||a.distanceKm-b.distanceKm||String(a.beer.id).localeCompare(String(b.beer.id)));
  pools.push({region,items});
 }
 // Give scarce candidate pools first choice to avoid starving a region that has
 // one bottle while a neighbouring region has several equally valid options.
 pools.sort((a,b)=>a.items.length-b.items.length||String(a.region.id).localeCompare(String(b.region.id)));
 const usedIds=new Set(),usedPhotos=new Set();
 for(let round=0;round<cap;round++){
  // First reserve one local drink per region in this round, so an ingredient
  // example elsewhere cannot consume a sparse country's last local bottle.
  const assigned=new Set();
  for(const nonlocal of [false,true])for(const {region,items} of pools){
   if(assigned.has(region.id))continue;
   const item=items.find(x=>(x.scope==='ingredient')===nonlocal&&!usedIds.has(x.beer.id)&&!x.keys.some(k=>usedPhotos.has(k)));
   if(!item)continue;
   const {keys,...recommendation}=item;
   result.get(region.id).push(recommendation);assigned.add(region.id);usedIds.add(item.beer.id);keys.forEach(k=>usedPhotos.add(k));
  }
 }
 return result;
}
