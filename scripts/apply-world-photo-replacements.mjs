import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

/** Apply exact-product replacement photos without transferring the old photo's license. */
export async function applyWorldPhotoReplacements(catalog, {root, registry} = {}) {
  registry ||= JSON.parse(await readFile(resolve(root, 'public/data-sources/world-photo-replacements.json'), 'utf8'));
  const byId = new Map(catalog.beers.map(beer => [beer.id, beer]));
  const seen = new Set(), updates = [];
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const asset = async (path, expectedHash) => {
    if (typeof path !== 'string' || !path.startsWith('/images/') || path.includes('..')
      || !/^[a-f0-9]{64}$/.test(expectedHash || '')) throw new Error('Invalid replacement asset or hash');
    const bytes = await readFile(resolve(root, 'public', path.slice(1)));
    if (digest(bytes) !== expectedHash) throw new Error(`Replacement asset hash changed: ${path}`);
    return bytes;
  };
  for (const entry of registry.images) {
    const beer = byId.get(entry.beerId);
    if (!beer || seen.has(entry.beerId) || entry.reviewed !== true)
      throw new Error(`Unreviewed, duplicate or unknown photo replacement: ${entry.beerId}`);
    seen.add(entry.beerId);
    // Never match names or sourceRecordIds: merged products may already have a
    // better photograph. A source change must be reviewed, not silently replaced.
    if (beer.image !== entry.previousImage)
      throw new Error(`Replacement source no longer matches: ${entry.beerId}`);
    if (!/^https?:\/\//.test(entry.sourceUrl || '') || !/^https?:\/\//.test(entry.imageDownloadUrl || '')
      || !entry.imageCredit || !entry.imageContentBounds?.bounds
      || entry.imageEvidence?.originalSha256 !== entry.sourceSha256
      || entry.imageEvidence?.sha256 !== entry.sha256)
      throw new Error(`Missing replacement provenance or framing: ${entry.beerId}`);
    await asset(entry.previousImage, entry.previousSha256);
    await asset(entry.sourceImage, entry.sourceSha256);
    await asset(entry.newImage, entry.sha256);
    const full = await asset(entry.imageOriginal, entry.fullSha256);
    if (full.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || full[25] !== 6)
      throw new Error(`Expected transparent RGBA replacement: ${entry.beerId}`);
    const thumbnail = await asset(entry.imageThumbnail, entry.thumbnailSha256);
    if (!thumbnail.length || thumbnail.length > 10000)
      throw new Error(`Replacement map thumbnail exceeds 10KB: ${entry.beerId}`);
    updates.push([beer, entry]);
  }
  // Finish validating the entire batch before mutating any catalog record.
  const oldImageFields = ['image', 'imageOriginal', 'imageThumbnail', 'imageSource', 'imageCredit',
    'imageLicenseUrl', 'imageLicense', 'imageKind', 'imageDownloadUrl', 'imageEvidence',
    'imageContentBounds', 'imageCacheStatus', 'imageCache', 'imageDerivation', 'imageBeforeCutout'];
  for (const [beer, entry] of updates) {
    beer.imageBeforeReplacement = structuredClone(Object.fromEntries(oldImageFields
      .filter(key => beer[key] != null).map(key => [key, beer[key]])));
    for (const key of oldImageFields) delete beer[key];
    Object.assign(beer, {
      image: entry.newImage, imageOriginal: entry.imageOriginal, imageThumbnail: entry.imageThumbnail,
      imageSource: entry.sourceUrl, imageDownloadUrl: entry.imageDownloadUrl, imageCredit: entry.imageCredit,
      imageKind: 'product_photo', imageEvidence: structuredClone(entry.imageEvidence),
      imageContentBounds: structuredClone(entry.imageContentBounds),
      imageCacheStatus: 'cached', needsBackgroundRemoval: false,
      imageDerivation: {
        method: entry.processing?.method || 'reviewed-exact-product-photo-replacement',
        sourceImage: entry.sourceImage, sourceSha256: entry.sourceSha256,
        previousImage: entry.previousImage, previousSha256: entry.previousSha256,
        fullResolutionImage: entry.imageOriginal, fullResolutionSha256: entry.fullSha256,
        originalFileRetained: true, newSourceRGBPreserved: true, oldSourceRGBPreservedInDisplay: false,
        notice: '/data-sources/world-photo-replacements.json',
      },
    });
    if (entry.imageLicenseUrl) beer.imageLicenseUrl = entry.imageLicenseUrl;
  }
  return updates.map(([beer]) => beer.id);
}
