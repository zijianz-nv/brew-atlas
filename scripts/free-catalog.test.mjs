import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.join(root,'public/data-sources/openbeer');
const data=JSON.parse(readFileSync(path.join(root,'public/data/openbeer.json'),'utf8'));
const {beers,breweries,metadata}=data;
// Python's standard CSV reader handles embedded newlines and quoted source text.
// Read the preserved source independently; never call the importer in these tests.
const raw=JSON.parse(execFileSync('python3',['-c',String.raw`
import csv,html,json,pathlib,re,sys,unicodedata
p=pathlib.Path(sys.argv[1]); out={}
for name in ('beers','breweries','styles','categories','geocodes'):
    with (p/(name+'.csv')).open(encoding='utf-8-sig',newline='') as f:
        out[name]=list(csv.DictReader(f))
for row in out['beers']:
    row['_nameKey']=re.sub(r'\s+',' ',unicodedata.normalize('NFKC',html.unescape(row['name'])).strip()).casefold()
print(json.dumps(out))
`,sourceRoot],{encoding:'utf8',maxBuffer:20*1024*1024}));
const groups=new Map();
for(const row of raw.beers){const key=JSON.stringify([row.brewery_id,row._nameKey]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
const rawById=new Map(raw.beers.map(b=>[b.id,b]));
const rawBreweries=new Map(raw.breweries.map(b=>[b.id,b]));
const breweryById=new Map(breweries.map(b=>[b.id,b]));
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
const validPoint=b=>typeof b.lat==='number'&&typeof b.lng==='number'&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180&&!(b.lat===0&&b.lng===0);
const positive=(value,max)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=max?Number(n.toFixed(4)):null;};
const http=value=>{const u=new URL(value);assert(['https:','http:'].includes(u.protocol));assert(!u.username&&!u.password);};

test('preserved CSV bytes match the manifest and retain both source licenses',()=>{
  const manifest=JSON.parse(readFileSync(path.join(sourceRoot,'manifest.json'),'utf8'));
  const names=new Set(manifest.files.map(f=>f.file));
  for(const name of ['README.md','beers.csv','breweries.csv','styles.csv','categories.csv','geocodes.csv'])assert(names.has(name),`Missing manifest entry: ${name}`);
  for(const entry of manifest.files){
    assert.equal(path.basename(entry.file),entry.file,'Source manifest must use local filenames');
    const bytes=readFileSync(path.join(sourceRoot,entry.file));
    assert.equal(bytes.length,entry.bytes,entry.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.file);
    http(entry.url);
  }
  const readme=readFileSync(path.join(sourceRoot,'README.md'),'utf8');
  assert.match(readme,/Open Database License/);assert.match(readme,/Database Contents License/);
  assert.match(metadata.license.database,/\/odbl\/1-0\//);assert.match(metadata.license.contents,/\/dbcl\/1-0\//);
  const notice=readFileSync(path.join(sourceRoot,'NOTICE.md'),'utf8');
  assert.match(notice,/openbeer\.json/);assert.match(notice,/ODbL/);assert.match(notice,/DbCL/);
});

test('catalog count follows source deduplication and every source row remains traceable',()=>{
  assert(raw.beers.length>1000,'Expected the substantial historical source, not a tiny fixture');
  assert.equal(beers.length,groups.size,'Imported count must match distinct brewery + normalized name groups');
  assert.equal(new Set(beers.map(b=>b.id)).size,beers.length,'Duplicate imported beer id');
  assert.equal(new Set(breweries.map(b=>b.id)).size,breweries.length,'Duplicate imported brewery id');
  assert.equal(breweries.length,raw.breweries.length,'Preserve source brewery records, including those without beer');
  const referenced=[];
  for(const beer of beers){
    assert.equal(beer.collection,'openbeer');assert(nonempty(beer.name));assert(breweryById.has(beer.breweryId),`${beer.id}: orphan brewery`);
    assert(Array.isArray(beer.sourceIds)&&beer.sourceIds.length>0,beer.id);
    const rows=beer.sourceIds.map(id=>{assert(rawById.has(id),`${beer.id}: missing source ${id}`);return rawById.get(id);});
    const group=groups.get(JSON.stringify([rows[0].brewery_id,rows[0]._nameKey]));
    assert.deepEqual([...beer.sourceIds].sort((a,b)=>Number(a)-Number(b)),group.map(r=>r.id).sort((a,b)=>Number(a)-Number(b)),beer.id);
    assert.equal(beer.id,`openbeer-${Math.min(...group.map(r=>Number(r.id)))}`,beer.id);
    assert.equal(beer.breweryId,`openbeer-brewery-${rows[0].brewery_id}`,beer.id);
    referenced.push(...beer.sourceIds);
  }
  assert.equal(referenced.length,raw.beers.length);
  assert.deepEqual([...referenced].sort(),raw.beers.map(b=>b.id).sort(),'No source row omitted or reused');
  assert.equal(metadata.counts.mergedSourceRows,raw.beers.length-groups.size);
  assert.equal(metadata.counts.duplicateGroups,[...groups.values()].filter(g=>g.length>1).length);
});

test('zero, invalid and conflicting source parameters remain unknown',()=>{
  let missing=0;
  for(const beer of beers){
    const rows=beer.sourceIds.map(id=>rawById.get(id));
    for(const [field,max] of [['abv',100],['ibu',1000],['srm',1000]]){
      const candidates=new Set(rows.map(r=>positive(r[field],max)).filter(n=>n!==null));
      if(candidates.size!==1){assert.equal(beer[field],null,`${beer.id}.${field}: absent/conflicting source is unknown`);missing++;}
      else assert.equal(beer[field],[...candidates][0],`${beer.id}.${field}: source value mismatch`);
    }
    const descriptions=rows.map(r=>r.descript).filter(s=>s.trim());
    assert(descriptions.length?descriptions.includes(beer.originalDescription):beer.originalDescription==='',`${beer.id}: description invented or changed`);
    assert.equal(beer.description,beer.originalDescription,beer.id);
  }
  assert(missing>0,'Exercise missing-value behavior on the actual historical source');
});

test('coordinates are supported by consistent original geocodes, never invented for missing locations',()=>{
  const geo=new Map();
  for(const row of raw.geocodes){
    const lat=Number(row.latitude),lng=Number(row.longitude);
    if(!validPoint({lat,lng}))continue;
    if(!geo.has(row.brewery_id))geo.set(row.brewery_id,[]);
    geo.get(row.brewery_id).push({row,lat:Number(lat.toFixed(7)),lng:Number(lng.toFixed(7))});
  }
  let missing=0;
  for(const brewery of breweries){
    const sourceId=brewery.sourceIds[0],source=rawBreweries.get(sourceId);assert(source,brewery.id);
    assert.equal(brewery.countryRaw,source.country,`${brewery.id}: preserve original country/region`);
    assert.equal(brewery.locationPrecision,'historical');assert.equal(brewery.locationRole,'historical_brewery_reference');
    const locations=geo.get(sourceId)||[],pairs=new Set(locations.map(p=>JSON.stringify([p.lat,p.lng])));
    if(pairs.size===1){assert(validPoint(brewery),brewery.id);assert.deepEqual([brewery.lat,brewery.lng],JSON.parse([...pairs][0]),brewery.id);}
    else {assert.equal(brewery.lat,null,brewery.id);assert.equal(brewery.lng,null,brewery.id);missing++;}
    assert.deepEqual([...brewery.locationSourceIds].sort(),locations.map(p=>p.row.id).sort(),brewery.id);
  }
  assert(missing>0,'Exercise unlocated records rather than coercing them to 0,0');
});

test('history, unverified craft identity, absent images and unextracted flavor stay explicit',()=>{
  for(const row of [...beers,...breweries]){
    assert.equal(row.craftStatus,'unknown',row.id);assert.equal(row.operatingStatus,'unknown',row.id);
    assert(Array.isArray(row.sourceUrls)&&row.sourceUrls.length>0,row.id);row.sourceUrls.forEach(http);
    assert.match(row.dataLicense,/ODbL-1\.0/);assert.match(row.dataLicense,/DbCL-1\.0/);
    assert.match(row.sourceNote,/历史/);
  }
  for(const beer of beers){
    for(const field of ['image','imageSource','imageCredit','imageLicenseUrl','imageDownloadUrl'])assert.equal(beer[field],null,`${beer.id}.${field}: no licensed image supplied`);
    for(const field of ['flavors','flavorEvidence','hops','malts','foodPairings'])assert.deepEqual(beer[field],[],`${beer.id}.${field}: do not infer unsupported facts`);
    assert.equal(beer.yeast,null);assert.equal(beer.firstBrewed,null);
    assert.equal(beer.sourceDataUrl,'/data-sources/openbeer/beers.csv');
    assert.match(beer.sourceNote,/2010.*2011/);assert.match(beer.sourceNote,/未核验/);
    assert.deepEqual(beer.sourceModified,beer.sourceIds.map(id=>rawById.get(id).last_mod),beer.id);
  }
  assert.match(metadata.scopeNote,/并非一万款/);assert.equal(metadata.counts.verifiedCraftBeers,0);
});

test('reported coverage and completeness counts equal imported data, not raw totals',()=>{
  for(const [name,rows] of Object.entries(raw))assert.equal(metadata.rawCounts[name],rows.length,name);
  const used=new Set(beers.map(b=>b.breweryId));
  const expected={beers:beers.length,breweries:breweries.length,breweriesWithBeers:used.size,beerImages:beers.filter(b=>b.image).length,beerDescriptions:beers.filter(b=>b.description.trim()).length,beerFlavorTags:beers.filter(b=>b.flavors.length).length,beerAbv:beers.filter(b=>b.abv!==null).length,beerIbu:beers.filter(b=>b.ibu!==null).length,beerSrm:beers.filter(b=>b.srm!==null).length,beersWithHistoricalCoordinates:beers.filter(b=>validPoint(breweryById.get(b.breweryId))).length,breweriesWithHistoricalCoordinates:breweries.filter(validPoint).length};
  for(const [key,value] of Object.entries(expected))assert.equal(metadata.counts[key],value,key);
  assert.equal(metadata.counts.beerLinkedBreweriesWithHistoricalCoordinates,breweries.filter(b=>used.has(b.id)&&validPoint(b)).length,'Map coverage excludes source breweries with no beer records');
  const countries={};for(const b of beers){const country=breweryById.get(b.breweryId).country;countries[country]=(countries[country]||0)+1;}
  assert.deepEqual(metadata.beersByCountryOrHistoricalRegion,countries);
  assert.equal(metadata.counts.beerCountryRegionLabels,Object.keys(countries).filter(c=>c&&c!=='Unknown').length);
  assert.equal(metadata.counts.breweryCountryRegionLabels,new Set(breweries.map(b=>b.country).filter(c=>c&&c!=='Unknown')).size);
});
