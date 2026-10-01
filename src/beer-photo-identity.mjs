import {beerIntroduction, hasDescribedPhoto} from './beer-photo-eligibility.mjs';
import {compareBeerPhotoRank} from './beer-ranking.mjs';
import {withoutBasePath} from './base-path.mjs';

const sha256 = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const nonempty = value => typeof value === 'string' && Boolean(value.trim());

// Reviewed against cached original PNGs on 2026-09-20. The files have different
// byte hashes, but identical dimensions and decoded RGBA pixels after EXIF
// transpose and zeroing RGB under fully transparent pixels. Both visibly show
// the same generic barrel labeled "DRAUGHT BEER", not a product-specific photo.
// These IDs are source-image evidence, never a fuzzy brand/name grouping.
export const REVIEWED_BEER_PHOTO_GROUPS = Object.freeze([Object.freeze({
  kind: 'generic_draught_placeholder',
  reviewedAt: '2026-09-20',
  decodedRgbaSha256: 'e22ca070be31ba663ad214d78c47e57c848289b83da8c108384da51a5acedb88',
  originalSha256s: Object.freeze([
    '46c0368e342165d4fecf67427dd6ac6e20fa2ba55c4d298fd6061f4a917103c7',
    'c5d68ea44f5be5f131d85590419dd192ac03c1c8d06b2d60dca4f80fab6dd1fd',
  ]),
}), Object.freeze({
  kind: 'reviewed_same_display_photo',
  reviewedAt: '2026-09-20',
  // Visually checked at full size: identical stag/ornament label, neck emblem,
  // bottle and cap. Tiny raster/export differences are not a different label.
  // These are still two distinct recipe records and both return during search.
  note: 'Hinterland and Barrel Aged Hinterland reuse the same depicted bottle/label artwork; no printed product-name difference. Only this reviewed pair is linked.',
  originalSha256s: Object.freeze([
    'cd74f6ca7394ad5006af593ba3834b1c0481cbaaab0ec744bd6328f7d6cfb51c',
    '35dd6c1ab6266e950f618197355d98751e6915acd0be3c8b728ed625b2e41164',
  ]),
  assets: Object.freeze([
    Object.freeze({path:'/images/archive-193.png', sha256:'cd74f6ca7394ad5006af593ba3834b1c0481cbaaab0ec744bd6328f7d6cfb51c'}),
    Object.freeze({path:'/images/archive-222.png', sha256:'35dd6c1ab6266e950f618197355d98751e6915acd0be3c8b728ed625b2e41164'}),
  ]),
})]);
const genericHashKeys = new Set(REVIEWED_BEER_PHOTO_GROUPS.filter(group => group.kind === 'generic_draught_placeholder').flatMap(group => group.originalSha256s.map(value => `sha256:${value}`)));
const reviewedAssetHashes = new Map(REVIEWED_BEER_PHOTO_GROUPS.flatMap(group => (group.assets || []).map(asset => [asset.path, asset.sha256])));

// Preserve query strings: they may select different source photos or crops.
// Fragments do not affect the bytes requested from an image server.
function imageAddress(value) {
  if (!nonempty(value)) return null;
  const text = value.trim();
  if (text.startsWith('/') && !text.startsWith('//')) return text.split('#')[0];
  try {
    const url = new URL(text.startsWith('//') ? `https:${text}` : text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

/** Only actual asset URLs count; a shared brewery/product/source webpage does not. */
export function beerPhotoIdentityKeys(beer) {
  if (!nonempty(beer?.image)) return [];
  const hashes = [beer.imageEvidence?.originalSha256, beer.imageEvidence?.sha256,
    beer.imageCache?.originalSha256, beer.imageCache?.sha256].map(sha256).filter(Boolean);
  const urls = [beer.image, beer.imageOriginal, beer.imageThumbnail, beer.imageDownloadUrl];
  if (/\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(beer.imageSource || '')) urls.push(beer.imageSource);
  const addresses = urls.map(imageAddress).filter(Boolean);
  hashes.push(...addresses.map(url => reviewedAssetHashes.get(withoutBasePath(url))).filter(Boolean));
  return [...new Set([...hashes.map(hash => `sha256:${hash}`), ...addresses.map(url => `asset:${url}`)])];
}

export function isReviewedGenericBeerPhoto(beer) {
  return beerPhotoIdentityKeys(beer).some(key => genericHashKeys.has(key));
}

function completeness(beer) {
  const intro = beerIntroduction(beer);
  const known = value => nonempty(value) && !/^(?:unknown|未知|未提供|n\/?a)$/i.test(value.trim());
  return [Boolean(intro), Number.isFinite(beer.abv), Number.isFinite(beer.ibu), known(beer.style),
    known(beer.yeast), known(beer.firstBrewed), nonempty(beer.imageOriginal),
    ...['hops', 'malts', 'flavors', 'foodPairings', 'sourceUrls'].map(key => Array.isArray(beer[key]) && beer[key].length > 0)]
    .reduce((sum, value) => sum + Number(value), 0);
}

/** Reuse the map's supported rating scale/count tiers, then actual data completeness. */
export function compareBeerPhotoRepresentative(a, b) {
  // The ranking module's ID tie-break must come after completeness here.
  const ratingOrder = compareBeerPhotoRank({...a, id: ''}, {...b, id: ''});
  if (ratingOrder) return ratingOrder;
  const detailOrder = completeness(b) - completeness(a);
  if (detailOrder) return detailOrder;
  return lexical(String(a?.id ?? ''), String(b?.id ?? ''))
    || lexical(String(a?.name ?? ''), String(b?.name ?? ''))
    || lexical(String(a?.image ?? ''), String(b?.image ?? ''));
}

/**
 * Build once for the catalog. Hash and asset aliases are linked transitively:
 * a record with a byte hash connects an unhashed record sharing its source URL.
 * No name, brand, product-page URL or perceptual similarity is used as evidence.
 * Identity labels remain stable when the same index is used after filtering.
 */
export function createBeerPhotoIdentityIndex(beers) {
  const parent = new Map();
  const find = key => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== key) { const next = parent.get(key); parent.set(key, root); key = next; }
    return root;
  };
  const union = (a, b) => {
    const left = find(a), right = find(b);
    if (left !== right) parent.set(right, left);
  };
  for (const beer of beers) {
    const keys = beerPhotoIdentityKeys(beer);
    for (const key of keys) union(keys[0], key);
  }
  for (const group of REVIEWED_BEER_PHOTO_GROUPS) {
    const keys = group.originalSha256s.map(value => `sha256:${value}`);
    if (keys.some(key => parent.has(key))) for (const key of keys) union(keys[0], key);
  }
  const labels = new Map();
  const compareKeys = (a, b) => Number(!a.startsWith('sha256:')) - Number(!b.startsWith('sha256:')) || lexical(a, b);
  for (const key of parent.keys()) {
    const root = find(key), label = labels.get(root);
    if (!label || compareKeys(key, label) < 0) labels.set(root, key);
  }
  const identities = new Map([...parent.keys()].map(key => [key, labels.get(find(key))]));
  const identityFor = beer => {
    const keys = beerPhotoIdentityKeys(beer);
    return keys.map(key => identities.get(key)).filter(Boolean).sort(compareKeys)[0] || keys.sort(compareKeys)[0] || null;
  };
  const genericIdentities = new Set([...genericHashKeys].map(key => identities.get(key)).filter(Boolean));
  const isGeneric = beer => isReviewedGenericBeerPhoto(beer) || genericIdentities.has(identityFor(beer));
  const index = {identityFor, isGeneric, deduplicate: (input, options = {}) => deduplicateBeerPhotos(input, {...options, identityIndex: index})};
  return Object.freeze(index);
}

/**
 * A display-only projection, never a catalog mutation. Search restores all rows.
 * Records without an eligible described image are retained unchanged, so an
 * incomplete entry cannot silently consume a complete entry's display slot.
 */
export function deduplicateBeerPhotos(beers, {searchActive = false, identityIndex} = {}) {
  if (searchActive) return beers.slice();
  const index = identityIndex || createBeerPhotoIdentityIndex(beers);
  const representatives = new Map();
  for (const beer of beers) {
    if (!hasDescribedPhoto(beer)) continue;
    if (index.isGeneric?.(beer) || isReviewedGenericBeerPhoto(beer)) continue;
    const identity = index.identityFor(beer);
    if (!identity) continue;
    const previous = representatives.get(identity);
    if (!previous || compareBeerPhotoRepresentative(beer, previous) < 0) representatives.set(identity, beer);
  }
  const emitted = new Set();
  return beers.filter(beer => {
    if (!hasDescribedPhoto(beer)) return true;
    if (index.isGeneric?.(beer) || isReviewedGenericBeerPhoto(beer)) return false;
    const identity = index.identityFor(beer);
    if (!identity) return true;
    if (representatives.get(identity) !== beer || emitted.has(identity)) return false;
    emitted.add(identity);
    return true;
  });
}
