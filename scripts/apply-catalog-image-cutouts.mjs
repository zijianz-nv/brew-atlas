import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

/** Apply reviewed exact-ID image replacements after restoring the old snapshots. */
export async function applyCatalogImageCutouts(catalog, {root, registry} = {}) {
  registry ||= JSON.parse(await readFile(resolve(root,'public/data-sources/image-cutouts/catalog-cutouts.json'),'utf8'));
  const byId = new Map(catalog.beers.map(beer => [beer.id,beer])), updates = [];
  const asset = async (path, hash) => {
    if (typeof path !== 'string' || !path.startsWith('/images/') || path.includes('..')) throw new Error('Invalid cutout asset');
    const bytes = await readFile(resolve(root,'public',path.slice(1)));
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Cutout hash changed: ${path}`);
    return bytes;
  };
  const ids = new Set();
  for (const entry of registry.images) {
    const beer = byId.get(entry.beerId);
    if (!beer || ids.has(entry.beerId) || entry.reviewed !== true || entry.originalRGBunchanged !== true)
      throw new Error(`Unreviewed or unknown cutout: ${entry.beerId}`);
    ids.add(entry.beerId);
    const sourceField = entry.sourceField || 'image';
    if (!['image','imageOriginal'].includes(sourceField) || beer[sourceField] !== entry.sourceImage)
      throw new Error(`Cutout source no longer matches: ${entry.beerId}`);
    await asset(entry.sourceImage,entry.sourceSha256);
    const png = await asset(entry.imageFull,entry.fullSha256);
    if (png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png[25] !== 6) throw new Error('Expected transparent RGBA cutout');
    await asset(entry.image,entry.sha256);await asset(entry.imageThumbnail,entry.thumbnailSha256);
    if (!entry.imageContentBounds?.bounds) throw new Error('Missing cutout framing');
    updates.push([beer,entry]);
  }
  for (const [beer,entry] of updates) {
    beer.imageBeforeCutout=Object.fromEntries(['image','imageOriginal','imageThumbnail','imageEvidence','imageContentBounds','imageCacheStatus','imageCredit'].filter(key=>beer[key]!=null).map(key=>[key,beer[key]]));
    Object.assign(beer,{image:entry.image,imageOriginal:entry.imageFull,imageThumbnail:entry.imageThumbnail,
      imageContentBounds:entry.imageContentBounds,imageCacheStatus:'cached',needsBackgroundRemoval:false});
    beer.imageEvidence={...beer.imageEvidence,sha256:entry.sha256,originalSha256:entry.sourceSha256,
      sourceImageSha256:entry.sourceSha256,cacheStatus:'cached',derivative:true,originalFileRetained:true,originalBytesPreserved:false};
    beer.imageDerivation={method:entry.method,sourceImage:entry.sourceImage,sourceField:entry.sourceField||'image',sourceSha256:entry.sourceSha256,
      fullResolutionImage:entry.imageFull,fullResolutionSha256:entry.fullSha256,rgbPixelsUnchanged:true,
      notice:'/data-sources/image-cutouts/catalog-cutouts.json'};
  }
  return updates.map(([beer])=>beer.id);
}
