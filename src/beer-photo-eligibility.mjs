// Keep the source image and incomplete catalogue records, but only present
// photographs when the beer itself has an introduction the user can read.
const missing = /^(?:暂无(?:酒款)?(?:介绍|描述)|(?:来源)?未提供(?:酒款)?(?:介绍|描述)?|待补充|未知|unknown|null|none|n\/?a|no description(?: available| provided)?|description (?:unavailable|coming soon))$/i;
const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim() : '';
export function beerIntroduction(beer) {
  for (const value of [beer?.description, beer?.originalDescription]) {
    const text = plain(value), normalized = text.replace(/[.!。！]+$/u, '').trim();
    if (normalized && /\p{L}/u.test(normalized) && !missing.test(normalized)
      && normalized.toLocaleLowerCase() !== plain(beer?.name).toLocaleLowerCase()) return text;
  }
  return '';
}
export const hasBeerIntroduction = beer => Boolean(beerIntroduction(beer));
export const hasDescribedPhoto = beer => typeof beer?.image === 'string' && Boolean(beer.image.trim()) && hasBeerIntroduction(beer);
