#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
import {applyCatalogImageCutouts} from './apply-catalog-image-cutouts.mjs';
import {applyWorldPhotoReplacements} from './apply-world-photo-replacements.mjs';
import {applyMapThumbnails} from './apply-map-thumbnails.mjs';
import {beerLaunchYear} from '../src/beer-launch-year.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const unique=items=>[...new Set(items.filter(Boolean))];
const http=url=>typeof url==='string'&&/^https?:\/\//.test(url);
const located=b=>Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const blank=x=>x==null||x===''||(Array.isArray(x)&&!x.length);
const aliases={
  'sierra-pale':'curated-representative-official-sierra-nevada-pale-ale',
  'coopers-pale':'curated-representative-official-coopers-original-pale-ale',
};
// Both aliases were reviewed against the same official product URL, brewery,
// product identity and ABV in the curated and original world catalogues.
function untappdId(beer) {
  if (/^\d+$/.test(String(beer.untappdId||''))) return String(beer.untappdId);
  for(const url of beer.sourceUrls||[])try {
    const u=new URL(url),m=u.pathname.replace(/\/+/g,'/').match(/^\/b\/[^/]+\/(\d+)(?:\/|$)/);
    if(u.hostname==='untappd.com'&&m)return m[1];
  }catch{}
  return null;
}
function normalizeBrewery(input,collection) {
  const b={...input};
  if(typeof b.locationVerified==='boolean')return b;
  const evidence=b.locationEvidence;
  const supported=collection==='beertasting'
    ?!!evidence?.verifiedAt&&http(evidence.coordinateSourceUrl)&&http(evidence.identitySourceUrl||evidence.sourceListingUrl)
    :['world','archive','off'].includes(collection)&&['brewery','city'].includes(b.locationPrecision)
      &&(b.sourceUrls||[]).some(http);
  b.locationVerified=located(b)&&supported;
  if(collection==='archive'||collection==='off')b.locationRole='brand_reference';
  if(collection==='openbeer'){b.locationVerified=false;b.locationRole='historical_brewery_reference';}
  return b;
}

export function mergeLocalCatalog(inputs,{createdAt=new Date().toISOString()}={}) {
  const beers=new Map(),breweries=new Map(),byUntappd=new Map(),byBarcode=new Map();
  const audit={inputs:[],merged:[],fieldConflicts:[],missingLocalImages:[]};
  // Reviewed 2026-10-02 against these exact products. The old OpenBeer rows
  // contain historical recipe facts and unresolved shared brewery references.
  const reviewedWhites={
    'openbeer-4282':{breweryId:'year1995-allagash-portland',product:'https://www.allagash.com/beer/wheat/white/',history:'https://www.allagash.com/about/our-story/'},
    'openbeer-3839':{breweryId:'year1995-blue-moon-denver-birthplace',product:'https://www.molsoncoors.com/brands/our-brands/blue-moon?region=951',history:'https://www.bluemoonbrewingcompany.com/en-GB/story'},
  };
  const normalizeBeer=(input,collection)=>{
    const providerCollection={'off-pending':'off','beertasting-pending':'beertasting'}[input.snapshotProvider];
    return {...input,collection:providerCollection||input.collection||collection,
      collections:unique([...(input.collections||[]),providerCollection,input.collection||collection]),
      sourceUrls:unique(input.sourceUrls||[]),awards:input.awards||[],
      craftStatus:input.craftStatus||'unknown'};
  };
  for(const {collection,catalog} of inputs){
    audit.inputs.push({collection,records:catalog.beers.length,breweries:catalog.breweries.length,metadata:catalog.metadata});
    for(const input of catalog.breweries){
      const b=normalizeBrewery(input,collection),previous=breweries.get(b.id);
      if(!previous)breweries.set(b.id,b);
      else if(b.id==='openbeer-brewery-442' && b.country==='Jamaica'
        && b.locationEvidence?.identitySourceUrl==='https://www.redstripecorporate.com/company?lang=en'
        && b.lat===17.97138889 && b.lng===-76.79305556) {
        // Reviewed 2026-10-02: legacy record was incorrectly geocoded to Texas.
        breweries.set(b.id,{...previous,...b,sourceUrls:unique([...(previous.sourceUrls||[]),...(b.sourceUrls||[])])});
      }
      else if(!previous.locationVerified&&b.locationVerified)breweries.set(b.id,{...previous,...b,sourceUrls:unique([...(previous.sourceUrls||[]),...(b.sourceUrls||[])])});
      else {
        // An exact brewery ID can supply missing display names without moving
        // an already verified location or replacing its coordinate evidence.
        for(const field of ['nameZh','cityZh','regionZh','countryZh','website'])
          if(blank(previous[field])&&!blank(b[field]))previous[field]=b[field];
        for(const field of ['nameAliases','cityAliases','regionAliases','locationAliases','sourceUrls'])
          if(b[field]?.length)previous[field]=unique([...(previous[field]||[]),...b[field]]);
      }
    }
    for(const input of catalog.beers){
      if(!input.id||!input.name||!breweries.has(input.breweryId))throw new Error(`Invalid local beer ${input.id}`);
      const beer=normalizeBeer(input,collection),uid=untappdId(beer);
      if(uid)beer.untappdId=uid;
      let existing=beers.get(beer.id)||beers.get(aliases[beer.id])||(uid&&byUntappd.get(uid));
      // Packaging barcodes represent product identity, not name similarity.
      if(!existing)for(const code of beer.packagingCodes||[])if(byBarcode.has(String(code))){existing=byBarcode.get(String(code));break;}
      if(existing){
        existing.collections=unique([...existing.collections,...beer.collections]);
        existing.sourceRecordIds=unique([...(existing.sourceRecordIds||[existing.id]),...(beer.sourceRecordIds||[beer.id])]);
        existing.sourceUrls=unique([...existing.sourceUrls,...beer.sourceUrls]);
        existing.packagingCodes=unique([...(existing.packagingCodes||[]),...(beer.packagingCodes||[])]);
        existing.nameAliases=unique([...(existing.nameAliases||[]),beer.name!==existing.name?beer.name:null]);
        existing.mergedSourceRecords=[...(existing.mergedSourceRecords||[]),beer];
        if(!existing.untappdId&&uid)existing.untappdId=uid;
        const fills=[];
        const reviewed=reviewedWhites[beer.id];
        if(reviewed&&existing.id===beer.id&&beer.breweryId===reviewed.breweryId
          &&beer.sourceUrls.includes(reviewed.product)&&beer.sourceUrls.includes(reviewed.history)
          &&beer.descriptionEvidence?.sourceUrl===reviewed.product
          &&beer.launchYearEvidence?.sourceUrl===reviewed.history&&beerLaunchYear(beer)===1995
          &&breweries.get(beer.breweryId)?.countryCode==='US'
          &&breweries.get(beer.breweryId)?.locationVerified===true
          &&beer.imageEvidence?.individuallyVerified===true
          &&beer.image?.startsWith('/images/year-1995-american-whites/')) {
          const fields=['breweryId','abv','ibu','description','descriptionBasis','descriptionEvidence',
            'style','styleZh','flavors','flavorEvidence','hops','malts','yeast','foodPairings',
            'craftStatus','catalogRole','locationEvidence','launchYearEvidence','sourceNote',
            'image','imageOriginal','imageThumbnail','imageSource','imageCredit','imageKind',
            'imageEvidence','imageContentBounds','imageLicense','imageLicenseUrl','imageCacheStatus','imageDownloadUrl'];
          for(const field of fields)if(Object.hasOwn(beer,field)) {
            if(!blank(existing[field])&&JSON.stringify(existing[field])!==JSON.stringify(beer[field]))
              audit.fieldConflicts.push({id:existing.id,sourceId:beer.id,field,retained:beer[field],previous:existing[field],resolution:'reviewed_official_1995_white'});
            existing[field]=beer[field];fills.push(field);
          }
          // The original historical description and merged source snapshot stay
          // available; only these now-obsolete missing-data flags are removed.
          if(existing.dataQualityFlags)existing.dataQualityFlags=existing.dataQualityFlags.filter(flag=>
            !['image_unavailable','craft_status_unknown','flavors_not_extracted',...(beer.ibu!=null?['ibu_unknown']:[])].includes(flag));
        }
        if(['unknown','not_verified',null,undefined,''].includes(existing.craftStatus)
          &&beer.craftStatus&&!['unknown','not_verified'].includes(beer.craftStatus)) {
          existing.craftStatus=beer.craftStatus;fills.push('craftStatus');
        }
        if(blank(existing.catalogRole)&&!blank(beer.catalogRole))existing.catalogRole=beer.catalogRole;
        for(const field of ['abv','ibu','description','originalDescription','style','styleZh','hops','malts','yeast','foodPairings']){
          if(blank(existing[field])&&!blank(beer[field])){existing[field]=beer[field];fills.push(field);}
          else if(['abv','ibu'].includes(field)&&!blank(existing[field])&&!blank(beer[field])&&existing[field]!==beer[field])
            audit.fieldConflicts.push({id:existing.id,sourceId:beer.id,field,retained:existing[field],candidate:beer[field]});
        }
        if(fills.includes('description')&&http(beer.descriptionEvidence?.sourceUrl)
          &&beer.sourceUrls.includes(beer.descriptionEvidence.sourceUrl)) {
          existing.descriptionEvidence=beer.descriptionEvidence;
          if(beer.descriptionBasis)existing.descriptionBasis=beer.descriptionBasis;
        }
        // Image identity and location are never inferred from a shared brewery name.
        if(!existing.image&&beer.image){
          for(const field of ['image','imageOriginal','imageThumbnail','imageSource','imageCredit','imageKind','imageEvidence','imageContentBounds','imageLicenseUrl','imageCacheStatus','imageDownloadUrl','imageBeforeCutout','imageDerivation'])if(beer[field]!=null)existing[field]=beer[field];
          // This exact generated intake status is obsolete once a reviewed
          // photograph arrives. The original intake remains in its snapshot.
          const pendingNote='Untappd 公开获奖列表；按评分年份记录。独立精酿属性、酒款介绍、图片及酒厂坐标尚待核验。';
          if(existing.sourceNote===pendingNote)existing.sourceNote=beer.sourceNote&&beer.sourceNote!==pendingNote?beer.sourceNote:'Untappd 公开获奖列表；评分年度不变。已补充有来源的实物图；介绍、位置和独立精酿属性以各自核验字段为准。';
          fills.push('image');
        }
        // Product labels remain separate from bottle/can photography. Retaining
        // a label must never make a photo-less award appear as a map bottle.
        for(const field of ['labelImage','labelImageOriginal','labelImageSource','labelEvidence'])
          if(blank(existing[field])&&!blank(beer[field])){existing[field]=beer[field];fills.push(field);}
        if(beer.sourceConflicts?.length)existing.sourceConflicts=[...(existing.sourceConflicts||[]),...beer.sourceConflicts];
        if(beer.sensoryFacts?.length){
          const facts=new Map([...(existing.sensoryFacts||[]),...beer.sensoryFacts].map(fact=>[
            `${fact.dimension}:${fact.id}:${fact.sourceUrl}`,fact]));
          existing.sensoryFacts=[...facts.values()];
          fills.push('sensoryFacts');
        }
        if(fills.length){
          existing.sourceNote=unique([existing.sourceNote,beer.sourceNote]).join(' ');
          existing.mergedFieldSources=[...(existing.mergedFieldSources||[]),{sourceId:beer.id,fields:fills,sourceUrls:beer.sourceUrls}];
        }
        audit.merged.push({sourceId:beer.id,targetId:existing.id,reason:uid&&uid===existing.untappdId?'untappd_id':aliases[beer.id]?'reviewed_official_product':'source_id_or_barcode'});
        if(uid)byUntappd.set(uid,existing);
        for(const code of existing.packagingCodes||[])byBarcode.set(String(code),existing);
      }else{
        beers.set(beer.id,beer);
        if(uid)byUntappd.set(uid,beer);
        for(const code of beer.packagingCodes||[])byBarcode.set(String(code),beer);
      }
    }
  }
  const list=[...beers.values()],used=new Set(list.map(b=>b.breweryId));
  const breweryList=[...breweries.values()].filter(b=>used.has(b.id));
  const counts={beers:list.length,breweries:breweryList.length,
    awardsBeers:list.filter(b=>b.collections.includes('awards')).length,
    representativeBeers:list.filter(b=>b.collections.includes('representative')).length,
    overlappingBeers:list.filter(b=>b.collections.includes('awards')&&b.collections.includes('representative')).length,
    picturedBeers:list.filter(hasDescribedPhoto).length,
    mapReadyBeers:list.filter(b=>hasDescribedPhoto(b)&&breweries.get(b.breweryId).locationVerified).length,
    countries:new Set(breweryList.map(b=>b.country).filter(Boolean)).size};
  const collections={};for(const beer of list)for(const c of beer.collections)collections[c]=(collections[c]||0)+1;
  const metadata={id:'local-all-v1',schemaVersion:3,createdAt,scope:'all_existing_local_beer_records',
    counts,collectionCounts:collections,legacyCatalogsLoaded:true,partial:true,targetRepresentativeCount:1000,
    completeness:{images:list.filter(b=>!!b.image).length,descriptions:list.filter(b=>b.description||b.originalDescription).length,
      abv:list.filter(b=>Number.isFinite(b.abv)).length,ibu:list.filter(b=>Number.isFinite(b.ibu)).length,
      mapReadyBeers:counts.mapReadyBeers,notMapReadyBeers:list.length-counts.mapReadyBeers},
    identityNote:'Exact source IDs, reviewed official products, Untappd IDs and packaging barcodes are merged. Remaining cross-source names are not guaranteed distinct beers.',
    representativeStatus:'editorial_seeds_not_completed_top_1000',
    sourceSnapshots:audit.inputs.map(x=>({collection:x.collection,records:x.records,metadata:x.metadata})),
    mergedRecordCount:audit.merged.length,
    limitations:['收录本地已有目录与历史快照，获奖和代表仅为筛选标签。','记录总数不等于已确认独立精酿的数量；跨来源名称尚有未确认重复。',
      '图片与参考位置缺失的记录仍在酒库搜索，地图仅显示有介绍且位置有据的本地图。','历史配方、包装商品和历史酒厂状态按来源标注，不当作全部现售商品。']};
  return {catalog:{metadata,breweries:breweryList,beers:list},audit};
}

export async function writeLocalCatalog(){
  const paths=[['curated','public/data/curated.json'],...['world','archive','beertasting','off','openbeer','regional'].map(c=>[c,`public/data/${c}.json`]),
    ['local','research/local-catalog/imported-snapshots.json'],['local','research/local-catalog/imported-additional.json'],
    ['awards','public/data/award-supplements.json'],['regional','public/data/country-expansion.json'],
    ['regional','public/data/siberia-expansion.json'],
    ['regional','public/data/global-country-supplements.json'],
    ['regional','public/data/global-country-wave2.json'],
    ...['asia-europe','africa','americas-oceania'].map(region=>['regional',`public/data-sources/global-coverage-${region}.json`]),
    ...['year-1995-american-whites','year-1995-lagunitas','sparse-asia-20261002','sparse-south-america-20261002','sparse-africa-20261002','sparse-far-east-20261002','sparse-interior-20261002'].map(name=>['regional',`public/data-sources/${name}.json`]),
    ['regional','public/data/china-country-supplements.json'],
    ['awards','public/data/award-asia-supplements.json'],
    ['awards','public/data/award-americas-supplements.json'],
    ['awards','public/data/award-europe-africa-supplements.json'],
    ['awards','public/data/award-oceania-supplements.json'],
    ['awards','public/data/award-sensory-supplements.json'],
    ['beertasting','public/data-sources/singapore-details-20261002.json']];
  const inputs=await Promise.all(paths.map(async([collection,path])=>({collection,catalog:JSON.parse(await readFile(resolve(root,path),'utf8'))})));
  const {catalog,audit}=mergeLocalCatalog(inputs);
  const sales=JSON.parse(await readFile(resolve(root,'public/data-sources/beer-sales-evidence.json'),'utf8'));
  const salesById=new Map((sales.entries||[]).map(entry=>[entry.beerId,entry]));
  for(const beer of catalog.beers){const evidence=salesById.get(beer.id);if(evidence&&http(evidence.sourceUrl)&&evidence.claim)beer.salesEvidence=evidence;}
  audit.salesEvidenceCount=catalog.beers.filter(beer=>beer.salesEvidence).length;
  const yearById=new Map();
  for(const name of ['beer-launch-years-existing','beer-launch-years']){
    const source=JSON.parse(await readFile(resolve(root,`public/data-sources/${name}.json`),'utf8'));
    for(const entry of source.entries||[]){
      if(beerLaunchYear({launchYearEvidence:entry})==null)throw new Error(`Invalid product launch-year evidence: ${entry.beerId}`);
      const id=aliases[entry.beerId]||entry.beerId,previous=yearById.get(id);
      if(previous&&previous.year!==entry.year)throw new Error(`Conflicting product launch year: ${id}`);
      yearById.set(id,entry);
    }
  }
  const catalogIds=new Set(catalog.beers.map(beer=>beer.id));
  for(const id of yearById.keys())if(!catalogIds.has(id))throw new Error(`Unknown launch-year product: ${id}`);
  for(const beer of catalog.beers)if(yearById.has(beer.id))beer.launchYearEvidence=yearById.get(beer.id);
  audit.launchYearEvidenceCount=catalog.beers.filter(beer=>beerLaunchYear(beer)!=null).length;
  audit.imageCutouts=await applyCatalogImageCutouts(catalog,{root});
  audit.worldPhotoReplacements=await applyWorldPhotoReplacements(catalog,{root});
  audit.mapThumbnails=await applyMapThumbnails(catalog,{root});
  const files=new Map();
  const localAssetFields=['image','imageOriginal','imageThumbnail','labelImage','labelImageOriginal'];
  for(const beer of catalog.beers)for(const key of localAssetFields){
    const asset=beer[key];if(!asset)continue;
    if(!asset.startsWith('/images/')||asset.includes('..')){beer[key]=null;continue;}
    if(!files.has(asset))files.set(asset,stat(resolve(root,'public',asset.slice(1))).then(s=>s.isFile(),()=>false));
  }
  await Promise.all(files.values());
  for(const beer of catalog.beers)for(const key of localAssetFields)if(beer[key]&&!await files.get(beer[key])){
    audit.missingLocalImages.push({id:beer.id,field:key,path:beer[key]});beer[key]=null;
  }
  if(audit.missingLocalImages.length)throw new Error(`Missing ${audit.missingLocalImages.length} referenced image files`);
  const data=JSON.stringify(catalog);
  await mkdir(resolve(root,'research/local-catalog'),{recursive:true});
  await writeFile(resolve(root,'public/data/catalog.json'),data);
  await writeFile(resolve(root,'public/data/catalog.json.gz'),gzipSync(data,{level:9}));
  await writeFile(resolve(root,'research/local-catalog/merge-audit.json'),JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify({bytes:Buffer.byteLength(data),...catalog.metadata.counts,collections:catalog.metadata.collectionCounts,merged:audit.merged.length}));
  return catalog;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await writeLocalCatalog();
