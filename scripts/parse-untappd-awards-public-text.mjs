// Parse saved public web-tool text only. No HTTP requests, browser login or access-control bypass.
import {readFile,readdir,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function parse(raw) {
 const pages=raw.split(/-{20,}\n/),records=[],reports=[];
 for(const page of pages){
  const url=page.match(/^.*?\((https:\/\/awards\.untappd\.com\/[^)]+)\)/)?.[1];
  const ref=page.match(/cite(turn[^]+)/)?.[1];
  const body=page.replace(/L\d+:[ \t]*/g,"\n");
  const region=body.match(/# Explore Award-Winning Drinks and Producers in ([^\n]+)/)?.[1]?.trim();
  let count=0;
  const chunks=body.split(/\n### /).slice(1);
  for(const chunk of chunks){
    const heading=chunk.match(/^cite(\d+)†([^]+)/);
    const rating=chunk.match(/(?:^|\n)(\d+(?:\.\d+)?) in (20\d\d)(?:\n|$)/);
    const lines=chunk.split('\n').map(x=>x.trim()).filter(Boolean);
    const mi=lines.findIndex(x=>/^(Gold|Silver|Bronze)$/.test(x));
    if(!heading||!rating||mi<0||!region)continue;
    records.push({name:heading[2],producer_name:lines[1],style:lines[mi+1],award_year:Number(rating[2]),ceremony_year:null,award_region:region,award_scope:'country',award_type:'unknown',medal:lines[mi],annual_award_rating:Number(rating[1]),provenance:{source_url:url,source_kind:'list',observed_at:new Date().toISOString(),rating_text:rating[0].trim(),web_ref:ref,link_id:Number(heading[1]),access_method:'public indexed/rendered web page',source_file:'raw/web-batch-01.txt'}});
    count++;
  }
  reports.push({url,ref,region,count,error:!region?page.slice(0,500):null});
 }
 return {records,reports};
}

function resolveLinks(raw){
 return raw.split(/-{20,}\n/).map(part=>{
  const source=part.match(/Source: click\(\{"ref_id":"([^"]+)","id":(\d+)\}\)/);
  const url=part.match(/https:\/\/awards\.untappd\.com\/beers\/(\d+)\/?/);
  return source?{web_ref:source[1],link_id:Number(source[2]),drink_id:url?.[1]||null,detail_url:url?.[0]||null,detail_available:!part.startsWith('Internal Error'),detail_first_rating:part.match(/L\d+:[ \t]*(\d+(?:\.\d+)?) in (20\d\d)/)?.slice(1)||null}:null
 }).filter(Boolean);
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.join(root,'.runtime/untappd-awards-20260921');
const output=path.join(root,'research/untappd-awards-2026-09-21');
const files=(await readdir(path.join(sourceRoot,'raw'))).sort();
const observations=[],pages=[],links=[];
for(const file of files){
 const full=path.join(sourceRoot,'raw',file),raw=await readFile(full,'utf8');
 if(file.startsWith('links-')){links.push(...resolveLinks(raw).map(r=>({...r,evidence_file:full})));continue}
 if(!file.startsWith('web-'))continue;
 const data=parse(raw),sha=createHash('sha256').update(raw).digest('hex'),observed=(await stat(full)).mtime.toISOString();
 data.records.forEach(r=>{r.provenance.source_file=full;r.provenance.source_sha256=sha;r.provenance.observed_at=observed;});
 observations.push(...data.records);pages.push(...data.reports);
}
const linkMap=new Map(links.map(r=>[r.web_ref+':'+r.link_id,r]));
const codes={'China / People\'s Republic of China':'CN',India:'IN','New Zealand':'NZ','South Africa':'ZA',Japan:'JP',Australia:'AU',Belgium:'BE',Germany:'DE',Brazil:'BR',Canada:'CA','United States':'US',Mexico:'MX',Argentina:'AR'};
for(const r of observations){
 const link=linkMap.get(r.provenance.web_ref+':'+r.provenance.link_id);
 r.drink_id=link?.drink_id||null;r.detail_url=link?.detail_url||null;
 r.producer_id=null;r.award_region_code=codes[r.award_region]||null;
 r.quality_notes=[];
 r.detail_verification=link?{header_available:link.detail_available,first_rating_observed:link.detail_first_rating,evidence_file:link.evidence_file}:null;
 if(link?.detail_first_rating&&(Number(link.detail_first_rating[1])!==r.award_year||Number(link.detail_first_rating[0])!==r.annual_award_rating))r.quality_notes.push('list_detail_rating_or_year_conflict');
 if(r.award_region==='Georgia'){r.award_scope='unknown';r.geographic_eligibility='quarantine';r.quality_notes.push('geographic_scope_ambiguous: US-state breweries appear in Georgia list; not evidence for country GE');}
 if(!r.drink_id)r.quality_notes.push('drink_id_unresolved');
 r.craft_status='not_verified';r.bottle_image_url=null;r.description=null;r.latitude=null;r.longitude=null;
}
// Preserve a directly observed stable ID from the earlier four-page audit only
// when exact source drink and producer names agree; never fuzzy join IDs.
const prior=JSON.parse(await readFile(path.join(root,'.runtime/popular-1000/awards-samples.json'),'utf8'));
for(const r of observations.filter(r=>!r.drink_id)){
 const matches=prior.records.filter(p=>p.name===r.name&&p.producer_name===r.producer_name);
 if(matches.length===1){r.drink_id=matches[0].beer_id;r.detail_url=matches[0].detail_url;r.quality_notes=r.quality_notes.filter(n=>n!=='drink_id_unresolved');r.id_match_evidence=path.join(root,'.runtime/popular-1000/awards-samples.json');}
}
const meta={schema_version:1,created_at:new Date().toISOString(),rating_year:2025,completeness:'partial_public_page_sample_not_full_dataset_or_selected_1000',access:'Public search-indexed/rendered pages. Ordinary direct browser was blocked by a security check; no bypass attempted.',limitations:['Selected first/deeper page sample is not statistically representative.','Page region labels are award geography, not verified production coordinates.','Drink IDs resolved from public page hyperlink targets; a cache miss does not provide detail-page validation.','Unknown award type is preserved; country/state/festival award deduplication is not yet final.','Awards do not certify craft or independent ownership.','No product images or descriptions acquired in this extraction.']};
const identified=observations.filter(r=>r.drink_id),unresolved=observations.filter(r=>!r.drink_id);
const codesWithRecords=[...new Set(observations.map(r=>r.award_region_code).filter(Boolean))];
const summary={...meta,list_observations:observations.length,identified_observations:identified.length,unique_drink_ids:new Set(identified.map(r=>r.drink_id)).size,unresolved_observations:unresolved.length,country_labels_identified:codesWithRecords.length,country_codes:codesWithRecords,geographic_quarantine_rows:observations.filter(r=>r.geographic_eligibility==='quarantine').length,region_counts:Object.fromEntries([...new Set(observations.map(r=>r.award_region))].map(region=>[region,observations.filter(r=>r.award_region===region).length])),list_detail_conflict_rows:observations.filter(r=>r.quality_notes.includes('list_detail_rating_or_year_conflict')).length};
await mkdir(output,{recursive:true});
for(const [name,value] of [['observations.json',{...meta,records:observations}],['identified-awards.json',{...meta,records:identified}],['unresolved-awards.json',{...meta,records:unresolved}],['audit-summary.json',summary],['page-access.json',pages]])await writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

