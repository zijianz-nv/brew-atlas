import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

export async function applyMapThumbnails(catalog,{root,registry}={}){
  registry ||= JSON.parse(await readFile(resolve(root,'public/data-sources/map-thumbnails.json'),'utf8'));
  const entries=new Map(registry.entries.map(entry=>[entry.sourcePath,entry]));
  const checked=new Map(),audit={records:0,uniqueThumbnails:0,maximumBytes:0,totalUniqueBytes:0};
  const paths=new Set();
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const asset=async path=>{
    if(typeof path!=='string'||!path.startsWith('/images/')||path.includes('..'))throw new Error('Invalid map-thumbnail path');
    if(!checked.has(path))checked.set(path,readFile(resolve(root,'public',path.slice(1))).then(bytes=>({length:bytes.length,sha256:digest(bytes)})));
    return checked.get(path);
  };
  for(const beer of catalog.beers){
    if(!beer.image)continue;
    const entry=entries.get(beer.image);
    if(!entry)throw new Error(`Missing 10KB map thumbnail for ${beer.id}; run scripts/build-map-thumbnails.py`);
    const [source,thumbnail]=await Promise.all([asset(entry.sourcePath),asset(entry.thumbnail)]);
    if(source.sha256!==entry.sourceSha256||thumbnail.sha256!==entry.thumbnailSha256)
      throw new Error(`Stale map-thumbnail source or bytes for ${beer.id}`);
    if(!thumbnail.length||thumbnail.length>10000)throw new Error(`Map thumbnail exceeds 10KB: ${beer.id}`);
    beer.imageThumbnail=entry.thumbnail;
    audit.records++;
    if(!paths.has(entry.thumbnail)){paths.add(entry.thumbnail);audit.totalUniqueBytes+=thumbnail.length;}
    audit.maximumBytes=Math.max(audit.maximumBytes,thumbnail.length);
  }
  audit.uniqueThumbnails=paths.size;
  return audit;
}
