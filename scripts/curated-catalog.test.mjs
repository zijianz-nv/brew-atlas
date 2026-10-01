import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCuratedCatalog} from './build-curated-catalog.mjs';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
import {compareBeerPhotoRank} from '../src/beer-ranking.mjs';

const load = async path => JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const awards = await load('research/untappd-awards-2026-09-21/identified-awards.json');
const seeds = await load('research/curated-catalog/representative-seeds.json');
const active = await load('public/data/curated.json');
const build = (a=awards,s=seeds) => buildCuratedCatalog(a,s,{createdAt:active.metadata.createdAt});

test('active counts measure actual new records; 1000 stays a partial editorial target',()=>{
  const catalog = build(), {beers,breweries,metadata} = catalog;
  assert.equal(beers.length,124);
  assert.equal(metadata.counts.overlappingBeers,1);
  assert.equal(metadata.counts.awardsBeers,119);
  assert.equal(metadata.counts.representativeBeers,6);
  assert.equal(metadata.counts.mapReadyBeers,6);
  assert.equal(metadata.counts.beers,beers.length);
  assert.equal(metadata.counts.breweries,breweries.length);
  assert.equal(metadata.partial,true);
  assert.equal(metadata.targetRepresentativeCount,1000);
  assert.equal(metadata.legacyCatalogsLoaded,false);
  assert.equal(new Set(beers.map(b=>b.id)).size,beers.length);
  const ids = new Set(breweries.map(b=>b.id));
  for (const beer of beers) {
    assert.ok(ids.has(beer.breweryId));
    assert.match(beer.id,/^curated-(award|representative)-/);
    assert.ok(beer.collections.length > 0);
    assert.ok(beer.collections.every(c=>['awards','representative'].includes(c)));
    assert.ok(beer.collections.includes(beer.collection));
  }
});

test('repeated observations collapse without losing award evidence; ambiguous Georgia is withheld',()=>{
  const catalog = build();
  assert.equal(catalog.metadata.duplicateAwardObservations,10);
  assert.equal(catalog.metadata.excludedAwardDrinks,8);
  assert.equal(catalog.beers.flatMap(b=>b.awards).length,119);
  const quarantined = new Set(awards.records.filter(r=>r.geographic_eligibility==='quarantine').map(r=>r.drink_id));
  for (const beer of catalog.beers) assert.ok(!quarantined.has(beer.untappdId));
  for (const beer of catalog.beers.filter(b=>b.collection==='awards'&&!b.collections.includes('representative'))) {
    assert.equal(beer.description,null);
    assert.equal(beer.image,null);
    assert.equal(beer.abv,null);
    assert.equal(beer.rating,null);
    assert.equal(beer.ratingsCount,null);
    assert.equal(hasDescribedPhoto(beer),false);
    for (const award of beer.awards) {
      assert.equal(award.ratingYear,2025);
      assert.equal(award.ratingCount,null);
      assert.equal(new URL(award.sourceUrl).host,'awards.untappd.com');
      assert.equal(award.ceremonyYear,null);
    }
    const brewery = catalog.breweries.find(b=>b.id===beer.breweryId);
    assert.equal(brewery.countryBasis,'award_region');
    assert.equal(brewery.locationVerified,false);
    assert.equal(brewery.lat,null);
    assert.equal(brewery.lng,null);
  }
});

test('city coordinates are usable only with fresh city/address AND coordinate evidence',()=>{
  const incomplete = structuredClone(seeds);
  incomplete.records[0].coordinateSourceUrl = null;
  const catalog = build(awards,incomplete);
  const beer = catalog.beers.find(b=>b.id===`curated-representative-${incomplete.records[0].id}`);
  const brewery = catalog.breweries.find(b=>b.id===beer.breweryId);
  assert.equal(brewery.locationVerified,false);
  assert.equal(brewery.lat,null);
  assert.equal(brewery.lng,null);
  assert.equal(catalog.metadata.counts.mapReadyBeers,5);
  incomplete.records[0].coordinateSourceUrl = seeds.records[0].coordinateSourceUrl;
  incomplete.records[0].locationVerified = false;
  assert.equal(build(awards,incomplete).metadata.counts.mapReadyBeers,5);
});

test('reviewed Geist identity joins the two memberships and retains both source trails',()=>{
  const catalog = build();
  const matches = catalog.beers.filter(b=>b.name==='Geist Witty Wit');
  assert.equal(matches.length,1);
  const beer = matches[0];
  assert.equal(beer.id,'curated-award-2238467');
  assert.deepEqual(beer.collections,['awards','representative']);
  assert.equal(beer.awards[0].rating,3.52);
  assert.equal(beer.awards[0].ratingYear,2025);
  assert.equal(beer.abv,5);
  assert.ok(hasDescribedPhoto(beer));
  assert.ok(beer.sourceEvidence.some(e=>e.role==='award_list'));
  assert.ok(beer.sourceEvidence.some(e=>e.role==='official_product'));
  const unsafe = structuredClone(seeds);
  unsafe.records.find(r=>r.untappdId).identityEvidence = null;
  assert.throws(()=>build(awards,unsafe),/Unverified cross-source identity/);
});

test('official award enrichment adds missing product facts without inventing a representative selection',()=>{
  const geist = structuredClone(seeds.records.find(r=>r.untappdId==='2238467'));
  delete geist.representativeReason;
  const otherSeeds = {...seeds,records:seeds.records.filter(r=>r.untappdId!=='2238467')};
  const catalog = buildCuratedCatalog(awards,otherSeeds,{enrichments:{records:[geist]}});
  const beer = catalog.beers.find(b=>b.untappdId==='2238467');
  assert.deepEqual(beer.collections,['awards']);
  assert.equal(beer.representativeReason,null);
  assert.equal(beer.representativeStatus,null);
  assert.ok(hasDescribedPhoto(beer));
  assert.equal(beer.abv,5);
  assert.equal(beer.awards[0].rating,3.52);
  assert.equal(beer.awards[0].ratingYear,2025);
  assert.equal(catalog.metadata.counts.awardMapReadyBeers,1);
  assert.equal(catalog.metadata.counts.representativeBeers,5);
  assert.equal(catalog.metadata.counts.beers,124);
});

test('active catalog completeness counts and image/position evidence match the actual records',async()=>{
  const located = beer => active.breweries.find(b=>b.id===beer.breweryId)?.locationVerified;
  const ready = active.beers.filter(b=>hasDescribedPhoto(b)&&located(b));
  assert.equal(active.metadata.counts.mapReadyBeers,ready.length);
  if (active.metadata.completeness) {
    assert.equal(active.metadata.completeness.notMapReadyBeers,active.beers.length-ready.length);
    assert.equal(active.metadata.completeness.abv,active.beers.filter(b=>Number.isFinite(b.abv)).length);
  }
  for (const beer of active.beers.filter(b=>b.image)) {
    assert.match(beer.image,/^\/images\/curated\//);
    const bytes=await readFile(new URL(`../public${beer.image}`,import.meta.url));
    const sha=createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha,beer.imageEvidence.originalSha256);
    assert.equal(sha,beer.imageContentBounds.originalSha256);
    assert.ok(beer.description);
    if (beer.collections.includes('awards')) {
      assert.ok(beer.awards.length>0);
      assert.ok(beer.identityEvidence?.status==='reviewed_same_product');
    }
  }
});

test('a legacy photo cannot silently enrich the replacement database',()=>{
  const unsafe = structuredClone(seeds);
  unsafe.records[0].imageOriginal = '/images/archive-193.png';
  assert.throws(()=>build(awards,unsafe),/freshly acquired local image/);
});

test('conflicting annual scores fail the import instead of choosing a convenient value',()=>{
  const conflicted = structuredClone(awards);
  const other = structuredClone(conflicted.records[0]);
  other.annual_award_rating = 3.5;
  other.provenance.rating_text = '3.50 in 2025';
  conflicted.records.push(other);
  assert.throws(()=>build(conflicted,seeds),/failed validation|Conflicting annual award/);
});

test('packaged candidate photos are new local bytes with matching hashes and introductions',async()=>{
  const rep = active.beers.filter(b=>b.collections.includes('representative'));
  assert.equal(rep.length,6);
  const hashes = new Set();
  for (const beer of rep) {
    assert.ok(hasDescribedPhoto(beer));
    assert.ok(beer.representativeReason);
    assert.equal(beer.representativeStatus,'editorial_seed');
    assert.match(beer.image,/^\/images\/curated\//);
    const bytes = await readFile(new URL(`../public${beer.image}`,import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,beer.imageEvidence.originalSha256);
    assert.ok(!hashes.has(hash)); hashes.add(hash);
    assert.ok(beer.sourceEvidence.some(p=>p.role==='official_product'));
    assert.ok(active.breweries.find(b=>b.id===beer.breweryId).locationVerified);
  }
});

test('map priority uses accolades without treating unrelated annual ratings as a global leaderboard',()=>{
  const item = (id,medal,rating,style) => ({id,collection:'awards',collections:['awards'],
    awards:[{medal,rating,style,ratingYear:2025,region:'China'}]});
  const gold = item('a','Gold',3.1,'Lager');
  const silver = item('b','Silver',4.7,'Stout');
  assert.ok(compareBeerPhotoRank(gold,silver)<0);
  const otherGold = item('b','Gold',4.8,'Stout');
  assert.ok(compareBeerPhotoRank(gold,otherGold)<0); // stable identity tie-break
  assert.ok(compareBeerPhotoRank(otherGold,gold)>0);
});
