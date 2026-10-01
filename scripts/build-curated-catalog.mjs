#!/usr/bin/env node
// Selection comes from awards and representative seeds. Reviewed facts from
// other catalogues may enrich selected IDs; never restore legacy membership.
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditAwards, classifyDrinkStyle} from './untappd-awards-quality.mjs';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
import {applyFactSupplements} from './curated-fact-supplements.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const countries = {
  CN:['China','中国'], IN:['India','印度'], NZ:['New Zealand','新西兰'],
  ZA:['South Africa','南非'], JP:['Japan','日本'], AU:['Australia','澳大利亚'],
  BE:['Belgium','比利时'], DE:['Germany','德国'], BR:['Brazil','巴西'],
  CA:['Canada','加拿大'], US:['United States','美国'], MX:['Mexico','墨西哥'],
  AR:['Argentina','阿根廷'],
};
const hash = text => createHash('sha256').update(text).digest('hex');
const norm = text => String(text || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const unique = items => [...new Set(items.filter(Boolean))];
const http = url => typeof url === 'string' && /^https?:\/\//.test(url);
const nullable = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = value => Number.isFinite(value) ? value : null;
function country(code, fallback) {
  return {countryCode:code || null, country:countries[code]?.[0] || fallback || null,
    countryZh:countries[code]?.[1] || fallback || null};
}
function emptyBeer(id, name, breweryId, style) {
  return {id,name,breweryId,style:nullable(style),styleZh:null,abv:null,ibu:null,srm:null,
    description:null,originalDescription:null,flavors:[],hops:[],malts:[],yeast:null,
    foodPairings:[],firstBrewed:null,image:null,imageOriginal:null,imageThumbnail:null,
    imageCredit:null,imageSource:null,sourceUrls:[],sourceEvidence:[],sourceNote:null,
    rating:null,ratingsCount:null,awards:[],representativeReason:null,
    representativeStatus:null,craftStatus:'not_verified'};
}
function emptyBrewery(id, name, regionCode, region, countryBasis) {
  return {id,name,nameZh:null,...country(regionCode,region),countryBasis,city:null,
    lat:null,lng:null,locationVerified:false,locationPrecision:null,locationRole:null,
    locationSourceUrl:null,coordinateSourceUrl:null,year:null,website:null,
    description:null,sourceUrls:[]};
}
function sourceEvidence(row) {
  const p = row.provenance;
  // Keep the reproducible hash without exposing the developer's absolute paths.
  return {url:p.source_url,role:'award_list',retrievedAt:p.observed_at,
    ratingText:p.rating_text,sha256:p.source_sha256 || null,
    accessMethod:p.access_method || 'public page',detailHeaderVerified:row.detail_verification?.header_available === true};
}

export function buildCuratedCatalog(awardsInput, seedsInput, {createdAt = new Date().toISOString(),enrichments = {records:[]},factSupplements = {records:[]}} = {}) {
  const observations = awardsInput.records || [];
  const audit = auditAwards({records:observations}, {expectedAwardYear:awardsInput.rating_year});
  if (!audit.passed) throw new Error(`Award evidence failed validation: ${audit.errors.length} errors, ${audit.conflicts.length} conflicts`);
  const beers = new Map(), breweries = new Map(), excluded = [];
  let duplicateObservations = 0;
  for (const row of observations) {
    const quarantined = row.geographic_eligibility === 'quarantine'
      || (row.quality_notes || []).some(note => /geographic_scope_ambiguous/.test(note))
      || !row.award_region_code;
    if (quarantined || classifyDrinkStyle(row.style).kind !== 'beer_candidate') {
      excluded.push({drinkId:row.drink_id,reason:quarantined?'geography_unresolved':'non_beer_or_unclassified'});
      continue;
    }
    const id = `curated-award-${row.drink_id}`;
    const breweryId = `curated-award-brewery-${hash(`${row.award_region_code}|${norm(row.producer_name)}`).slice(0,16)}`;
    if (!breweries.has(breweryId)) breweries.set(breweryId,
      emptyBrewery(breweryId,row.producer_name,row.award_region_code,row.award_region,'award_region'));
    const brewery = breweries.get(breweryId);
    brewery.sourceUrls = unique([...brewery.sourceUrls,row.provenance.source_url]);
    if (!beers.has(id)) beers.set(id, {...emptyBeer(id,row.name,breweryId,row.style),
      untappdId:row.drink_id,collection:'awards',collections:['awards'],
      sourceNote:'Untappd 公开获奖列表；按评分年份记录。独立精酿属性、酒款介绍、图片及酒厂坐标尚待核验。'});
    const beer = beers.get(id);
    if (norm(beer.name) !== norm(row.name) || beer.breweryId !== breweryId)
      throw new Error(`Conflicting product identity for Untappd ${row.drink_id}`);
    const award = {ratingYear:row.award_year,ceremonyYear:row.ceremony_year ?? null,
      region:row.award_region,regionCode:row.award_region_code,scope:row.award_scope,
      type:row.award_type,medal:row.medal,rating:row.annual_award_rating,
      ratingCount:row.rating_count ?? null,style:row.style,sourceUrl:row.provenance.source_url,
      detailUrl:row.detail_url,observedAt:row.provenance.observed_at};
    const awardKey = a => JSON.stringify([a.ratingYear,a.regionCode,a.region,a.scope,a.type,a.style]);
    const previous = beer.awards.find(a => awardKey(a) === awardKey(award));
    if (previous && (previous.medal !== award.medal || previous.rating !== award.rating))
      throw new Error(`Conflicting annual award for Untappd ${row.drink_id}`);
    if (previous) duplicateObservations += 1;
    else beer.awards.push(award);
    beer.sourceUrls = unique([...beer.sourceUrls,award.sourceUrl,award.detailUrl]);
    const evidence = sourceEvidence(row);
    if (!beer.sourceEvidence.some(p => p.url === evidence.url && p.sha256 === evidence.sha256)) beer.sourceEvidence.push(evidence);
  }
  const officialInputs = [...(seedsInput.records || []).map(seed=>({seed,representative:true})),
    ...(enrichments.records || []).map(seed=>({seed,representative:false}))];
  const enrichedIds = new Set();
  for (const {seed,representative} of officialInputs) {
    if (!seed.id || !seed.name || !seed.brewery || (representative&&!seed.representativeReason) || (!representative&&!seed.untappdId))
      throw new Error('Official record needs id, name, brewery and either editorial reason or award identity');
    const matched = seed.untappdId ? beers.get(`curated-award-${seed.untappdId}`) : null;
    if (seed.untappdId && (!matched || seed.identityEvidence?.status !== 'reviewed_same_product'
      || !seed.identityEvidence.sources?.some(url=>matched.sourceUrls.includes(url))))
      throw new Error(`Unverified cross-source identity for ${seed.id}`);
    if (matched) {
      const previousBrewery = breweries.get(matched.breweryId);
      if (norm(matched.name) !== norm(seed.name) || norm(previousBrewery.name) !== norm(seed.brewery)
        || previousBrewery.countryCode !== seed.countryCode) throw new Error(`Identity evidence conflicts for ${seed.id}`);
    }
    const id = matched?.id || `curated-representative-${seed.id}`;
    if (enrichedIds.has(id) || (beers.has(id) && !matched))
      throw new Error(`Duplicate representative seed ${seed.id}`);
    enrichedIds.add(id);
    const breweryId = matched?.breweryId || `curated-representative-brewery-${hash(`${seed.countryCode}|${norm(seed.brewery)}`).slice(0,16)}`;
    const brewery = emptyBrewery(breweryId,seed.brewery,seed.countryCode,seed.country,'official_brewery_location');
    const located = seed.locationVerified === true && Number.isFinite(seed.lat) && Math.abs(seed.lat) <= 90
      && Number.isFinite(seed.lng) && Math.abs(seed.lng) <= 180
      && !!nullable(seed.city) && http(seed.locationSourceUrl) && http(seed.coordinateSourceUrl);
    Object.assign(brewery,{city:nullable(seed.city),lat:located?seed.lat:null,lng:located?seed.lng:null,
      locationVerified:located,locationPrecision:located?(seed.locationPrecision || 'city'):null,
      locationRole:located?(seed.locationRole || 'brewery_city_reference'):null,
      locationSourceUrl:seed.locationSourceUrl || null,coordinateSourceUrl:seed.coordinateSourceUrl || null,
      locationNote:seed.locationNote || null,
      coordinateSourcePageId:seed.coordinateSourcePageId || null,
      coordinateSourceSha256:seed.sourceEvidence?.coordinatePageSha256 || null,
      website:seed.breweryUrl || null,sourceUrls:unique([seed.locationSourceUrl,seed.coordinateSourceUrl])});
    // A second verified product at the same brewery may lack address detail;
    // that omission must not erase this batch's already verified location.
    const previousLocation = breweries.get(breweryId);
    if (!located && previousLocation?.locationVerified) breweries.set(breweryId,previousLocation);
    else breweries.set(breweryId,brewery);
    const image = seed.imageOriginal || null;
    if (image && (!image.startsWith('/images/curated/') || image.includes('..')))
      throw new Error(`New seed must use its freshly acquired local image: ${seed.id}`);
    const urls = unique((seed.sources || []).map(p => p.url));
    if (!urls.length || !urls.every(http)) throw new Error(`Missing official source links for ${seed.id}`);
    const beer = {...emptyBeer(id,seed.name,breweryId,seed.styleOriginal),
      collection:matched?'awards':'representative',
      collections:representative?(matched?['awards','representative']:['representative']):['awards'],
      awards:matched?.awards || [],untappdId:matched?.untappdId || null,
      abv:number(seed.abv),ibu:number(seed.ibu),description:nullable(seed.description),
      originalDescription:nullable(seed.descriptionOriginal),image,imageOriginal:image,imageThumbnail:image,
      imageCredit:seed.brewery,imageSource:seed.imageSourceUrl || null,
      imageEvidence:seed.imageEvidence || null,imageKind:seed.imageKind || 'official_product_packshot',
      imageContentBounds:seed.imageContentBounds || null,officialProductName:seed.officialProductName || seed.name,
      sourceUrls:unique([...urls,seed.locationSourceUrl,seed.coordinateSourceUrl,...(matched?.sourceUrls || [])]),
      sourceEvidence:[...seed.sources,...(matched?.sourceEvidence || [])],
      fieldEvidence:seed.sourceEvidence || null,identityEvidence:seed.identityEvidence || null,
      sourceNote:[representative?'依据官网重新核验的代表样本。':'依据对应产品来源补齐获奖酒款资料；年度奖项与商品资料分别归因。',
        seed.locationNote || (located?'位置为酒厂所在城市参考点。':'城市位置仍待核验。'),seed.sourceNote].filter(Boolean).join(' '),
      descriptionMethod:seed.descriptionMethod || null,
      representativeReason:representative?seed.representativeReason:null,representativeStatus:representative?'editorial_seed':null,
      craftStatus:seed.craftStatus || 'not_verified'};
    beers.set(id,beer);
  }
  const supplementalFacts = applyFactSupplements(beers,breweries,factSupplements);
  // The same freshly verified brewery may supply both a representative and an
  // award winner. Join only identical names/countries/cities with the same
  // official address-source domain; do not fuzzy-match production sites.
  const verifiedBreweries = new Map();
  let deduplicatedBreweryRecords = 0;
  for (const brewery of [...breweries.values()].sort((a,b)=>a.id.localeCompare(b.id))) {
    if (!brewery.locationVerified || brewery.locationPrecision !== 'city') continue;
    const domain = new URL(brewery.locationSourceUrl).hostname.replace(/^www\./,'');
    const key = [brewery.countryCode,norm(brewery.name),norm(brewery.city),domain].join('|');
    const same = verifiedBreweries.get(key);
    if (same && Math.abs(same.lat-brewery.lat)<0.05 && Math.abs(same.lng-brewery.lng)<0.05) {
      for (const beer of beers.values()) if (beer.breweryId===brewery.id) beer.breweryId=same.id;
      same.sourceUrls=unique([...same.sourceUrls,...brewery.sourceUrls]);
      same.mergedSourceIds=unique([...(same.mergedSourceIds || []),brewery.id]);
      breweries.delete(brewery.id);deduplicatedBreweryRecords++;
    } else verifiedBreweries.set(key,brewery);
  }
  const list = [...beers.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const breweryList = [...breweries.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const counts = {beers:list.length,breweries:breweryList.length,
    awardsBeers:list.filter(b=>b.collections.includes('awards')).length,
    representativeBeers:list.filter(b=>b.collections.includes('representative')).length,
    overlappingBeers:list.filter(b=>b.collections.includes('representative')&&b.collections.includes('awards')).length,
    picturedBeers:list.filter(hasDescribedPhoto).length,
    mapReadyBeers:list.filter(b=>hasDescribedPhoto(b)&&breweries.get(b.breweryId).locationVerified).length,
    awardMapReadyBeers:list.filter(b=>b.collections.includes('awards')&&hasDescribedPhoto(b)&&breweries.get(b.breweryId).locationVerified).length,
    countries:new Set(breweryList.map(b=>b.countryCode).filter(Boolean)).size};
  return {metadata:{id:'awards-representative-v1',schemaVersion:2,createdAt,partial:true,
    targetRepresentativeCount:1000,counts,
    basis:['untappd_awards','official_brewery_representatives'],legacyCatalogsLoaded:false,
    supplementalFacts,
    completeness:{images:list.filter(b=>!!b.image).length,descriptions:list.filter(b=>!!b.description).length,
      abv:list.filter(b=>Number.isFinite(b.abv)).length,ibu:list.filter(b=>Number.isFinite(b.ibu)).length,
      verifiedCityBeers:list.filter(b=>breweries.get(b.breweryId).locationVerified).length,
      mapReadyBeers:counts.mapReadyBeers,notMapReadyBeers:list.length-counts.mapReadyBeers},
    awardRatingYears:unique(list.flatMap(b=>b.awards.map(a=>a.ratingYear))),
    awardObservations:observations.length,duplicateAwardObservations:duplicateObservations,
    deduplicatedBreweryRecords,
    excludedAwardObservations:excluded.length,
    excludedAwardDrinks:new Set(excluded.map(r=>r.drinkId)).size,
    countrySemantics:'Award geography unless countryBasis is official_brewery_location; enriched records use sourced brewery city references, not verified per-package production sites.',
    representativeStatus:'initial_editorial_seeds_not_completed_global_1000_or_sales_ranking',
    limitations:['获奖数据为已核验公开页面的部分样本，并非 Untappd 完整获奖库。',
      '获奖不等于精酿或独立所有权认证；相关身份未核验时保留未知。',
      '奖项年份是评分统计年；年度评分不是销量、累计评分或销量排名。',
      '代表酒为重新研究的编辑样本；1000 是后续目标，不是当前数量。',
      '未按酒名、风格或国家中心点生成介绍、图片、评分或坐标。']},
    breweries:breweryList,beers:list};
}

export async function writeCuratedCatalog() {
  const awardsPath = resolve(root,'research/untappd-awards-2026-09-21/identified-awards.json');
  const seedPath = resolve(root,'research/curated-catalog/representative-seeds.json');
  const boundsPath = resolve(root,'research/curated-catalog/image-display-bounds.json');
  const [awards,seeds,imageBounds] = await Promise.all([awardsPath,seedPath,boundsPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));
  const enrichmentFiles = ['award-enrichment-za.json','award-enrichment-americas.json','award-enrichment-asia-oceania.json'];
  const enrichmentInputs = await Promise.all(enrichmentFiles.map(async file=>{
    try {return JSON.parse(await readFile(resolve(root,'research/curated-catalog',file),'utf8'));}
    catch (error) {if(error.code==='ENOENT')return{records:[]};throw error;}
  }));
  const factFiles = ['award-enrichment-existing-facts.json','award-enrichment-public-facts.json'];
  const factInputs = await Promise.all(factFiles.map(async file=>JSON.parse(await readFile(resolve(root,'research/curated-catalog',file),'utf8'))));
  const catalog = buildCuratedCatalog(awards,seeds,{enrichments:{records:enrichmentInputs.flatMap(input=>input.records || [])},
    factSupplements:{records:factInputs.flatMap(input=>input.records || [])}});
  for (const beer of catalog.beers) {
    if (!beer.image) continue;
    const bytes = await readFile(resolve(root,'public',beer.image.slice(1)));
    beer.imageEvidence = {...beer.imageEvidence,originalSha256:hash(bytes),sha256:hash(bytes)};
    const bounds = beer.imageContentBounds || imageBounds.images[beer.image];
    if (!bounds || bounds.originalSha256 !== hash(bytes)) throw new Error(`Stale content bounds for ${beer.image}`);
    beer.imageContentBounds = bounds;
  }
  const destination = resolve(root,'public/data/curated.json');
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(catalog,null,2)+'\n');
  console.log(JSON.stringify({output:destination,...catalog.metadata.counts}));
  return catalog;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeCuratedCatalog();
