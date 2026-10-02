// Stable domain for the complete catalogue, not a range derived from currently
// visible/map-only rows. The source data includes 70% and one unverified 99.99%
// value; keep those records accessible without presenting them as verified.
export const ABV_DOMAIN = Object.freeze({ min: 0, max: 100, step: .1 });
export const ABV_SLIDER_STEPS = 1000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validDomain = domain => Number.isFinite(domain?.min) && Number.isFinite(domain?.max)
  && domain.min >= 0 && domain.max <= 100 && domain.max > domain.min
  && Number.isFinite(domain.step) && domain.step > 0;
const snap = (value, domain) => Number((domain.min + Math.round((value - domain.min) / domain.step) * domain.step).toFixed(8));

export function normalizeAbvRange(range, domain = ABV_DOMAIN) {
  if (range == null || !validDomain(domain) || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const min = clamp(snap(Math.min(range.min, range.max), domain), domain.min, domain.max);
  const max = clamp(snap(Math.max(range.min, range.max), domain), domain.min, domain.max);
  return { min, max };
}

export function matchesAbvRange(beer, range) {
  if (range == null) return true; // Unknown values remain in the unfiltered catalogue.
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) return false;
  const abv = beer?.abv;
  return Number.isFinite(abv) && abv >= 0 && abv <= 100 && abv >= range.min && abv <= range.max;
}

// A square-root scale gives common 0–15% beers ~39% of the track, while retaining
// the full 0–100% domain. Values and keyboard steps are always actual % ABV.
export function abvToSliderPosition(value, domain = ABV_DOMAIN) {
  if (!validDomain(domain) || !Number.isFinite(value)) return 0;
  const fraction = (clamp(value, domain.min, domain.max) - domain.min) / (domain.max - domain.min);
  return Math.sqrt(fraction) * ABV_SLIDER_STEPS;
}

export function sliderPositionToAbv(position, domain = ABV_DOMAIN) {
  if (!validDomain(domain) || !Number.isFinite(position)) return null;
  const fraction = clamp(position / ABV_SLIDER_STEPS, 0, 1);
  return clamp(snap(domain.min + fraction ** 2 * (domain.max - domain.min), domain), domain.min, domain.max);
}

export function formatAbv(value) {
  return Number.isFinite(value) ? `${Number(value.toFixed(1))}%` : '未提供';
}
