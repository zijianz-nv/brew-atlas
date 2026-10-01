import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAwards,classifyDrinkStyle,normalizeAwardObservation} from './untappd-awards-quality.mjs';
const row=(overrides={})=>({drink_id:'123',name:'Test drink',producer_name:'Test producer',style:'IPA - American',award_year:2025,ceremony_year:null,award_region:'India',award_region_code:'IN',award_scope:'country',award_type:'standard',medal:'Gold',annual_award_rating:3.52,provenance:{source_url:'https://awards.untappd.com/beers/123/',source_kind:'detail_main',observed_at:'2026-09-21T00:00:00Z',rating_text:'3.52 in 2025'},...overrides});

test('preserves non-beer and unknown drinks; beer candidates are an independent subset',()=>{
 const records=[row(),row({drink_id:'124',style:'Mead - Braggot',provenance:{...row().provenance,source_url:'https://awards.untappd.com/beers/124/'}}),row({drink_id:'125',style:'Unclassified',provenance:{...row().provenance,source_url:'https://awards.untappd.com/beers/125/'}})];
 const r=auditAwards({records});assert.equal(r.passed,true);assert.equal(r.observations.length,3);assert.equal(r.counts.unique_drinks_by_id,3);assert.equal(r.counts.beer_candidates_unique,1);assert.equal(r.counts.non_beer_drinks_unique,1);assert.equal(r.counts.unknown_drinks_unique,1);
});
test('style classification distinguishes beer wines and nonalcoholic beer from other drinks',()=>{
 for(const style of ['Barleywine - English','Wheat Beer - Wheat Wine','Rye Wine','Non-Alcoholic - IPA','Grape Ale - Italian'])assert.equal(classifyDrinkStyle(style).kind,'beer_candidate',style);
 for(const style of ['Cider - Dry','Mead - Braggot','Hard Ginger Beer','Hard Seltzer','Makgeolli - Traditional','RTD - Margarita','Non-Alcoholic - Cider / Perry','Non-Alcoholic - Hop Water'])assert.equal(classifyDrinkStyle(style).kind,'non_beer',style);
 for(const style of [null,'Other','Flavored Malt Beverage','Happoshu'])assert.equal(classifyDrinkStyle(style).kind,'unknown',style);
});
test('deduplicates repeated observations separately from multi-region and festival awards',()=>{
 const base=row(),r=auditAwards({records:[base,structuredClone(base),row({award_type:'festival'}),row({award_region:'United States - Georgia',award_region_code:'US-GA',award_scope:'subnational'})]});
 assert.equal(r.counts.unique_drinks_by_id,1);assert.equal(r.counts.unique_award_identities,3);assert.equal(r.counts.duplicate_observation_rows,1);assert.equal(r.observations.length,4);assert.equal(r.conflicts.length,0);
});
test('does not silently choose between different medal/rating values for the same award',()=>{
 const r=auditAwards({records:[row(),row({medal:'Silver',annual_award_rating:3.6,provenance:{...row().provenance,rating_text:'3.6 in 2025'}})]});
 assert.equal(r.passed,false);assert.equal(r.conflicts[0].kind,'award_values_conflict');assert.equal(r.counts.unique_drinks_by_id,1);assert.equal(r.counts.unique_award_identities,1);assert.equal(r.observations.length,2);
});
test('rating year cannot be overwritten with 2026 ceremony year or page copyright',()=>{
 const wrong=auditAwards({records:[row({award_year:2026})]},{expectedAwardYear:2025});assert(wrong.errors.some(e=>e.code==='year_text_mismatch'));assert(wrong.errors.some(e=>e.code==='unexpected_rating_year'));
 const inferred=auditAwards({records:[row({ceremony_year:2026})]});assert(inferred.errors.some(e=>e.code==='unsubstantiated_ceremony_year'));
 const malformed=auditAwards({records:[row({ceremony_year:'2026 edition'})]});assert(malformed.errors.some(e=>e.code==='invalid_ceremony_year'));
 const copyrighted=auditAwards({records:[row({ceremony_year:2026,provenance:{...row().provenance,ceremony_year_source_url:'https://awards.untappd.com/',ceremony_year_text:'© Untappd 2026'}})]});assert(copyrighted.errors.some(e=>e.code==='unsubstantiated_ceremony_year'));
 const explicit=auditAwards({records:[row({ceremony_year:2026,provenance:{...row().provenance,ceremony_year_source_url:'https://awards.untappd.com/media-kit/',ceremony_year_text:'2026 Untappd Community Awards'}})]});assert.equal(explicit.passed,true);assert.equal(explicit.observations[0].award_year,2025);
});
test('zero is a valid numeric value; empty/null values never become zero',()=>{
 const r=auditAwards({records:[row({annual_award_rating:0,abv:0,ibu:0,rating_count:0,provenance:{...row().provenance,rating_text:'0 in 2025'}})]});assert.equal(r.passed,true);assert.equal(r.coverage.annual_award_rating.present,1);assert.equal(r.coverage.abv.present,1);assert.equal(r.coverage.ibu.present,1);
 for(const v of [null,'',undefined]){const n=normalizeAwardObservation(row({annual_award_rating:v}));assert.equal(n.annual_award_rating,null);assert.equal(auditAwards({records:[row({annual_award_rating:v})]}).passed,false);}
});
test('ID mismatch, producer cards, unknown source kinds and product placeholder images are visible errors',()=>{
 const r=auditAwards({records:[row({drink_id:'999',bottle_image_url:'https://assets.untappd.com/site/brewery_logos_hd/brewery-1.jpg'}),{name:'Producer card',producer_id:'99'},row({provenance:{...row().provenance,source_kind:'related_cards'}})]});
 assert(r.errors.some(e=>e.code==='source_drink_id_mismatch'));assert(r.errors.some(e=>e.code==='non_product_media_in_product_image_field'));assert(r.errors.some(e=>e.code==='missing_required_field'&&e.detail==='drink_id'));assert(r.errors.some(e=>e.code==='invalid_source_kind'));assert.equal(r.observations.length,3);
});
test('mixed-year raw text is flagged; historical years remain separate observations',()=>{
 const r=auditAwards({records:[row(),row({award_year:2024,provenance:{...row().provenance,rating_text:'3.52 in 2024'}})]});assert.equal(r.counts.unique_drinks_by_id,1);assert.equal(r.counts.unique_award_identities,2);assert.equal(r.conflicts.length,0);
 const mixed=auditAwards({records:[row({provenance:{...row().provenance,rating_text:'3.52 in 2025 and 3.52 in 2024'}})]});assert(mixed.warnings.some(w=>w.code==='ambiguous_rating_text'));
});
test('Georgia country and US Georgia are not collapsed or misclassified',()=>{
 const good=auditAwards({records:[row({award_region:'Georgia',award_region_code:'GE'}),row({award_region:'United States - Georgia',award_region_code:'US-GA',award_scope:'subnational'})]});assert.equal(good.counts.unique_award_identities,2);assert.equal(good.passed,true);
 const bad=auditAwards({records:[row({award_region:'United States - Georgia',award_region_code:'GE'})]});assert(bad.errors.some(e=>e.code==='georgia_state_country_conflict'));assert(bad.errors.some(e=>e.code==='us_state_classed_as_country'));
 const ambiguous=auditAwards({records:[row({award_region:'Georgia',award_region_code:null,award_scope:'unknown',quality_notes:['geographic_scope_ambiguous']})]});assert.equal(ambiguous.passed,true);assert.equal(ambiguous.observations[0].award_region_code,null);assert.deepEqual(ambiguous.observations[0].quality_notes,['geographic_scope_ambiguous']);assert(ambiguous.warnings.some(w=>w.code==='geographic_scope_ambiguous'));
});
test('category conflicts are retained and removed from beer-candidate subset pending review',()=>{
 const r=auditAwards({records:[row(),row({style:'Cider - Dry'})]});assert(r.conflicts.some(c=>c.kind==='drink_category_conflict'));assert.equal(r.drinks[0].classification,'unknown');assert.equal(r.counts.beer_candidates_unique,0);assert.equal(r.observations.length,2);
});
test('legacy samples are normalized without mutation and missing scope/evidence stays unresolved',()=>{
 const input={records:[{beer_id:'367053',name:'Baby IPA',producer_name:'Master Gao',style:'IPA - Other',award_year:2025,country_label:"China / People's Republic of China",country_code:'CN',medal:'Silver',annual_award_rating:3.3,list_source_url:'https://awards.untappd.com/region/china-peoples-republic-of-china/page/8/'}]};const original=structuredClone(input);
 const r=auditAwards(input,{expectedAwardYear:2025});assert.deepEqual(input,original);assert.equal(r.observations[0].drink_id,'367053');assert.equal(r.observations[0].ceremony_year,null);assert.equal(r.observations[0].award_scope,'unknown');assert.equal(r.counts.complete_award_identity_rows,0);assert(r.warnings.some(w=>w.code==='missing_rating_year_evidence'));
});
