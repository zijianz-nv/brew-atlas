import {hasDescribedPhoto} from './beer-photo-eligibility.mjs';
import {createBeerPhotoIdentityIndex, isReviewedGenericBeerPhoto} from './beer-photo-identity.mjs';

const placeholderAsset = /(?:^|[\/_.-])(?:placeholder|no[-_]?(?:image|photo)|image[-_]?unavailable|default[-_]?(?:beer|image|photo)|beer[-_]?default|draught[-_]?beer|brewery[-_]?logo)(?:[\/_.-]|$)|(?:^|\/)(?:default|logo)(?:\.[a-z0-9]+)?$/i;
const placeholderKind = /^(?:placeholder|generic(?:_draught)?_placeholder|generic_draught|logo|brewery_logo|brand_logo)$/i;
const failedStatus = /^(?:failed|error|missing|unavailable|not_found|download_failed)$/i;

function imageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (!text.startsWith('/') && !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text, 'https://brew-atlas.invalid');
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

/** A recommendation must show a photo under the same introduction rule as the UI. */
export function hasRecommendableBeerPhoto(beer, {identityIndex} = {}) {
  if (!hasDescribedPhoto(beer) || !imageUrl(beer.image)) return false;
  if (isReviewedGenericBeerPhoto(beer) || identityIndex?.isGeneric(beer)) return false;
  const evidence = beer.imageEvidence || {};
  if (beer.imagePlaceholder === true || evidence.isPlaceholder === true) return false;
  if ([beer.imageKind, evidence.kind, evidence.photoType].some(kind => typeof kind === 'string' && placeholderKind.test(kind))) return false;
  if ([beer.imageCacheStatus, evidence.cacheStatus, evidence.downloadStatus].some(status => typeof status === 'string' && failedStatus.test(status))) return false;
  return ![beer.image, beer.imageOriginal, beer.imageThumbnail, beer.imageDownloadUrl]
    .map(imageUrl).filter(Boolean).some(url => placeholderAsset.test(url.pathname));
}

/** Keep the caller's filtered scope and records; never restore hidden source rows. */
export function recommendableBeerCandidates(beers, {identityIndex} = {}) {
  const index = identityIndex || createBeerPhotoIdentityIndex(beers);
  return beers.filter(beer => hasRecommendableBeerPhoto(beer, {identityIndex: index}));
}

export function chooseRandomBeer(candidates, {selectedId = null, random = Math.random} = {}) {
  if (!candidates.length) return null;
  const alternatives = candidates.filter(beer => beer.id !== selectedId);
  const pool = alternatives.length ? alternatives : candidates;
  return pool[Math.floor(random() * pool.length)] || null;
}
