import {hasDescribedPhoto} from './beer-photo-eligibility.mjs';

// Shared by the UI and deployment packaging so both retain the same images.
export function beerImageSource(beer, variant = 'card') {
  if (!hasDescribedPhoto(beer)) return null;
  if (variant === 'original') return beer.imageEvidence?.derivative ? beer.image : (beer.imageOriginal || beer.image);
  if (variant === 'thumbnail') return beer.imageThumbnail || beer.image;
  return beer.image;
}
