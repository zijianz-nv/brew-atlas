// Map-photo display priority, not a new score or an eligibility filter. Only the
// imported BeerTasting 0–5 scale is comparable here. Review counts must come from
// ratingsCount (source ratings_count), never cheers, likes or a different scale.
function ratingEvidence(beer) {
  if (beer?.collection !== 'beertasting' || !Number.isFinite(beer.rating)
    || beer.rating < 0 || beer.rating > 5 || !Number.isSafeInteger(beer.ratingsCount)
    || beer.ratingsCount <= 0) return null;
  return { tier: beer.ratingsCount >= 10 ? 2 : 1, rating: beer.rating, count: beer.ratingsCount };
}

/**
 * 10+ reviews first, then 1–9 reviews, then unknown/unrated. Within a rated tier,
 * prefer higher original ratings and then more reviews. IDs break ties so the
 * same data has the same order at every zoom and on every animation frame.
 * Unknown items remain eligible; zero is a valid rating with a positive count.
 */
export function compareBeerPhotoRank(a, b) {
  // Curated awards are comparable as accolades, not as cross-country/style
  // numeric scores. Keep each annual rating attached to its award in details.
  const awardTier = beer => Math.max(0,...(beer?.awards || []).filter(award =>
    Number.isInteger(award.ratingYear) && award.region && award.style
  ).map(award => ({gold:3,silver:2,bronze:1}[String(award.medal).toLowerCase()] || 0)));
  const accoladeDifference = awardTier(b) - awardTier(a);
  if (accoladeDifference) return accoladeDifference;
  // Sales status requires a cited claim; neither ratings nor check-ins prove sales.
  const bestseller = beer => Boolean(/^https?:\/\//.test(beer?.salesEvidence?.sourceUrl||'')
    && /^(best_seller|bestseller|sales_rank)$/.test(beer.salesEvidence.kind)
    && beer.salesEvidence.claim);
  const salesDifference = Number(bestseller(b)) - Number(bestseller(a));
  if (salesDifference) return salesDifference;
  const curated = beer => (beer?.collections || [beer?.collection]).some(c => c === 'awards' || c === 'representative');
  // Legacy source-specific ranking remains for archived regression fixtures.
  const curatedDifference = Number(curated(b)) - Number(curated(a));
  if (curatedDifference) return curatedDifference;
  const left = ratingEvidence(a), right = ratingEvidence(b);
  const tierDifference = (right?.tier || 0) - (left?.tier || 0);
  if (tierDifference) return tierDifference;
  if (left && right) {
    const ratingDifference = right.rating - left.rating;
    if (ratingDifference) return ratingDifference;
    const countDifference = right.count - left.count;
    if (countDifference) return countDifference;
  }
  const leftId = String(a?.id ?? ''), rightId = String(b?.id ?? '');
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}
