/**
 * One input row = one publicly observed award, not one unique drink.
 * {records:[{drink_id,name,producer_name,style,award_year,ceremony_year:null,
 *   award_region,award_region_code:null,award_scope:'country'|'subnational'|'unknown',
 *   award_type:'standard'|'festival'|'unknown',medal,annual_award_rating,
 *   provenance:{source_url,source_kind:'list'|'detail_main',observed_at,
 *     rating_text:'3.52 in 2025',source_file:null,source_sha256:null}}]}
 * award_year ALWAYS means the rating calendar year, not ceremony/publication year.
 * No network, no catalog writes. Source absence stays null; 0 stays a valid score.
 * node scripts/untappd-awards-quality.mjs --input FILE --output FILE --expected-award-year 2025
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value
  : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : null;
const fold = value => (value || '').normalize('NFKC').replace(/[–—]/g, '-').trim().toLowerCase();
const id = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value)
  : typeof value === 'string' && /^[1-9]\d*$/.test(value.trim()) ? value.trim() : null;
const validURL = value => {try {const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u : null;} catch {return null;}};
const present = value => value !== null && value !== undefined && value !== '';
const distribution = values => Object.fromEntries([...values.reduce((m,v)=>m.set(String(v ?? 'unknown'),(m.get(String(v ?? 'unknown'))||0)+1),new Map())].sort(([a],[b])=>a.localeCompare(b)));
const distinct = values => [...new Set(values.filter(present))].sort();

/** A style-based candidate label, never independent/craft ownership certification. */
export function classifyDrinkStyle(value) {
  const style = text(value), normalized = fold(style);
  const base = normalized.replace(/^non[- ]alcoholic\s*-\s*/, '');
  if (!style) return {kind:'unknown', reason:'missing_source_style'};
  if (/^(?:cider|mead|wine|makgeolli|hard (?:seltzer|kombucha|ginger beer)|rtd|root beer|hop water|soda|malt soda|malta|fassbrause)\b/.test(base))
    return {kind:'non_beer', reason:'explicit_other_drink_style'};
  if (/^(?:ipa|lager|pilsner|pale ale|stout|porter|wheat beer|lambic|sour|wild ale|farmhouse ale|belgian|bock|altbier|barleywine|bitter|blonde|golden ale|brown ale|california common|cream ale|dark ale|festbier|fruit beer|grape ale|historical beer|honey beer|kellerbier|kölsch|koji|malt beer|malt liquor|märzen|mild|old \/ stock ale|pumpkin|rauchbier|red ale|rye beer|rye wine|schwarzbier|scotch ale|scottish|shandy|smoked beer|sorghum|specialty grain|spiced|strong ale|table beer|traditional ale|winter ale|winter warmer|brett beer|black & tan|australian sparkling ale|bière|chilli|corn beer|gluten-free|beer)\b/.test(base))
    return {kind:'beer_candidate', reason:'explicit_beer_style_not_craft_verification'};
  return {kind:'unknown', reason:'unclassified_source_style'};
}

export function normalizeAwardObservation(row, index = 0) {
  row = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
  const p = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};
  const medalRaw = text(row.medal), medal = ['Gold','Silver','Bronze'].find(m=>fold(m)===fold(medalRaw)) || medalRaw;
  const source = text(p.source_url ?? row.source_url ?? row.list_source_url ?? row.detail_url);
  return {
    row_index:index, drink_id:id(row.drink_id ?? row.beer_id), name:text(row.name),
    producer_id:id(row.producer_id), producer_name:text(row.producer_name), style:text(row.style),
    award_year:number(row.award_year), ceremony_year:number(row.ceremony_year),
    award_region:text(row.award_region ?? row.country_label),
    award_region_code:text(row.award_region_code ?? row.country_code),
    award_scope:text(row.award_scope) || 'unknown', award_type:text(row.award_type) || 'unknown',
    medal, annual_award_rating:number(row.annual_award_rating), rating_count:number(row.rating_count),
    abv:number(row.abv), ibu:number(row.ibu), description:text(row.description),
    bottle_image_url:text(row.bottle_image_url), beer_label_image_url:text(row.beer_label_image_url),
    latitude:typeof row.latitude==='number' && Number.isFinite(row.latitude) ? row.latitude : null,
    longitude:typeof row.longitude==='number' && Number.isFinite(row.longitude) ? row.longitude : null,
    craft_status:text(row.craft_status) || 'not_verified', classification:classifyDrinkStyle(row.style),
    quality_notes:Array.isArray(row.quality_notes) ? row.quality_notes.map(text).filter(Boolean) : text(row.quality_notes) ? [text(row.quality_notes)] : [],
    provenance:{source_url:source, source_kind:text(p.source_kind) || (row.list_source_url ? 'list' : row.detail_url ? 'detail_main' : null),
      observed_at:text(p.observed_at ?? row.observed_at), rating_text:text(p.rating_text),
      source_file:text(p.source_file ?? row.source_file), source_sha256:text(p.source_sha256 ?? row.source_html_sha256),
      ceremony_year_source_url:text(p.ceremony_year_source_url), ceremony_year_text:text(p.ceremony_year_text)},
  };
}

function awardIdentity(row) {
  if (!row.drink_id || !Number.isInteger(row.award_year) || !row.award_region || !row.style) return null;
  // Rating and medal are values. A different value for the same award is a conflict.
  return JSON.stringify([row.drink_id,row.award_year,fold(row.award_region),row.award_scope,row.award_type,fold(row.style)]);
}

export function auditAwards(input, {expectedAwardYear} = {}) {
  if (!input || !Array.isArray(input.records)) throw new TypeError('Input must be an object with records: []');
  if (expectedAwardYear !== undefined && !Number.isInteger(expectedAwardYear)) throw new TypeError('expectedAwardYear must be an integer');
  const observations = input.records.map(normalizeAwardObservation), errors=[], warnings=[];
  const issue=(target,row,code,detail)=>target.push({row_index:row.row_index,drink_id:row.drink_id,code,detail});
  for (const row of observations) {
    const original = input.records[row.row_index] || {};
    for (const field of ['drink_id','name','producer_name','style','award_region']) if (!row[field]) issue(errors,row,'missing_required_field',field);
    if (!Number.isInteger(row.award_year) || row.award_year<1900 || row.award_year>2100) issue(errors,row,'invalid_award_year',row.award_year);
    if (expectedAwardYear!==undefined && row.award_year!==expectedAwardYear) issue(errors,row,'unexpected_rating_year',{expected:expectedAwardYear,actual:row.award_year});
    if (!['country','subnational','unknown'].includes(row.award_scope)) issue(errors,row,'invalid_award_scope',row.award_scope);
    if (!['standard','festival','unknown'].includes(row.award_type)) issue(errors,row,'invalid_award_type',row.award_type);
    if (row.award_scope==='unknown' || row.award_type==='unknown') issue(warnings,row,'incomplete_award_identity','Geographic scope/award type is unresolved; do not claim full award deduplication.');
    if (row.quality_notes.includes('geographic_scope_ambiguous')) issue(warnings,row,'geographic_scope_ambiguous','Source region label is ambiguous; exclude from confirmed country coverage.');
    if (!['Gold','Silver','Bronze'].includes(row.medal)) issue(errors,row,'invalid_medal',row.medal);
    if (row.annual_award_rating===null || row.annual_award_rating<0 || row.annual_award_rating>5) issue(errors,row,'invalid_rating',original.annual_award_rating ?? null);
    if (present(original.rating_count) && (!Number.isInteger(row.rating_count) || row.rating_count<0)) issue(errors,row,'invalid_rating_count',original.rating_count);
    if (row.rating_count===50 && !original.rating_count_source_url && !original.provenance?.rating_count_text)
      issue(warnings,row,'rating_count_may_be_eligibility_threshold','50 is the awards eligibility threshold, not a verified per-drink count.');
    const url=validURL(row.provenance.source_url);
    if (!url || url.hostname!=='awards.untappd.com') issue(errors,row,'invalid_awards_provenance_url',row.provenance.source_url);
    const urlID=url?.pathname.match(/^\/beers\/(\d+)\/?$/)?.[1];
    if (urlID && urlID!==row.drink_id) issue(errors,row,'source_drink_id_mismatch',urlID);
    if (!['list','detail_main'].includes(row.provenance.source_kind)) issue(errors,row,'invalid_source_kind',row.provenance.source_kind);
    if (!row.provenance.observed_at || !Number.isFinite(Date.parse(row.provenance.observed_at))) issue(warnings,row,'missing_observation_time',row.provenance.observed_at);
    if (row.provenance.source_sha256 && !/^[a-f0-9]{64}$/i.test(row.provenance.source_sha256)) issue(errors,row,'invalid_source_sha256',row.provenance.source_sha256);
    if (!!row.provenance.source_file !== !!row.provenance.source_sha256) issue(warnings,row,'incomplete_local_evidence','source_file and source_sha256 should be provided together.');
    const ratingMatches=[...(row.provenance.rating_text || '').matchAll(/(?:^|\s)(\d+(?:\.\d+)?)\s+in\s+(20\d{2})\b/gi)];
    if (ratingMatches.length===1) {
      const [,rating,year]=ratingMatches[0];
      if (Number(year)!==row.award_year) issue(errors,row,'year_text_mismatch',{text:row.provenance.rating_text,award_year:row.award_year});
      if (row.annual_award_rating!==null && Math.abs(Number(rating)-row.annual_award_rating)>1e-6) issue(errors,row,'rating_text_mismatch',{text:row.provenance.rating_text,rating:row.annual_award_rating});
    } else issue(warnings,row,ratingMatches.length>1?'ambiguous_rating_text':'missing_rating_year_evidence','Capture one card/main award rating line, excluding related cards.');
    if (present(original.ceremony_year) && row.ceremony_year===null) issue(errors,row,'invalid_ceremony_year',original.ceremony_year);
    if (row.ceremony_year!==null) {
      if (!Number.isInteger(row.ceremony_year) || row.ceremony_year<1900 || row.ceremony_year>2100) issue(errors,row,'invalid_ceremony_year',row.ceremony_year);
      const evidence=row.provenance.ceremony_year_text || '';
      if (!validURL(row.provenance.ceremony_year_source_url) || !evidence.includes(String(row.ceremony_year)) || /copyright|©/i.test(evidence))
        issue(errors,row,'unsubstantiated_ceremony_year','Use explicit edition/announcement evidence; do not infer from copyright, scrape date, or rating year + 1.');
    }
    if (/^united states\s*[-–]/i.test(row.award_region||'') && row.award_scope==='country') issue(errors,row,'us_state_classed_as_country',row.award_region);
    if (/^united states\s*[-–].*georgia/i.test(row.award_region||'') && row.award_region_code==='GE') issue(errors,row,'georgia_state_country_conflict',row.award_region);
    for (const field of ['bottle_image_url','beer_label_image_url']) if (row[field] && /brewery_logos|placeholder|medal|spinner|app-icon|trophy/i.test(row[field]))
      issue(errors,row,'non_product_media_in_product_image_field',{field,url:row[field]});
  }
  const byDrink=new Map(), byAward=new Map();
  for (const row of observations) {
    if (row.drink_id) {if (!byDrink.has(row.drink_id)) byDrink.set(row.drink_id,[]);byDrink.get(row.drink_id).push(row);}
    const key=awardIdentity(row);if(key){if(!byAward.has(key))byAward.set(key,[]);byAward.get(key).push(row);}
  }
  const conflicts=[],duplicateGroups=[];
  let duplicateRows=0;
  for (const [key,rows] of byAward) {
    const variants=new Map();for(const row of rows){const v=JSON.stringify([row.medal,row.annual_award_rating]);if(!variants.has(v))variants.set(v,[]);variants.get(v).push(row.row_index);}
    if(variants.size>1)conflicts.push({kind:'award_values_conflict',award_identity:JSON.parse(key),rows:rows.map(r=>r.row_index),variants:[...variants].map(([v,indices])=>({values:JSON.parse(v),rows:indices}))});
    for(const indices of variants.values())if(indices.length>1){duplicateRows+=indices.length-1;duplicateGroups.push({award_identity:JSON.parse(key),rows:indices});}
  }
  const drinks=[...byDrink].map(([drink_id,rows])=>{
    const kinds=distinct(rows.map(r=>r.classification.kind));
    const conflictingKinds=kinds.includes('beer_candidate')&&kinds.includes('non_beer');
    if(conflictingKinds)conflicts.push({kind:'drink_category_conflict',drink_id,rows:rows.map(r=>r.row_index),styles:distinct(rows.map(r=>r.style))});
    const classification=conflictingKinds?'unknown':kinds.includes('beer_candidate')?'beer_candidate':kinds.includes('non_beer')?'non_beer':'unknown';
    return {drink_id,name_variants:distinct(rows.map(r=>r.name)),producer_names:distinct(rows.map(r=>r.producer_name)),producer_ids:distinct(rows.map(r=>r.producer_id)),style_variants:distinct(rows.map(r=>r.style)),classification,
      beer_candidate:classification==='beer_candidate',craft_status:'not_verified',observation_rows:rows.map(r=>r.row_index),award_identity_count:new Set(rows.map(awardIdentity).filter(Boolean)).size};
  });
  const coverage={};for(const field of ['drink_id','name','producer_id','producer_name','style','award_region','award_region_code','annual_award_rating','rating_count','abv','ibu','description','bottle_image_url','beer_label_image_url','latitude','longitude']){
    const count=observations.filter(r=>present(r[field])).length;coverage[field]={present:count,total:observations.length,ratio:observations.length?count/observations.length:0};
  }
  return {schema_version:1,passed:errors.length===0&&conflicts.length===0,
    semantics:{award_year:'rating_calendar_year',ceremony_year:'only_if_explicitly_sourced',rating:'annual_awards_rating_not_sales_or_all_time',beer_candidate:'style_based_candidate_not_verified_craft',record_retention:'All drink observations retained, including non-beer and invalid rows; issues are reported, never silently repaired.'},
    counts:{input_rows:input.records.length,normalized_rows:observations.length,unique_drinks_by_id:drinks.length,beer_candidates_unique:drinks.filter(r=>r.beer_candidate).length,
      non_beer_drinks_unique:drinks.filter(r=>r.classification==='non_beer').length,unknown_drinks_unique:drinks.filter(r=>r.classification==='unknown').length,
      unique_award_identities:byAward.size,complete_award_identity_rows:observations.filter(r=>awardIdentity(r)&&r.award_scope!=='unknown'&&r.award_type!=='unknown').length,
      duplicate_observation_rows:duplicateRows,unique_producer_ids:distinct(observations.map(r=>r.producer_id)).length,distinct_producer_names:distinct(observations.map(r=>r.producer_name)).length},
    distributions:{award_year:distribution(observations.map(r=>r.award_year)),award_region:distribution(observations.map(r=>r.award_region)),award_scope:distribution(observations.map(r=>r.award_scope)),award_type:distribution(observations.map(r=>r.award_type)),medal:distribution(observations.map(r=>r.medal)),style:distribution(observations.map(r=>r.style)),unique_drink_classification:distribution(drinks.map(r=>r.classification))},
    coverage,duplicates:duplicateGroups,conflicts,errors,warnings,drinks,observations};
}

async function main() {
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){if(!['--input','--output','--expected-award-year'].includes(args[i])||!args[i+1])throw new Error('Usage: --input FILE [--output FILE] [--expected-award-year 2025]');options[args[i]]=args[i+1];}
  if(!options['--input'])throw new Error('--input is required');
  const filename=path.resolve(options['--input']),output=path.resolve(options['--output']||path.join(path.dirname(filename),'awards-quality.json'));
  if(filename===output)throw new Error('Output may not overwrite input');
  const report=auditAwards(JSON.parse(await readFile(filename,'utf8')),{expectedAwardYear:options['--expected-award-year']===undefined?undefined:Number(options['--expected-award-year'])});
  report.generated_at=new Date().toISOString();report.input_file=filename;
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,passed:report.passed,...report.counts,errors:report.errors.length,conflicts:report.conflicts.length,warnings:report.warnings.length}));
  if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1});
