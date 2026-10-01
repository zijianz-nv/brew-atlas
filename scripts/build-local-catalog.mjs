#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

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
      else if(!previous.locationVerified&&b.locationVerified)breweries.set(b.id,{...previous,...b,sourceUrls:unique([...(previous.sourceUrls||[]),...(b.sourceUrls||[])])});
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
        for(const field of ['abv','ibu','description','originalDescription','style','styleZh','hops','malts','yeast','foodPairings']){
          if(blank(existing[field])&&!blank(beer[field])){existing[field]=beer[field];fills.push(field);}
          else if(['abv','ibu'].includes(field)&&!blank(existing[field])&&!blank(beer[field])&&existing[field]!==beer[field])
            audit.fieldConflicts.push({id:existing.id,sourceId:beer.id,field,retained:existing[field],candidate:beer[field]});
        }
        if(fills.length){
          existing.sourceNote=[existing.sourceNote,beer.sourceNote].filter(Boolean).join(' ');
          existing.mergedFieldSources=[...(existing.mergedFieldSources||[]),{sourceId:beer.id,fields:fills,sourceUrls:beer.sourceUrls}];
        }
        // Image identity and location are never inferred from a shared brewery name.
        if(!existing.image&&beer.image){
          for(const field of ['image','imageOriginal','imageThumbnail','imageSource','imageCredit','imageEvidence','imageContentBounds','imageLicenseUrl'])if(beer[field]!=null)existing[field]=beer[field];
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
  const paths=[['curated','public/data/curated.json'],...['world','archive','beertasting','off','openbeer'].map(c=>[c,`public/data/${c}.json`]),
    ['local','research/local-catalog/imported-snapshots.json'],['local','research/local-catalog/imported-additional.json']];
  const inputs=await Promise.all(paths.map(async([collection,path])=>({collection,catalog:JSON.parse(await readFile(resolve(root,path),'utf8'))})));
  const {catalog,audit}=mergeLocalCatalog(inputs);
  const files=new Map();
  for(const beer of catalog.beers)for(const key of ['image','imageOriginal','imageThumbnail']){
    const asset=beer[key];if(!asset)continue;
    if(!asset.startsWith('/images/')||asset.includes('..')){beer[key]=null;continue;}
    if(!files.has(asset))files.set(asset,stat(resolve(root,'public',asset.slice(1))).then(s=>s.isFile(),()=>false));
  }
  await Promise.all(files.values());
  for(const beer of catalog.beers)for(const key of ['image','imageOriginal','imageThumbnail'])if(beer[key]&&!await files.get(beer[key])){
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
